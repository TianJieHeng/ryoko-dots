import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
/** No model prompts: qualify actual installed clients' MCP initialization/discovery. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { query } from '@anthropic-ai/claude-agent-sdk';
const connector = resolve(process.argv[2]);
const dir = mkdtempSync(join(tmpdir(), 'native-mcp-discovery-'));
if (!process.argv[3]) throw Error('Supply a private enrolled worker binding file for authenticated discovery.');
const binding = resolve(process.argv[3]);
// Observe protocol method names only; do not record params, credentials or responses.
const proxy = join(dir, 'observe.py');
writeFileSync(
  proxy,
  `import os,sys,subprocess,threading,json
child=subprocess.Popen([sys.argv[1],sys.argv[2]],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
def forward():
 for line in sys.stdin.buffer:
  try:
   method=json.loads(line).get('method','')
   with open(os.environ['MCP_METHOD_LOG'],'a') as f: f.write(method+'\\n')
  except Exception: pass
  child.stdin.write(line);child.stdin.flush()
 child.stdin.close()
threading.Thread(target=forward,daemon=True).start()
try:
 for line in child.stdout:
  sys.stdout.buffer.write(line);sys.stdout.buffer.flush()
finally:
 child.terminate()
`,
);
const mcp = (kind) => ({
  command: '/usr/bin/python3',
  args: [proxy, process.execPath, connector],
  env: {
    AGENT_CHAT_BINDING_FILE: binding,
    MCP_METHOD_LOG: join(dir, kind + '.log'),
  },
});
const children = [];
function rpc(exe, args) {
  const child = spawn(exe, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  child.stderr.resume();
  let seq = 0;
  const pending = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      return;
    }
    const p = pending.get(r.id);
    if (p) {
      pending.delete(r.id);
      clearTimeout(p.timer);
      if (r.error) p.reject(Error('Native RPC rejected ' + p.method));
      else p.resolve(r.result);
    }
  });
  return {
    notify: (method, params) =>
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n',
      ),
    call: (method, params) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error('Timed out ' + method));
        }, 45000);
        pending.set(id, { resolve, reject, timer, method });
        child.stdin.write(
          JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
        );
      }),
  };
}
function discovered(kind) {
  assert(readFileSync(join(dir, kind + '.log'), 'utf8').includes('tools/list'));
  console.log(
    kind + ': native MCP initialize + tools/list passed (no model prompt)',
  );
}
let stream, release;
try {
  const codex = rpc(join(homedir(), '.local/bin/codex'), ['app-server']);
  await codex.call('initialize', {
    clientInfo: { name: 'worker-mcp-check', version: '1' },
    capabilities: { experimentalApi: true },
  });
  codex.notify('initialized', {});
  const thread = await codex.call('thread/start', {
    cwd: dir,
    ephemeral: true,
    approvalPolicy: 'on-request',
    sandbox: 'workspace-write',
    config: { mcp_servers: { agent_chat: mcp('codex') } },
  });
  const inventory = await codex.call('mcpServerStatus/list', {
    threadId: thread.thread.id,
    serverName: 'agent_chat',
  });
  assert(JSON.stringify(inventory).includes('read_thread'));
  discovered('codex');
  for (const c of children.splice(0)) c.kill('SIGTERM');
  const gate = new Promise((r) => (release = r));
  stream = query({
    prompt: (async function* () {
      yield* [];
      await gate;
    })(),
    options: {
      cwd: dir,
      pathToClaudeCodeExecutable: join(homedir(), '.local/bin/claude'),
      mcpServers: { agent_chat: mcp('claude') },
      settingSources: [],
      permissionMode: 'default',
    },
  });
  await stream.initializationResult();
  let statuses = [];
  for (let i = 0; i < 30; i++) {
    statuses = await stream.mcpServerStatus();
    if (
      statuses.some((s) => s.name === 'agent_chat' && s.status === 'connected')
    )
      break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(
    'Claude connector status:',
    statuses.map((s) => ({ name: s.name, status: s.status })),
  );
  assert(
    statuses.some((s) => s.name === 'agent_chat' && s.status === 'connected'),
  );
  discovered('claude');
  release();
  stream.close();
  stream = undefined;
  const kimi = rpc(join(homedir(), '.kimi-code/bin/kimi'), ['acp']);
  await kimi.call('initialize', {
    protocolVersion: 1,
    clientCapabilities: {},
    clientInfo: { name: 'worker-mcp-check', version: '1' },
  });
  const config = mcp('kimi');
  await kimi.call('session/new', {
    cwd: dir,
    mcpServers: [
      {
        name: 'agent_chat',
        command: config.command,
        args: config.args,
        env: Object.entries(config.env).map(([name, value]) => ({
          name,
          value,
        })),
      },
    ],
  });
  for (let i = 0; i < 30; i++) {
    try {
      if (readFileSync(join(dir, 'kimi.log'), 'utf8').includes('tools/list'))
        break;
    } catch {
      /* Connection may still be initializing. */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  discovered('kimi');
} finally {
  release?.();
  stream?.close();
  for (const c of children) c.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  rmSync(dir, { recursive: true, force: true });
}
