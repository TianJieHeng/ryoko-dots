import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RuntimeOperations,
  createOperationalShutdown,
  storageDiagnostic,
} from '../src/server/operations/runtime-operations.js';
import { ownerTokenFromEnvironment } from '../src/server/operations/operator-secrets.js';

describe('independent readiness and safe telemetry', () => {
  it('does not make optional channel outage take healthy history offline', async () => {
    const ops = new RuntimeOperations({
      storage: () => 'ready',
      conversations: () => 'ready',
      slack: () => 'unavailable',
    });
    const result = await ops.readiness(['storage', 'conversations']);
    expect(result.ready).toBe(true);
    expect(result.surfaces.slack).toBe('unavailable');
    expect(result.surfaces.voice).toBe('unconfigured');
    expect(result.qualification).toBe('not-certified');
    expect((await ops.readiness(['slack'])).ready).toBe(false);
  });
  it('bounds a slow provider and omits reflected secrets and error text', async () => {
    const ops = new RuntimeOperations(
      {
        storage: () => 'ready',
        voice: () => new Promise(() => {}),
        computer: () => {
          throw new Error('secret transcript token');
        },
      },
      undefined,
      5,
    );
    const result = await ops.readiness();
    expect(result.surfaces.voice).toBe('unavailable');
    expect(result.surfaces.computer).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('only emits allowlisted structured keys and bounded metric values', () => {
    const lines: string[] = [];
    const ops = new RuntimeOperations({}, (line) => lines.push(line));
    ops.count('effect_unknown');
    ops.gauge('queue_depth', 4);
    expect(() => ops.count('sensitive message' as never)).toThrow();
    expect(() => ops.gauge('queue_depth', Infinity)).toThrow();
    expect(() => ops.gauge('secret' as never, 1)).toThrow();
    expect(Object.keys(JSON.parse(lines[0]))).toEqual(['event', 'time']);
    expect(ops.metrics().gauges.queue_depth).toBe(4);
  });
  it('reports schema mismatch without table content or repair side effects', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(
      "CREATE TABLE items(secret TEXT); INSERT INTO items VALUES('private-prompt')",
    );
    const ready = storageDiagnostic(db, ['items']);
    expect(ready.state).toBe('ready');
    expect(ready.schemaSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(storageDiagnostic(db, ['missing']).state).toBe('unavailable');
    expect(JSON.stringify(ready)).not.toContain('private-prompt');
    expect(db.prepare('SELECT * FROM items').all()).toHaveLength(1);
    db.close();
  });
});

describe('admission freeze and graceful drain', () => {
  it('rejects new admissions and waits for active request before stopping adapters', async () => {
    const ops = new RuntimeOperations({ storage: () => 'ready' });
    const finish = ops.admission()!;
    const order: string[] = [];
    const shutdown = createOperationalShutdown({
      operations: ops,
      closeHttp: async () => {
        order.push('http');
      },
      stopAdapters: async () => {
        order.push('adapters');
      },
      closeStorage: () => order.push('storage'),
      exit: (code) => order.push('exit:' + code),
      timeoutMs: 1000,
    });
    const first = shutdown();
    expect(shutdown()).toBe(first);
    expect(ops.admission()).toBeUndefined();
    expect((await ops.readiness()).ready).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(['http']);
    finish();
    finish();
    await first;
    expect(order).toEqual(['http', 'adapters', 'storage', 'exit:0']);
  });
  it('fails closed on timeout without a replay or cancellation callback', async () => {
    const ops = new RuntimeOperations({});
    ops.admission();
    const exit = vi.fn();
    await createOperationalShutdown({
      operations: ops,
      closeHttp: async () => {},
      stopAdapters: async () => {},
      closeStorage: () => {},
      exit,
      timeoutMs: 5,
    })();
    expect(exit).toHaveBeenCalledWith(1);
    expect(ops.metrics().activeAdmissions).toBe(1);
  });
  it('does not hang on failed adapter shutdown', async () => {
    const exit = vi.fn();
    await createOperationalShutdown({
      operations: new RuntimeOperations({}),
      closeHttp: async () => {},
      stopAdapters: async () => {
        throw new Error('private error');
      },
      closeStorage: () => {},
      exit,
      timeoutMs: 50,
    })();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('operator-mounted existing owner secret', () => {
  it('reads one bounded private file and rejects ambiguity/symlinks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'be11-secret-'));
    try {
      const file = join(directory, 'synthetic');
      writeFileSync(file, 'test-only-not-a-real-key-1234567890\n', {
        mode: 0o600,
      });
      expect(ownerTokenFromEnvironment({ OWNER_TOKEN_FILE: file })).toBe(
        'test-only-not-a-real-key-1234567890',
      );
      expect(() =>
        ownerTokenFromEnvironment({ OWNER_TOKEN: 'x', OWNER_TOKEN_FILE: file }),
      ).toThrow();
      const link = join(directory, 'link');
      symlinkSync(file, link);
      expect(() =>
        ownerTokenFromEnvironment({ OWNER_TOKEN_FILE: link }),
      ).toThrow();
      chmodSync(file, 0o666);
      expect(() =>
        ownerTokenFromEnvironment({ OWNER_TOKEN_FILE: file }),
      ).toThrow();
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});

it('never closes shared storage after an expired adapter drain even when it settles later', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const closeStorage = vi.fn();
  const exit = vi.fn();
  await createOperationalShutdown({
    operations: new RuntimeOperations({}),
    closeHttp: async () => {},
    stopAdapters: () => pending,
    closeStorage,
    exit,
    timeoutMs: 5,
  })();
  expect(exit).toHaveBeenCalledWith(1);
  expect(closeStorage).not.toHaveBeenCalled();
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(closeStorage).not.toHaveBeenCalled();
});
it('does not stop adapters or close ledgers underneath a timed-out HTTP writer', async () => {
  const operations = new RuntimeOperations({});
  const release = operations.admission()!;
  const stopAdapters = vi.fn(async () => {}),
    closeStorage = vi.fn(),
    exit = vi.fn();
  await createOperationalShutdown({
    operations,
    closeHttp: async () => {},
    stopAdapters,
    closeStorage,
    exit,
    timeoutMs: 5,
  })();
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(exit).toHaveBeenCalledWith(1);
  expect(stopAdapters).not.toHaveBeenCalled();
  expect(closeStorage).not.toHaveBeenCalled();
});
