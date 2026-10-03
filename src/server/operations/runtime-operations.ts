import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const surfaces = [
  'storage',
  'conversations',
  'commands',
  'artifacts',
  'schedules',
  'memory',
  'learning',
  'computer',
  'voice',
  'slack',
] as const;
export type Surface = (typeof surfaces)[number];
export type State = 'ready' | 'unconfigured' | 'unavailable' | 'unsupported';
export type Probe = () => Promise<State> | State;
const states = new Set<State>([
  'ready',
  'unconfigured',
  'unavailable',
  'unsupported',
]);
const events = [
  'admission_accepted',
  'admission_rejected',
  'replay_gap',
  'approval_stuck',
  'effect_unknown',
  'delivery_unknown',
  'queue_saturated',
  'storage_pressure',
  'drain_started',
  'drain_timed_out',
] as const;
type Event = (typeof events)[number];
const gauges = [
  'adapter_lag_seconds',
  'queue_depth',
  'storage_free_bytes',
  'command_unknown',
  'control_unresolved',
  'effect_unknown',
  'delivery_unknown',
  'slack_queue_depth',
  'voice_unknown',
  'schedule_unknown',
] as const;
type Gauge = (typeof gauges)[number];

/** Explicit-only telemetry: never serialize errors, prompts, audio or request data. */
export class RuntimeOperations {
  private draining = false;
  private active = 0;
  private counters = new Map<Event, number>();
  private gauges = new Map<Gauge, number>();
  constructor(
    private readonly probes: Partial<Record<Surface, Probe>>,
    private readonly emit: (line: string) => void = () => {},
    private readonly timeoutMs = 500,
    private readonly readMetrics?: () => Partial<Record<Gauge, number>>,
  ) {}
  admission(): (() => void) | undefined {
    if (this.draining) {
      this.count('admission_rejected');
      return undefined;
    }
    this.active++;
    this.count('admission_accepted');
    let completed = false;
    return () => {
      if (!completed) {
        completed = true;
        this.active--;
      }
    };
  }
  freeze() {
    if (this.draining) return;
    this.draining = true;
    this.count('drain_started');
  }
  count(event: Event) {
    if (!events.includes(event)) throw new Error('Unknown metric.');
    this.counters.set(event, (this.counters.get(event) ?? 0) + 1);
    this.emit(JSON.stringify({ event, time: Date.now() }));
  }
  gauge(name: Gauge, value: number) {
    if (!gauges.includes(name) || !Number.isSafeInteger(value) || value < 0)
      throw new Error('Invalid gauge.');
    this.gauges.set(name, value);
  }
  async readiness(required: readonly Surface[] = ['storage']) {
    const results = await Promise.all(
      surfaces.map(async (surface) => {
        const probe = this.probes[surface];
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const value = probe
            ? await Promise.race([
                Promise.resolve().then(probe),
                new Promise<State>((resolve) => {
                  timer = setTimeout(
                    () => resolve('unavailable'),
                    this.timeoutMs,
                  );
                }),
              ])
            : 'unconfigured';
          return [surface, states.has(value) ? value : 'unavailable'] as const;
        } catch {
          return [surface, 'unavailable'] as const;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }),
    );
    const status = Object.fromEntries(results) as Record<Surface, State>;
    return {
      ready:
        !this.draining &&
        required.every((surface) => status[surface] === 'ready'),
      draining: this.draining,
      surfaces: status,
      // Readiness is not production qualification of a deployment/provider.
      qualification: 'not-certified' as const,
    };
  }
  metrics() {
    let ledgerMetrics: State = this.readMetrics ? 'ready' : 'unconfigured';
    try {
      for (const [name, value] of Object.entries(this.readMetrics?.() ?? {}))
        this.gauge(name as Gauge, value);
    } catch {
      ledgerMetrics = 'unavailable';
    }
    return {
      ledgerMetrics,
      draining: this.draining,
      activeAdmissions: this.active,
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
    };
  }
  async waitForDrain(timeoutMs = 8000): Promise<boolean> {
    this.freeze();
    const deadline = Date.now() + timeoutMs;
    while (this.active && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 5));
    if (this.active) this.count('drain_timed_out');
    return this.active === 0;
  }
}

/** Only hashes/counts are exposed. Does not mutate schema or certify all families. */
export function storageDiagnostic(
  db: DatabaseSync,
  requiredTables: readonly string[],
): {
  state: State;
  schemaSha256: string;
  tableCount: number;
  missingTableCount: number;
} {
  const rows = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    .all();
  const names = new Set(rows.map((row) => row.name));
  const healthy =
    db.prepare('PRAGMA quick_check(1)').get()?.quick_check === 'ok';
  return {
    state:
      healthy && requiredTables.every((name) => names.has(name))
        ? 'ready'
        : 'unavailable',
    schemaSha256: createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex'),
    tableCount: rows.length,
    missingTableCount: requiredTables.filter((name) => !names.has(name)).length,
  };
}

/** Freeze first. A deadline is forced termination, never proof that writers drained.
 * On timeout leave SQLite open for process exit/WAL recovery; never close it under
 * an in-flight callback. The lifetime gate/service owns process-tree termination. */
export function createOperationalShutdown(options: {
  operations: RuntimeOperations;
  closeHttp: () => Promise<void>;
  stopAdapters: () => Promise<void>;
  closeStorage: () => void;
  exit: (code: number) => void;
  timeoutMs?: number;
}) {
  let running: Promise<void> | undefined;
  return () =>
    (running ??= (async () => {
      options.operations.freeze();
      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<'expired'>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve('expired');
        }, options.timeoutMs ?? 8000);
      });
      const orderly = (async () => {
        await Promise.all([
          options.closeHttp(),
          options.operations.waitForDrain(options.timeoutMs),
        ]);
        if (expired || options.operations.metrics().activeAdmissions)
          return 'failed' as const;
        await options.stopAdapters();
        if (expired) return 'failed' as const;
        options.closeStorage();
        return 'closed' as const;
      })().catch(() => 'failed' as const);
      const result = await Promise.race([orderly, deadline]);
      if (timer) clearTimeout(timer);
      if (result !== 'closed') options.operations.count('drain_timed_out');
      options.exit(result === 'closed' ? 0 : 1);
    })());
}
