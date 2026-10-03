import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import {
  validateWire,
  type ConversationMethod,
  type ConversationResults,
} from './wire.js';

/** Safe errors contain no producer message, diagnostics, raw params or credentials. */
export class RuntimeFailure extends Error {
  constructor(
    readonly kind: 'rejected' | 'unknown' | 'unavailable',
    readonly code?: number,
  ) {
    super(
      kind === 'rejected'
        ? 'Runtime rejected this operation.'
        : 'Runtime outcome is unavailable; inspect the original operation before retrying.',
    );
  }
}
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
/** Server-only canonical conversation adapter. No generic RPC or execution route. */
export class ConversationRpc {
  private buffer = Buffer.alloc(0);
  private pending = new Map<string, Pending>();
  private closed = false;
  constructor(
    private input: Readable,
    private output: Writable,
    private limits = { bytes: 1_000_000, pending: 8, timeoutMs: 15000 },
  ) {
    input.on('data', this.receive);
    input.on('end', this.close);
    input.on('error', this.close);
    output.on('error', this.close);
  }
  get connected() {
    return !this.closed;
  }
  private receive = (chunk: Buffer | string) => {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    if (this.buffer.length > this.limits.bytes) return this.close();
    let end: number;
    while ((end = this.buffer.indexOf(10)) >= 0) {
      const bytes = this.buffer.subarray(0, end);
      this.buffer = this.buffer.subarray(end + 1);
      if (!bytes.length) continue;
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
      } catch {
        return this.close();
      }
      if (
        !frame ||
        typeof frame !== 'object' ||
        Array.isArray(frame) ||
        frame.jsonrpc !== '2.0'
      )
        return this.close();
      // Drop every notification, including private/in-memory output.
      if (!('id' in frame)) continue;
      if (typeof frame.id !== 'string') return this.close();
      const pending = this.pending.get(frame.id);
      if (!pending) continue;
      this.pending.delete(frame.id);
      clearTimeout(pending.timer);
      if ('error' in frame) {
        const error = frame.error as { code?: unknown } | null;
        pending.reject(
          new RuntimeFailure(
            'rejected',
            typeof error?.code === 'number' ? error.code : undefined,
          ),
        );
      } else if ('result' in frame) pending.resolve(frame.result);
      else pending.reject(new RuntimeFailure('unknown'));
    }
  };
  async call<M extends ConversationMethod>(
    method: M,
    params: unknown,
  ): Promise<ConversationResults[M]> {
    // Runtime allowlist is necessary even for a cast/JS caller.
    if (!conversationMethods.includes(method))
      throw new RuntimeFailure('unavailable');
    validateWire(method, 'params', params);
    if (
      this.closed ||
      this.pending.size >= this.limits.pending ||
      this.output.writableLength > this.limits.bytes
    )
      throw new RuntimeFailure('unavailable');
    const id = randomUUID();
    const bytes = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
    if (Buffer.byteLength(bytes) > this.limits.bytes)
      throw new RuntimeFailure('unavailable');
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RuntimeFailure('unknown'));
      }, this.limits.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.output.write(bytes, (error) => {
        if (error) this.close();
      });
    });
    try {
      validateWire(method, 'result', result);
    } catch {
      throw new RuntimeFailure('unknown');
    }
    return result as ConversationResults[M];
  }
  close = () => {
    if (this.closed) return;
    this.closed = true;
    this.input.off('data', this.receive);
    this.buffer = Buffer.alloc(0);
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new RuntimeFailure('unknown'));
    }
    this.pending.clear();
  };
}
export const conversationMethods: ConversationMethod[] = [
  'runtime.conversation.capabilities',
  'runtime.conversation.create',
  'runtime.conversation.operation.get',
  'runtime.conversation.list',
  'runtime.conversation.history',
  'runtime.conversation.export',
  'runtime.conversation.rename',
  'runtime.conversation.archive',
];
