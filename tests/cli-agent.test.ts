import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const sdk = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => sdk);
import { CliAgentAdapter } from '../src/server/hub/cli-agent';
const dirs: string[] = [];
const instances: CliAgentAdapter[] = [];
afterEach(async () => {
  for (const a of instances.splice(0)) await a.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  vi.clearAllMocks();
});
const guard = () => {};
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dots-cli-'));
  dirs.push(dir);
  const config = { kind: 'claude' as const, executable: '/bin/true', cwd: dir };
  const path = join(dir, 'state.sqlite');
  const adapter = new CliAgentAdapter(config, path);
  instances.push(adapter);
  return { adapter, config, path };
}
it('persists native sessions/results and never replays a repeated operation', async () => {
  sdk.query.mockImplementation(() =>
    Object.assign(
      (async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'DONE',
        };
      })(),
      { close() {} },
    ),
  );
  const { adapter, config, path } = fixture();
  const t = await adapter.create('create', 'Task', guard);
  await adapter.submit(t, 'run', 'hello', guard);
  await vi.waitFor(async () =>
    expect((await adapter.inspect(t, 'run', null, guard)).state).toBe(
      'completed',
    ),
  );
  const native = sdk.query.mock.calls[0][0].options.sessionId;
  expect((await adapter.messages(t, undefined, guard)).items.at(-1)?.text).toBe(
    'DONE',
  );
  await adapter.submit(t, 'run', 'hello', guard);
  expect(sdk.query).toHaveBeenCalledTimes(1);
  await adapter.stop();
  instances.splice(instances.indexOf(adapter), 1);
  const resumed = new CliAgentAdapter(config, path);
  instances.push(resumed);
  await resumed.submit(t, 'run', 'hello', guard);
  expect(sdk.query).toHaveBeenCalledTimes(1);
  await resumed.submit(t, 'followup', 'continue', guard);
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(2));
  expect(sdk.query.mock.calls[1][0].options.resume).toBe(native);
  await expect(resumed.submit(t, 'run', 'changed', guard)).rejects.toThrow(
    'intent',
  );
});
it('requires an exact owner decision for tool requests and scopes it to the conversation', async () => {
  sdk.query.mockImplementation(({ options }) =>
    Object.assign(
      (async function* () {
        const answer = await options.canUseTool(
          'Bash',
          { command: 'pwd' },
          { signal: new AbortController().signal },
        );
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: answer.behavior,
        };
      })(),
      { close() {} },
    ),
  );
  const { adapter } = fixture();
  const t = await adapter.create('create', 'Task', guard);
  await adapter.submit(t, 'run', 'execute', guard);
  await vi.waitFor(async () =>
    expect((await adapter.inspect(t, 'run', null, guard)).state).toBe(
      'waiting_approval',
    ),
  );
  const a = adapter.pendingApprovals(t)[0];
  expect(a.description).toContain('pwd');
  expect(() => adapter.approve('other', a.id, true, guard)).toThrow();
  adapter.approve(t, a.id, true, guard);
  expect(() => adapter.approve(t, a.id, true, guard)).toThrow();
  await vi.waitFor(async () =>
    expect((await adapter.inspect(t, 'run', null, guard)).state).toBe(
      'completed',
    ),
  );
  expect((await adapter.messages(t, undefined, guard)).items.at(-1)?.text).toBe(
    'allow',
  );
});
it('does not claim completion when the provider ends without a result receipt', async () => {
  sdk.query.mockImplementation(() =>
    Object.assign(
      (async function* () {
        yield { type: 'system' };
      })(),
      { close() {} },
    ),
  );
  const { adapter } = fixture();
  const t = await adapter.create('create', 'Task', guard);
  await adapter.submit(t, 'run', 'hello', guard);
  await vi.waitFor(async () =>
    expect((await adapter.inspect(t, 'run', null, guard)).state).toBe(
      'unknown',
    ),
  );
  await adapter.submit(t, 'run', 'hello', guard);
  expect(sdk.query).toHaveBeenCalledTimes(1);
  await expect(adapter.submit(t, 'new', 'hello', guard)).rejects.toThrow(
    'uncertain',
  );
});
it('shows Kimi full streamed input rather than its truncated approval summary', async () => {
  const { kimiApprovalDescription } =
    await import('../src/server/hub/cli-agent');
  const full = { command: 'python3 /workspace/dots-delegation-proof.py' };
  const description = kimiApprovalDescription(
    {
      toolCallId: 'tool',
      title: 'Bash',
      content: [
        {
          type: 'content',
          content: { type: 'text', text: 'Running: python3…' },
        },
      ],
    },
    {
      toolCallId: 'tool',
      content: [
        {
          type: 'content',
          content: { type: 'text', text: JSON.stringify(full) },
        },
      ],
    },
  );
  expect(JSON.parse(description).input).toEqual(full);
  expect(() =>
    kimiApprovalDescription({ toolCallId: 'missing', title: 'Bash' }),
  ).toThrow('complete tool input');
});
it('cancels a pending tool decision without claiming successful completion', async () => {
  sdk.query.mockImplementation(({ options }) =>
    Object.assign(
      (async function* () {
        await options.canUseTool(
          'Bash',
          { command: 'pwd' },
          { signal: options.abortController.signal },
        );
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'denied',
        };
      })(),
      { close() {} },
    ),
  );
  const { adapter } = fixture();
  const t = await adapter.create('create', 'Task', guard);
  await adapter.submit(t, 'run', 'execute', guard);
  await vi.waitFor(() => expect(adapter.pendingApprovals(t)).toHaveLength(1));
  await adapter.cancel(t, 'run', 'run', 'cancel', guard);
  await vi.waitFor(async () =>
    expect((await adapter.inspect(t, 'run', null, guard)).state).toBe(
      'cancelled',
    ),
  );
  expect(adapter.pendingApprovals(t)).toHaveLength(0);
  await adapter.submit(t, 'run', 'execute', guard);
  expect(sdk.query).toHaveBeenCalledTimes(1);
});
