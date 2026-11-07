import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { JobProfiles } from '../src/server/hub/profiles';

it('job profiles freeze instructions per instance and do not rebind runtime identity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const profiles = new JobProfiles(db),
      id = randomUUID();
    profiles.save({
      id,
      dotId: 'codex',
      name: 'Reviewer',
      instructions: 'Review only',
      expectedVersion: 0,
    });
    const first = randomUUID(),
      second = randomUUID();
    profiles.snapshot(first, id, 'Build one');
    profiles.bind(first, 'conversation-one');
    profiles.save({
      id,
      dotId: 'codex',
      name: 'Reviewer',
      instructions: 'Review and test',
      expectedVersion: 1,
    });
    expect(profiles.snapshot(first, id, 'Build one').instructions).toBe(
      'Review only',
    );
    expect(profiles.snapshot(second, id, 'Build two').instructions).toBe(
      'Review and test',
    );
    profiles.bind(second, 'conversation-two');
    expect(profiles.forConversation('conversation-one')?.version).toBe(1);
    expect(profiles.forConversation('conversation-two')?.version).toBe(2);
    expect(() => profiles.snapshot(first, id, 'Different job')).toThrow();
    expect(() =>
      profiles.save({
        id,
        dotId: 'claude',
        name: 'Reviewer',
        instructions: '',
        expectedVersion: 2,
      }),
    ).toThrow();
    expect(profiles.list(['kimi'])).toEqual([]);
  } finally {
    db.close();
  }
});
