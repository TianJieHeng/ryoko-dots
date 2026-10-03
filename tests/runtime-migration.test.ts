import { describe, expect, it } from 'vitest';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  canRequestCutover,
  migrationCategories,
  migrationSchema,
} from '../src/shared/runtime/migration';

const migration = {
  version: contractVersion,
  scope: {
    owner: 'owner',
    gateway: 'gateway',
    agent: 'agent',
    project: null,
    generation: 1,
  },
  revision: 2,
  runtimeOwner: 'ryoko',
  stickyOwner: true,
  state: 'completed',
  admissions: 'open',
  acceptedRyokoWorkPreserved: true,
  legacyApprovalsGrantNewPermission: false,
  uncertainScheduleBackfill: false,
  inventory: migrationCategories.map((category) => ({
    category,
    total: 3,
    migrated: 2,
    readOnly: 1,
    blocked: 0,
    disposition: 'migrated',
  })),
  warnings: [],
  qualified: true,
};

describe('runtime migration status', () => {
  it('allows requesting a fully qualified and accounted-for cutover', () => {
    expect(migrationSchema.safeParse(migration).success).toBe(true);
    expect(canRequestCutover(migration)).toBe(true);
    expect(
      canRequestCutover({
        ...migration,
        inventory: migration.inventory.map((entry) => ({
          ...entry,
          migrated: 0,
          readOnly: 3,
          disposition: 'read_only',
        })),
      }),
    ).toBe(true);
  });

  it('rejects duplicate categories from a double migration', () => {
    const inventory = [...migration.inventory];
    inventory[1] = { ...inventory[0] };
    const duplicate = { ...migration, inventory };
    expect(migrationSchema.safeParse(duplicate).success).toBe(false);
    expect(canRequestCutover(duplicate)).toBe(false);
  });

  it('preserves accepted Ryoko work and its owner during rollback', () => {
    const rollback = {
      ...migration,
      state: 'rollback',
      admissions: 'rollback',
    };
    const before = structuredClone(rollback);
    const status = migrationSchema.parse(rollback);
    expect(status.acceptedRyokoWorkPreserved).toBe(true);
    expect(status.runtimeOwner).toBe('ryoko');
    expect(status.stickyOwner).toBe(true);
    expect(canRequestCutover(status)).toBe(false);
    expect(rollback).toEqual(before);
  });

  it('rejects inherited legacy approval and uncertain schedule backfill', () => {
    for (const change of [
      { legacyApprovalsGrantNewPermission: true },
      { uncertainScheduleBackfill: true },
      { stickyOwner: false },
    ]) {
      const invalid = { ...migration, ...change };
      expect(migrationSchema.safeParse(invalid).success).toBe(false);
      expect(canRequestCutover(invalid)).toBe(false);
    }
  });

  it('denies missing, partial, blocked, and unavailable inventory', () => {
    for (const inventory of [
      [],
      migration.inventory.slice(1),
      migration.inventory.map((entry) => ({ ...entry, migrated: 1 })),
      migration.inventory.map((entry) => ({
        ...entry,
        migrated: 1,
        blocked: 1,
      })),
      migration.inventory.map((entry) => ({
        ...entry,
        disposition: 'blocked',
      })),
      migration.inventory.map((entry) => ({
        ...entry,
        disposition: 'unavailable',
      })),
    ]) {
      expect(canRequestCutover({ ...migration, inventory })).toBe(false);
    }
  });

  it('requires all owner, state, admission, preservation, and qualification gates', () => {
    for (const change of [
      { runtimeOwner: 'legacy' },
      { runtimeOwner: 'mixed_readonly' },
      { state: 'awaiting_reconciliation' },
      { state: 'in_progress' },
      { state: 'paused' },
      { admissions: 'blocked' },
      { admissions: 'rollback' },
      { qualified: false },
      { acceptedRyokoWorkPreserved: false },
    ])
      expect(canRequestCutover({ ...migration, ...change })).toBe(false);
  });

  it('validates safe counts, strict fields, versions, and warning bounds', () => {
    for (const change of [
      { total: -1 },
      { migrated: 0.5 },
      { readOnly: -1 },
      { blocked: 4 },
      { migrated: 3 },
      { total: Number.MAX_SAFE_INTEGER + 1 },
      { category: 'unknown' },
      { execute: true },
    ]) {
      expect(
        migrationSchema.safeParse({
          ...migration,
          inventory: [{ ...migration.inventory[0], ...change }],
        }).success,
      ).toBe(false);
    }
    for (const change of [
      { version: 'legacy/1' },
      { revision: -1 },
      { warnings: Array.from({ length: 101 }, () => 'warning') },
      { warnings: [1] },
      { mutate: true },
    ])
      expect(
        migrationSchema.safeParse({ ...migration, ...change }).success,
      ).toBe(false);
    expect(canRequestCutover(null)).toBe(false);
  });
});
