import { expect, it } from 'vitest';
import { mkdtempSync, openSync, closeSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stateGateDescriptor } from '../src/server/operations/state-gate';
it('validates only the existing private inherited state descriptor without opening another inode', () => {
  const root = mkdtempSync(join(tmpdir(), 'state-gate-'));
  const file = join(root, 'lock'),
    fd = openSync(file, 'wx', 0o600);
  try {
    expect(stateGateDescriptor({})).toBeUndefined();
    expect(stateGateDescriptor({ DOTS_STATE_GATE_FD: String(fd) })).toBe(fd);
    for (const value of ['0', '2', '-1', 'NaN', '999999'])
      expect(() =>
        stateGateDescriptor({ DOTS_STATE_GATE_FD: value }),
      ).toThrow();
    chmodSync(file, 0o644);
    expect(() =>
      stateGateDescriptor({ DOTS_STATE_GATE_FD: String(fd) }),
    ).toThrow();
  } finally {
    closeSync(fd);
    rmSync(root, { recursive: true });
  }
});
