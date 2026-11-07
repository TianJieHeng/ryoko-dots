import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

export const profileInput = z.strictObject({
  id: z.uuid(),
  dotId: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(80),
  instructions: z.string().max(8000),
  expectedVersion: z.number().int().min(0),
  archived: z.boolean().default(false),
});
export interface JobProfile {
  id: string;
  dotId: string;
  name: string;
  instructions: string;
  version: number;
  archived: boolean;
}
export class JobProfiles {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS hub_job_profiles(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hub_profile_jobs(operationId TEXT PRIMARY KEY, profile TEXT NOT NULL, title TEXT NOT NULL, conversationId TEXT UNIQUE);`);
  }
  get(id: string): JobProfile {
    const row = this.db
      .prepare('SELECT data FROM hub_job_profiles WHERE id=?')
      .get(id);
    if (!row)
      throw new HTTPException(404, { message: 'Job profile not found.' });
    return JSON.parse(String(row.data));
  }
  list(dots?: string[]) {
    return this.db
      .prepare('SELECT data FROM hub_job_profiles ORDER BY id')
      .all()
      .map((row) => JSON.parse(String(row.data)) as JobProfile)
      .filter((p) => !dots || dots.includes(p.dotId));
  }
  save(value: unknown): JobProfile {
    const input = profileInput.parse(value);
    input.id = input.id.toLowerCase();
    const row = this.db
      .prepare('SELECT data FROM hub_job_profiles WHERE id=?')
      .get(input.id);
    const old = row ? (JSON.parse(String(row.data)) as JobProfile) : undefined;
    if (
      (old?.version ?? 0) !== input.expectedVersion ||
      (old && old.dotId !== input.dotId)
    )
      throw new HTTPException(409, {
        message: 'Profile version changed or runtime identity differs.',
      });
    const { expectedVersion, ...rest } = input;
    const profile = { ...rest, version: expectedVersion + 1 };
    this.db
      .prepare(
        'INSERT INTO hub_job_profiles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(profile.id, JSON.stringify(profile));
    return profile;
  }
  snapshot(operationId: string, profileId: string, title: string): JobProfile {
    const row = this.db
      .prepare('SELECT profile,title FROM hub_profile_jobs WHERE operationId=?')
      .get(operationId);
    if (row) {
      const profile = JSON.parse(String(row.profile)) as JobProfile;
      if (profile.id !== profileId || row.title !== title)
        throw new HTTPException(409, {
          message: 'Job operation already belongs to another profile or title.',
        });
      return profile;
    }
    const profile = this.get(profileId);
    if (profile.archived)
      throw new HTTPException(409, { message: 'Job profile is archived.' });
    this.db
      .prepare('INSERT INTO hub_profile_jobs VALUES(?,?,?,NULL)')
      .run(operationId, JSON.stringify(profile), title);
    return profile;
  }
  bind(operationId: string, conversationId: string) {
    this.db
      .prepare(
        'UPDATE hub_profile_jobs SET conversationId=? WHERE operationId=?',
      )
      .run(conversationId, operationId);
  }
  forConversation(id: string): JobProfile | undefined {
    const row = this.db
      .prepare('SELECT profile FROM hub_profile_jobs WHERE conversationId=?')
      .get(id);
    return row ? JSON.parse(String(row.profile)) : undefined;
  }
}
