import type { State } from './runtime-operations.js';
/** Store only a bounded state and transport epoch, never a provider payload.
 * A successful old probe cannot make a restarted/disconnected adapter ready. */
export class ReadinessEvidence {
  private observed?: { state: State; epoch: number; at: number };
  constructor(
    private now: () => number = Date.now,
    private maxAgeMs = 15000,
  ) {}
  record(state: State, epoch: number) {
    this.observed = { state, epoch, at: this.now() };
  }
  read(epoch: number, connected: boolean): State {
    const value = this.observed;
    if (
      !connected ||
      !value ||
      value.epoch !== epoch ||
      this.now() - value.at > this.maxAgeMs
    )
      return 'unavailable';
    return value.state;
  }
}
