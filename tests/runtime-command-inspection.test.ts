import { describe, expect, it } from 'vitest';
import { ReceiptInspectionSchedule } from '../src/client/runtime/use-commands';
import type { RecoveredCommand } from '../src/client/runtime/command-recovery';
import {
  contractVersion,
  type CommandReceipt,
} from '../src/shared/runtime/contracts';

function record(operationId: string): RecoveredCommand {
  return {
    pending: {
      version: contractVersion,
      scope: {
        owner: 'owner',
        gateway: 'gateway',
        agent: 'agent',
        project: null,
        generation: 1,
      },
      operationId,
      intentDigest: 'a'.repeat(64),
      intent: {
        operation: 'submit',
        conversationId: 'chat',
        text: operationId,
        sourceUrl: null,
      },
      createdAt: 1,
    },
  };
}

function receipt(
  record: RecoveredCommand,
  status: CommandReceipt['status'],
): CommandReceipt {
  return {
    version: contractVersion,
    scope: record.pending.scope,
    operationId: record.pending.operationId,
    intentDigest: record.pending.intentDigest,
    status,
    runId: status === 'accepted' ? 'active-run' : null,
    missionId: null,
    durableRevision: 1,
    executionStatus: status === 'accepted' ? 'claimed' : null,
    messageId: null,
    reason: '',
  };
}

describe('independent receipt inspection backoff', () => {
  it('keeps reaching an active run behind three unavailable operations', () => {
    const records = ['unknown-a', 'unknown-b', 'unknown-c', 'active'].map(
      record,
    );
    records[3].receipt = receipt(records[3], 'accepted');
    const schedule = new ReceiptInspectionSchedule();
    const inspected: string[] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const next = schedule.next(records);
      expect(next).toBeDefined();
      const id = next!.pending.operationId;
      inspected.push(id);
      schedule.observe(
        id,
        id === 'active' ? next!.receipt : receipt(next!, 'outcome_unknown'),
      );
    }
    expect(inspected.slice(0, 4)).toEqual([
      'unknown-a',
      'unknown-b',
      'unknown-c',
      'active',
    ]);
    for (const id of ['unknown-a', 'unknown-b', 'unknown-c'])
      expect(inspected.filter((value) => value === id)).toHaveLength(3);
    expect(inspected.filter((id) => id === 'active').length).toBeGreaterThan(3);
    expect(schedule.hasEligible(records)).toBe(true);
    records[3].receipt!.executionStatus = 'completed';
    expect(schedule.hasEligible(records)).toBe(false);
    expect(schedule.next(records)).toBeUndefined();
    // Explicit refresh starts another bounded read-only pass for paused identities.
    expect(new ReceiptInspectionSchedule().next(records)).toBe(records[0]);
  });

  it('resets only the successful operation and skips newly terminal runs', () => {
    const unknown = record('unknown');
    const active = record('active');
    const records = [unknown, active];
    const schedule = new ReceiptInspectionSchedule();
    schedule.observe('unknown');
    schedule.observe('unknown');
    schedule.observe('active');
    schedule.observe('active');
    schedule.observe('active', receipt(active, 'accepted'));
    schedule.observe('unknown');
    expect(schedule.next(records)).toBe(active);
    schedule.observe('active');
    schedule.observe('active');
    expect(schedule.next(records)).toBe(active);
    active.receipt = {
      ...receipt(active, 'accepted'),
      executionStatus: 'completed',
    };
    expect(schedule.next(records)).toBeUndefined();
  });
});
