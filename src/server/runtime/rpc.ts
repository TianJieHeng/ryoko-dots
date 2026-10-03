import type { Readable, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { validateWire, type ReadMethod, type ReadResults } from './wire.js';
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
/** Read-only newline JSON-RPC. Streams must be opened by a trusted, server-owned
 * transport binder. This class cannot create sessions, execute, or mint authority.
 * No retries: closing a read does not send runtime cancellation. */
export class ReadOnlyRpc {
  private buffer = Buffer.alloc(0);
  private pending = new Map<string, Pending>();
  private closed = false;
  constructor(
    private input: Readable,
    private output: Writable,
    private limits = { bytes: 1_000_000, pending: 8, timeoutMs: 5000 },
  ) {
    input.on('data', this.receive);
    input.on('end', this.close);
    input.on('error', this.close);
    output.on('error', this.close);
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
        frame = JSON.parse(bytes.toString('utf8'));
      } catch {
        return this.close();
      }
      if (!frame || frame.jsonrpc !== '2.0') return this.close();
      // Notifications (including raw/private token events) are never projected.
      if (!('id' in frame)) continue;
      const id = String(frame.id);
      const pending = this.pending.get(id);
      if (!pending) continue; // response to timed-out read, never a new action
      this.pending.delete(id);
      clearTimeout(pending.timer);
      if ('error' in frame || !('result' in frame))
        pending.reject(new Error('Runtime read rejected'));
      else pending.resolve(frame.result);
    }
  };
  async read<M extends ReadMethod>(
    method: M,
    params: unknown,
  ): Promise<ReadResults[M]> {
    if (
      ![
        'runtime.capabilities',
        'runtime.snapshot',
        'runtime.events.since',
      ].includes(method)
    )
      throw new Error('Runtime read method unavailable');
    validateWire(method, 'params', params);
    if (this.closed) throw new Error('Runtime transport disconnected');
    if (
      this.pending.size >= this.limits.pending ||
      this.output.writableLength > this.limits.bytes
    )
      throw new Error('Runtime read queue full');
    const id = randomUUID();
    const data = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
    if (Buffer.byteLength(data) > this.limits.bytes)
      throw new Error('Runtime request too large');
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Runtime read timed out'));
      }, this.limits.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.output.write(data, (error) => {
        if (error) this.close();
      });
    });
    validateWire(method, 'result', result);
    return result as ReadResults[M];
  }
  close = () => {
    if (this.closed) return;
    this.closed = true;
    this.input.off('data', this.receive);
    this.buffer = Buffer.alloc(0);
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('Runtime transport disconnected'));
    }
    this.pending.clear();
  };
}
