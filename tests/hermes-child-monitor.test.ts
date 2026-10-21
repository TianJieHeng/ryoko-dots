import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hermesChildren } from '../src/server/hub/hermes-children';
import type { SelfHostedPlatform } from '../src/server/self-hosted-platform';
it('projects only parent-owned durable handoffs without child private data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dots-children-'));
  const db = new DatabaseSync(join(root, 'state.db'));
  try {
    db.exec(
      `CREATE TABLE delegation_roots(root_run_id TEXT,principal_id TEXT,profile_id TEXT);CREATE TABLE delegation_handoffs(child_id TEXT,parent_run_id TEXT,parent_session_id TEXT,root_run_id TEXT,handoff_json TEXT,state TEXT,updated_at REAL,completion_json TEXT,created_at REAL);`,
    );
    db.prepare('INSERT INTO delegation_roots VALUES(?,?,?)').run(
      'root',
      'principal',
      'profile',
    );
    for (const [id, session] of [
      ['visible', 'parent'],
      ['foreign', 'other'],
    ])
      db.prepare(
        'INSERT INTO delegation_handoffs VALUES(?,?,?,?,?,?,?,?,?)',
      ).run(
        id,
        'run',
        session,
        'root',
        JSON.stringify({
          objective: 'Inspect a file',
          privateMemory: 'must not leak',
        }),
        'running',
        1,
        JSON.stringify({
          summary: 'Ready',
          privateTranscript: 'must not leak',
        }),
        1,
      );
    const platform = {
      transport: { config: { home: root } },
      start: async () => {},
      commands: { connect: async () => {} },
      workspace: {
        runtimeBindings: {
          resolveConversation: () => ({
            durableSessionId: 'parent',
            principalId: 'principal',
            profileId: 'profile',
          }),
        },
      },
    } as unknown as SelfHostedPlatform;
    const result = await hermesChildren(
      platform,
      'conversation',
      'run',
      () => {},
    );
    expect(result.map((c) => c.id)).toEqual(['visible']);
    expect(JSON.stringify(result)).not.toContain('must not leak');
    expect(result[0].updatedAt).toBe(1000);
    expect(result[0].state).toBe('running');
    expect(
      await hermesChildren(platform, 'conversation', 'another-run', () => {}),
    ).toEqual([]);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
