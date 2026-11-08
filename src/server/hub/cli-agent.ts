import { z } from 'zod';
import { workerMcp, type WorkerMcpConfig } from './worker-mcp.js';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { accessSync, constants } from 'node:fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  ClientApp,
  ndJsonStream,
  type ToolCall,
  type ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type { RuntimeAdapter, Guard, RunSnapshot } from './adapter.js';
import type { HubMessage, RunState } from '../../shared/hub/types.js';
export interface CliAgentConfig {
  kind: 'claude' | 'kimi';
  workerMcp?: WorkerMcpConfig;
  executable: string;
  cwd: string;
  model?: string;
}
interface Thread {
  operationId: string;
  id: string;
  title: string;
  nativeId: string | null;
}
interface Run {
  id: string;
  threadId: string;
  state: RunState;
  detail: string | null;
}
interface Pending {
  id: string;
  threadId: string;
  turnId: string;
  description: string;
  resolve: (accept: boolean) => void;
}
/** Kimi sends the full JSON input in cumulative tool updates before requesting permission. */
export function kimiApprovalDescription(
  tool: ToolCallUpdate,
  prior?: ToolCallUpdate,
) {
  const shown = { ...prior, ...tool };
  let input = tool.rawInput ?? prior?.rawInput;
  if (input === undefined) {
    const text = (prior?.content ?? [])
      .flatMap((c) =>
        c.type === 'content' && c.content.type === 'text'
          ? [c.content.text]
          : [],
      )
      .join('');
    try {
      input = JSON.parse(text);
    } catch {
      throw Error('Kimi did not supply complete tool input for review.');
    }
  }
  return JSON.stringify({
    toolCallId: shown.toolCallId,
    tool: shown.title,
    input,
  });
}
/** Durable admission around the providers' own sessions. Lost executions are never replayed. */
export class CliAgentAdapter implements RuntimeAdapter {
  readonly capabilities = {
    chat: true,
    cancel: true,
    computer: false,
    children: false,
    approvals: true,
  };
  private db: DatabaseSync;
  private active = new Map<string, AbortController>();
  private tasks = new Map<string, Promise<void>>();
  private approvals = new Map<string, Pending>();
  private stopping = false;
  constructor(
    private config: CliAgentConfig,
    path: string,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY, operationId TEXT UNIQUE, title TEXT NOT NULL, nativeId TEXT);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL, detail TEXT);
      CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, threadId TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, committed INTEGER NOT NULL);
      UPDATE runs SET state='unknown',detail='Runtime restarted during execution. Inspect the native session; do not resubmit.' WHERE state IN ('running','waiting_approval');`);
  }
  readiness() {
    try {
      accessSync(this.config.executable, constants.X_OK);
      return 'ready';
    } catch {
      return 'unavailable';
    }
  }
  private thread(id: string): Thread {
    const t = this.db
      .prepare('SELECT * FROM threads WHERE id=?')
      .get(id) as unknown as Thread | undefined;
    if (!t) throw Error('Unknown agent conversation.');
    return t;
  }
  async create(operationId: string, title: string, guard: Guard) {
    guard();
    const old = this.db
      .prepare('SELECT id,title FROM threads WHERE operationId=?')
      .get(operationId);
    if (old) {
      if (old.title !== title) throw Error('Conversation intent changed.');
      return String(old.id);
    }
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO threads VALUES(?,?,?,NULL)')
      .run(id, operationId, title);
    return id;
  }
  async list(cursor: string | undefined, guard: Guard) {
    guard();
    const rows = this.db
      .prepare('SELECT id,title FROM threads WHERE id>? ORDER BY id LIMIT 51')
      .all(cursor ?? '') as unknown as { id: string; title: string }[];
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }
  async messages(id: string, cursor: string | undefined, guard: Guard) {
    guard();
    this.thread(id);
    if (cursor && !/^\d+$/.test(cursor)) throw Error('Invalid message cursor.');
    const rows = this.db
      .prepare(
        'SELECT * FROM messages WHERE threadId=? AND seq>? ORDER BY seq LIMIT 101',
      )
      .all(id, Number(cursor ?? 0));
    return {
      items: rows.slice(0, 100).map(
        (r) =>
          ({
            id: String(r.id),
            role: String(r.role),
            text: String(r.text),
            committed: !!r.committed,
          }) satisfies HubMessage,
      ),
      nextCursor: rows.length > 100 ? String(rows[99].seq) : null,
    };
  }
  async result(
    threadId: string,
    operationId: string,
    _runId: string | null,
    guard: Guard,
  ) {
    guard();
    this.thread(threadId);
    const row = this.db
      .prepare(
        "SELECT m.text FROM messages m JOIN runs r ON r.id=? AND r.threadId=m.threadId WHERE m.id=? AND m.threadId=? AND m.committed=1 AND r.state='completed'",
      )
      .get(operationId, operationId + ':assistant', threadId);
    return row ? String(row.text) : null;
  }
  private message(
    id: string,
    threadId: string,
    role: string,
    text: string,
    committed = true,
  ) {
    this.db
      .prepare(
        'INSERT INTO messages(id,threadId,role,text,committed) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text,committed=excluded.committed',
      )
      .run(id, threadId, role, text, Number(committed));
  }
  private state(id: string, state: RunState, detail: string | null = null) {
    this.db
      .prepare('UPDATE runs SET state=?,detail=? WHERE id=?')
      .run(state, detail, id);
  }
  async submit(
    threadId: string,
    id: string,
    text: string,
    guard: Guard,
  ): Promise<RunSnapshot> {
    guard();
    this.thread(threadId);
    const old = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if (old) {
      if (old.threadId !== threadId || old.text !== text)
        throw Error('Run intent changed.');
      return this.inspect(threadId, id, id, guard);
    }
    if (
      this.stopping ||
      this.db
        .prepare(
          "SELECT id FROM runs WHERE threadId=? AND state IN ('running','waiting_approval','unknown')",
        )
        .get(threadId)
    )
      throw Error(
        'Conversation has active or uncertain work. Inspect it first.',
      );
    this.db
      .prepare("INSERT INTO runs VALUES(?,?,?,'running',NULL)")
      .run(id, threadId, text);
    this.message(id + ':user', threadId, 'user', text);
    const abort = new AbortController();
    this.active.set(id, abort);
    const task = this.execute(threadId, id, text, abort)
      .catch(() => {
        this.state(
          id,
          this.stopping
            ? 'unknown'
            : abort.signal.aborted
              ? 'cancelled'
              : 'unknown',
          'Agent transport ended without confirmed completion; inspect the native session before retrying.',
        );
      })
      .finally(() => {
        for (const p of this.approvals.values())
          if (p.turnId === id) p.resolve(false);
        this.active.delete(id);
        this.tasks.delete(id);
      });
    this.tasks.set(id, task);
    return { nativeId: id, state: 'running' };
  }
  private permission(
    threadId: string,
    id: string,
    description: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const approvalId = randomUUID();
    this.state(id, 'waiting_approval');
    return new Promise((resolve) => {
      const done = (accept: boolean) => {
        if (!this.approvals.delete(approvalId)) return;
        signal.removeEventListener('abort', cancel);
        this.state(id, signal.aborted ? 'cancelled' : 'running');
        resolve(accept);
      };
      const cancel = () => done(false);
      this.approvals.set(approvalId, {
        id: approvalId,
        threadId,
        turnId: id,
        description,
        resolve: done,
      });
      signal.addEventListener('abort', cancel, { once: true });
    });
  }
  pendingApprovals(threadId: string) {
    this.thread(threadId);
    return [...this.approvals.values()]
      .filter((a) => a.threadId === threadId)
      .map(({ id, turnId, description }) => ({ id, turnId, description }));
  }
  approve(threadId: string, id: string, accept: boolean, guard: Guard) {
    guard();
    const p = this.approvals.get(id);
    if (!p || p.threadId !== threadId)
      throw Error('Approval is no longer pending for this conversation.');
    p.resolve(accept);
  }
  private async execute(
    threadId: string,
    id: string,
    text: string,
    abort: AbortController,
  ) {
    if (this.config.kind === 'claude')
      await this.claude(threadId, id, text, abort);
    else await this.kimi(threadId, id, text, abort);
  }
  private async claude(
    threadId: string,
    id: string,
    text: string,
    abort: AbortController,
  ) {
    const t = this.thread(threadId);
    const sessionId = t.nativeId ?? randomUUID();
    // Save the native identity before launching; never start another session after uncertain work.
    this.db
      .prepare('UPDATE threads SET nativeId=? WHERE id=?')
      .run(sessionId, threadId);
    const mcp = workerMcp(this.config.workerMcp, t.operationId);
    const stream = query({
      prompt: text,
      options: {
        cwd: this.config.cwd,
        pathToClaudeCodeExecutable: this.config.executable,
        abortController: abort,
        permissionMode: 'default',
        settingSources: ['user', 'project', 'local'],
        ...(mcp ? { mcpServers: { agent_chat: mcp } } : {}),
        ...(t.nativeId ? { resume: sessionId } : { sessionId }),
        ...(this.config.model ? { model: this.config.model } : {}),
        canUseTool: async (tool, input, { signal }) =>
          (await this.permission(
            threadId,
            id,
            JSON.stringify({ tool, input }),
            signal,
          ))
            ? { behavior: 'allow', updatedInput: input }
            : {
                behavior: 'deny',
                message: 'Owner denied or cancelled this action.',
              },
      },
    });
    let confirmed = false,
      content = '';
    try {
      for await (const event of stream) {
        if (event.type === 'assistant') {
          const part = event.message.content
            .flatMap((p) => (p.type === 'text' ? [p.text] : []))
            .join('\n');
          if (part) {
            content += (content ? '\n\n' : '') + part;
            this.message(
              id + ':assistant',
              threadId,
              'assistant',
              content,
              false,
            );
          }
        }
        if (event.type === 'result') {
          confirmed = true;
          if (
            event.subtype === 'success' &&
            !event.is_error &&
            !abort.signal.aborted
          ) {
            this.message(
              id + ':assistant',
              threadId,
              'assistant',
              event.result || content,
            );
            this.state(id, 'completed');
          } else {
            this.message(id + ':assistant', threadId, 'assistant', content);
            this.state(
              id,
              abort.signal.aborted ? 'cancelled' : 'failed',
              'Claude reported ' + event.subtype,
            );
          }
        }
      }
      if (!confirmed) throw Error('No Claude result receipt.');
    } finally {
      stream.close();
    }
  }
  private async kimi(
    threadId: string,
    id: string,
    text: string,
    abort: AbortController,
  ) {
    const child = spawn(this.config.executable, ['acp'], {
      cwd: this.config.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.on('data', () => {});
    child.once('error', (error) => child.stdout.destroy(error));
    let content = '',
      prompting = false;
    const toolCalls = new Map<string, ToolCall | ToolCallUpdate>();
    const app = new ClientApp();
    app.onNotification('session/update', ({ params }) => {
      const update = params.update;
      if (
        update.sessionUpdate === 'tool_call' ||
        update.sessionUpdate === 'tool_call_update'
      ) {
        toolCalls.set(update.toolCallId, {
          ...toolCalls.get(update.toolCallId),
          ...update,
        });
      }
      if (
        prompting &&
        update.sessionUpdate === 'agent_message_chunk' &&
        update.content.type === 'text'
      ) {
        content += update.content.text;
        this.message(id + ':assistant', threadId, 'assistant', content, false);
      }
    });
    app.onRequest('session/request_permission', async ({ params, signal }) => {
      const accept = await this.permission(
        threadId,
        id,
        kimiApprovalDescription(
          params.toolCall,
          toolCalls.get(params.toolCall.toolCallId),
        ),
        signal,
      );
      const option = params.options.find(
        (o) => o.kind === (accept ? 'allow_once' : 'reject_once'),
      );
      return {
        outcome: option
          ? { outcome: 'selected' as const, optionId: option.optionId }
          : { outcome: 'cancelled' as const },
      };
    });
    const connection = app.connect(
      ndJsonStream(
        Writable.toWeb(child.stdin),
        Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
      ),
    );
    const stop = () => {
      child.kill('SIGTERM');
    };
    abort.signal.addEventListener('abort', stop, { once: true });
    if (abort.signal.aborted) stop();
    try {
      await connection.agent.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: 'opendots', version: '1' },
      });
      const mcp = workerMcp(
        this.config.workerMcp,
        this.thread(threadId).operationId,
      );
      const mcpServers = mcp
        ? [
            {
              name: 'agent_chat',
              command: mcp.command,
              args: mcp.args,
              env: Object.entries(mcp.env).map(([name, value]) => ({
                name,
                value,
              })),
            },
          ]
        : [];
      let nativeId = this.thread(threadId).nativeId;
      if (nativeId)
        await connection.agent.request('session/load', {
          sessionId: nativeId,
          cwd: this.config.cwd,
          mcpServers,
        });
      else {
        const session = z.object({ sessionId: z.string().min(1) }).parse(
          await connection.agent.request('session/new', {
            cwd: this.config.cwd,
            mcpServers,
          }),
        );
        nativeId = session.sessionId;
        this.db
          .prepare('UPDATE threads SET nativeId=? WHERE id=?')
          .run(nativeId, threadId);
      }
      prompting = true;
      const result = z.object({ stopReason: z.string() }).parse(
        await connection.agent.request('session/prompt', {
          sessionId: nativeId,
          prompt: [{ type: 'text', text }],
        }),
      );
      this.message(id + ':assistant', threadId, 'assistant', content);
      this.state(
        id,
        result.stopReason === 'end_turn'
          ? 'completed'
          : result.stopReason === 'cancelled'
            ? 'cancelled'
            : 'failed',
        result.stopReason === 'end_turn'
          ? null
          : 'Kimi stopped: ' + result.stopReason,
      );
    } finally {
      abort.signal.removeEventListener('abort', stop);
      stop();
    }
  }
  async inspect(
    threadId: string,
    id: string,
    _nativeId: string | null,
    guard: Guard,
  ): Promise<RunSnapshot> {
    guard();
    this.thread(threadId);
    const r = this.db
      .prepare('SELECT * FROM runs WHERE id=? AND threadId=?')
      .get(id, threadId) as unknown as Run | undefined;
    if (!r)
      return {
        nativeId: null,
        state: 'unknown',
        detail: 'No admitted run found.',
      };
    return { nativeId: id, state: r.state, detail: r.detail };
  }
  async cancel(
    threadId: string,
    id: string,
    nativeId: string | null,
    _cancelId: string,
    guard: Guard,
  ) {
    guard();
    const r = await this.inspect(threadId, id, nativeId, guard);
    if (!['completed', 'failed', 'cancelled'].includes(r.state))
      this.active.get(id)?.abort();
    return this.inspect(threadId, id, nativeId, guard);
  }
  async children(_id: string, _run: string | null, guard: Guard) {
    guard();
    return [];
  }
  async stop() {
    this.stopping = true;
    for (const c of this.active.values()) c.abort();
    await Promise.allSettled(this.tasks.values());
    this.db.close();
  }
}
