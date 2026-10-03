import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/runtime/producer-baseline.json';
import { ReadOnlyRpc } from '../src/server/runtime/rpc.js';
import { validateWire } from '../src/server/runtime/wire.js';
import { RuntimeProjection } from '../src/server/runtime/projection.js';
import { runtimeSetup } from '../src/server/runtime/setup.js';
import type {
  MissionSnapshot,
  RuntimeEventEnvelope,
} from '../src/shared/runtime/producer/wire.generated.js';
const snapshot = fixture.fixtures.idleSnapshot.response
  .result as MissionSnapshot;
const event = (seq: number): RuntimeEventEnvelope => ({
  schema_version: 1,
  event_id: `event-${seq}`,
  session_id: snapshot.session_id,
  seq,
  cursor: `epoch:${seq}`,
  generation: 1,
  mission_id: null,
  run_id: null,
  operation_id: null,
  effect_id: null,
  delivery_id: null,
  approval_id: null,
  occurred_at: 1,
  type: 'checkpoint.published',
  payload: {},
});
function channel() {
  const input = new PassThrough(),
    output = new PassThrough();
  const rpc = new ReadOnlyRpc(input, output, {
    bytes: 100000,
    pending: 1,
    timeoutMs: 30,
  });
  return { input, output, rpc };
}
describe('producer-pinned read transport', () => {
  it('validates actual producer fixtures and rejects unknown authority/schema', () => {
    validateWire('runtime.snapshot', 'result', snapshot);
    validateWire(
      'runtime.capabilities',
      'result',
      fixture.fixtures.unconfiguredCapabilities.response.result,
    );
    expect(() =>
      validateWire('runtime.snapshot', 'result', {
        ...snapshot,
        secret: 'hidden',
      }),
    ).toThrow();
    expect(() =>
      validateWire('runtime.snapshot', 'params', {
        session_id: 'a',
        schema_version: 2,
      }),
    ).toThrow();
    expect(() =>
      validateWire('runtime.snapshot', 'params', {
        session_id: 'a',
        schema_version: 1,
        principal_id: 'forged',
      }),
    ).toThrow();
  });
  it('handles split newline frames, strips unsolicited events, validates response', async () => {
    const { input, output, rpc } = channel();
    output.once('data', (data) => {
      const request = JSON.parse(String(data));
      const response =
        JSON.stringify({ jsonrpc: '2.0', id: request.id, result: snapshot }) +
        '\n';
      input.write(
        '{"jsonrpc":"2.0","method":"private.delta","params":{"secret":"x"}}\n',
      );
      input.write(response.slice(0, 20));
      input.write(response.slice(20));
    });
    await expect(
      rpc.read('runtime.snapshot', { session_id: 'live-a', schema_version: 1 }),
    ).resolves.toEqual(snapshot);
    rpc.close();
  });
  it('bounds pending reads and timeout without dispatching cancellation/retry', async () => {
    const { output, rpc } = channel();
    let writes = 0;
    output.on('data', () => writes++);
    const pending = rpc.read('runtime.snapshot', {
      session_id: 'live-a',
      schema_version: 1,
    });
    await expect(
      rpc.read('runtime.snapshot', { session_id: 'live-a', schema_version: 1 }),
    ).rejects.toThrow('queue full');
    await expect(pending).rejects.toThrow('timed out');
    expect(writes).toBe(1);
    rpc.close();
  });
  it.each(['invalid', 'oversize', 'disconnect'])(
    'fails closed on %s with redacted error',
    async (kind) => {
      const { input, rpc } = channel();
      const pending = rpc.read('runtime.snapshot', {
        session_id: 'live-a',
        schema_version: 1,
      });
      if (kind === 'invalid') input.write('private-invalid\n');
      else if (kind === 'oversize') input.write('x'.repeat(100001));
      else input.end();
      await expect(pending).rejects.toThrow('disconnected');
      rpc.close();
    },
  );
  it('never marks pinned types as qualified service integration', () => {
    const setup = runtimeSetup();
    expect(setup.qualified).toBe(false);
    expect(setup.scope).toBeNull();
    expect(
      Object.values(setup.features).every((x) => x.state !== 'ready'),
    ).toBe(true);
  });
});
describe('atomic durable read projection', () => {
  it('keeps cursor/events together across restart, deduplicates and rejects gaps/foreign generations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dots-projection-'));
    const path = join(dir, 'cache.db');
    let store = new RuntimeProjection(path);
    try {
      const binding = store.bind('owner', 'live-a', snapshot.session_id);
      store.snapshot(binding, snapshot);
      const first = event(1);
      store.events(binding, snapshot.last_cursor, {
        status: 'ok',
        events: [first, first],
        snapshot: null,
        last_cursor: first.cursor,
        has_more: false,
      });
      expect(store.read(binding).sequence).toBe(1);
      for (const wrong of [
        event(3),
        { ...event(2), session_id: 'foreign' },
        { ...event(2), generation: 0 },
      ])
        expect(() =>
          store.events(binding, first.cursor, {
            status: 'ok',
            events: [wrong],
            snapshot: null,
            last_cursor: wrong.cursor,
            has_more: false,
          }),
        ).toThrow();
      expect(store.read(binding).sequence).toBe(1);
      store.close();
      store = new RuntimeProjection(path);
      expect(store.read(binding).cursor).toBe(first.cursor);
      store.events(binding, first.cursor, {
        status: 'snapshot_required',
        events: [],
        snapshot: { ...snapshot, revision: 9, last_cursor: 'fresh:9' },
        last_cursor: 'fresh:9',
        has_more: false,
      });
      expect(store.read(binding).sequence).toBe(9);
      store.bind('owner', 'live-b', 'other');
      store.bind('owner', 'live-a', snapshot.session_id);
      expect(() => store.snapshot(binding, snapshot)).toThrow('Stale');
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
