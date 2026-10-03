import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
const id = z.string().min(1).max(256);
const agentSchema = z.strictObject({
  dotId: id,
  gatewayId: id,
  principalId: id,
  profileId: id,
  agentId: id,
  privilegeClass: z.enum(['primary', 'specialist']),
});
const projectSchema = z.strictObject({
  spaceId: id,
  gatewayId: id,
  profileId: id,
  projectId: id,
});
const conversationSchema = z.strictObject({
  conversationId: id,
  dotId: id,
  spaceId: id.nullable(),
  durableSessionId: id,
  liveSessionId: id,
  liveGeneration: z.number().int().nonnegative(),
});
type Agent = z.infer<typeof agentSchema>;
type Project = z.infer<typeof projectSchema>;
type Conversation = z.infer<typeof conversationSchema>;
export interface VerifiedRuntimeScope extends Agent {
  ownerId: string;
  agentRevision: number;
  /** Stable grant/config fence; independent of transport reconnect/restart. */
  authorityRevision: number;
  grantRevision: number;
  spaceId: string | null;
  projectId: string | null;
  projectRevision: number | null;
}
export interface VerifiedConversationScope
  extends VerifiedRuntimeScope, Conversation {
  revision: number;
  archived: boolean;
}
/** Server-only registry, populated only after the producer authenticates a binding.
 * Configuration, browser JSON, and display names are never sufficient evidence.
 * No HTTP route exposes these mutators. This is not a producer transport binder. */
export class RuntimeBindings {
  constructor(
    private db: DatabaseSync,
    readonly ownerId: string,
    private grants: {
      dotExists: (dotId: string) => boolean;
      spaceExists: (spaceId: string) => boolean;
      canAccessSpace: (dotId: string, spaceId: string) => boolean;
    },
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS runtime_agents(dotId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, gatewayId TEXT NOT NULL, profileId TEXT NOT NULL, agentId TEXT NOT NULL, privilegeClass TEXT NOT NULL, value TEXT NOT NULL, revision INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, UNIQUE(ownerId,gatewayId,profileId,agentId));
      CREATE UNIQUE INDEX IF NOT EXISTS runtime_one_primary ON runtime_agents(ownerId) WHERE privilegeClass='primary';
      CREATE TABLE IF NOT EXISTS runtime_projects(spaceId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, gatewayId TEXT NOT NULL, profileId TEXT NOT NULL, projectId TEXT NOT NULL, value TEXT NOT NULL, revision INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, UNIQUE(ownerId,gatewayId,profileId,projectId));
      CREATE TABLE IF NOT EXISTS runtime_conversations(conversationId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, dotId TEXT NOT NULL, durableSessionId TEXT NOT NULL UNIQUE, liveSessionId TEXT NOT NULL UNIQUE, value TEXT NOT NULL, revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS dot_access_revisions(dotId TEXT PRIMARY KEY, revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO dot_access_revisions SELECT id, 1 FROM dots;`);
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private row(table: string, key: string, value: string) {
    return this.db
      .prepare(`SELECT * FROM ${table} WHERE ${key}=? AND ownerId=?`)
      .get(value, this.ownerId);
  }
  bindAgent(input: Agent, expectedRevision = 0): VerifiedRuntimeScope {
    const value = agentSchema.parse(input);
    if (!this.grants.dotExists(value.dotId)) throw new Error('Unknown Dot.');
    return this.transaction(() => {
      const previous = this.row('runtime_agents', 'dotId', value.dotId);
      if (Number(previous?.revision ?? 0) !== expectedRevision)
        throw new Error('Runtime binding revision conflict.');
      if (previous && previous.value !== JSON.stringify(value))
        throw new Error(
          'Runtime agent identity and privilege class are immutable.',
        );
      this.db
        .prepare(
          `INSERT INTO runtime_agents VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0) ON CONFLICT(dotId) DO UPDATE SET revision=revision+1, revoked=0`,
        )
        .run(
          value.dotId,
          this.ownerId,
          value.gatewayId,
          value.profileId,
          value.agentId,
          value.privilegeClass,
          JSON.stringify(value),
        );
      this.db
        .prepare(
          'UPDATE dot_access_revisions SET revision=revision+1 WHERE dotId=?',
        )
        .run(value.dotId);
      return this.resolveDot(value.dotId);
    });
  }
  bindProject(input: Project, expectedRevision = 0) {
    const value = projectSchema.parse(input);
    if (!this.grants.spaceExists(value.spaceId))
      throw new Error('Unknown Space.');
    return this.transaction(() => {
      const previous = this.row('runtime_projects', 'spaceId', value.spaceId);
      if (Number(previous?.revision ?? 0) !== expectedRevision)
        throw new Error('Runtime binding revision conflict.');
      if (previous && previous.value !== JSON.stringify(value))
        throw new Error('Runtime project identity is immutable.');
      this.db
        .prepare(
          `INSERT INTO runtime_projects VALUES (?, ?, ?, ?, ?, ?, 1, 0) ON CONFLICT(spaceId) DO UPDATE SET revision=revision+1, revoked=0`,
        )
        .run(
          value.spaceId,
          this.ownerId,
          value.gatewayId,
          value.profileId,
          value.projectId,
          JSON.stringify(value),
        );
      this.db
        .prepare(
          'UPDATE dot_access_revisions SET revision=revision+1 WHERE dotId IN (SELECT dotId FROM dot_spaces WHERE spaceId=?)',
        )
        .run(value.spaceId);
      return { ...value, revision: expectedRevision + 1 };
    });
  }
  resolveDot(
    dotId: string,
    spaceId: string | null = null,
  ): VerifiedRuntimeScope {
    const row = this.row('runtime_agents', 'dotId', dotId);
    if (!row || row.revoked || !this.grants.dotExists(dotId))
      throw new Error('Runtime Dot binding unavailable.');
    const agent = agentSchema.parse(JSON.parse(String(row.value)));
    const grant = this.db
      .prepare('SELECT revision FROM dot_access_revisions WHERE dotId=?')
      .get(dotId);
    if (!grant) throw new Error('Runtime Dot grants unavailable.');
    let project: Project | null = null;
    let projectRevision: number | null = null;
    if (spaceId !== null) {
      const mapped = this.row('runtime_projects', 'spaceId', spaceId);
      if (
        !mapped ||
        mapped.revoked ||
        !this.grants.spaceExists(spaceId) ||
        !this.grants.canAccessSpace(dotId, spaceId)
      )
        throw new Error('Runtime Space access denied.');
      project = projectSchema.parse(JSON.parse(String(mapped.value)));
      if (
        project.gatewayId !== agent.gatewayId ||
        project.profileId !== agent.profileId
      )
        throw new Error('Runtime Space scope mismatch.');
      projectRevision = Number(mapped.revision);
    }
    return {
      ...agent,
      ownerId: this.ownerId,
      agentRevision: Number(row.revision),
      grantRevision: Number(grant.revision),
      authorityRevision: Number(grant.revision),
      spaceId,
      projectId: project?.projectId ?? null,
      projectRevision,
    };
  }
  bindConversation(
    input: Conversation,
    expectedRevision = 0,
  ): VerifiedConversationScope {
    const value = conversationSchema.parse(input);
    return this.transaction(() => {
      this.resolveDot(value.dotId, value.spaceId);
      const previous = this.row(
        'runtime_conversations',
        'conversationId',
        value.conversationId,
      );
      if (Number(previous?.revision ?? 0) !== expectedRevision)
        throw new Error('Runtime binding revision conflict.');
      if (previous) {
        const old = conversationSchema.parse(
          JSON.parse(String(previous.value)),
        );
        if (
          old.dotId !== value.dotId ||
          old.spaceId !== value.spaceId ||
          old.durableSessionId !== value.durableSessionId ||
          value.liveGeneration <= old.liveGeneration ||
          previous.revoked
        )
          throw new Error(
            'Conversation authority cannot be replaced or revived.',
          );
      }
      this.db
        .prepare(
          `INSERT INTO runtime_conversations VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0) ON CONFLICT(conversationId) DO UPDATE SET liveSessionId=excluded.liveSessionId, value=excluded.value, revision=revision+1`,
        )
        .run(
          value.conversationId,
          this.ownerId,
          value.dotId,
          value.durableSessionId,
          value.liveSessionId,
          JSON.stringify(value),
        );
      return this.resolveConversation(value.conversationId, 'read');
    });
  }
  resolveConversation(
    conversationId: string,
    access: 'read' | 'write' | 'subscribe' | 'download' = 'read',
  ): VerifiedConversationScope {
    const row = this.row(
      'runtime_conversations',
      'conversationId',
      conversationId,
    );
    if (!row || row.revoked || (row.archived && access !== 'read'))
      throw new Error('Runtime conversation access denied.');
    const value = conversationSchema.parse(JSON.parse(String(row.value)));
    return {
      ...this.resolveDot(value.dotId, value.spaceId),
      ...value,
      revision: Number(row.revision),
      archived: !!row.archived,
    };
  }
  /** Call again before each streamed chunk, download, or effect, not just admission. */
  assertCurrent(
    scope: VerifiedRuntimeScope | VerifiedConversationScope,
    access: 'read' | 'write' | 'subscribe' | 'download' = 'read',
  ) {
    const current =
      'conversationId' in scope
        ? this.resolveConversation(scope.conversationId, access)
        : this.resolveDot(scope.dotId, scope.spaceId);
    if (JSON.stringify(current) !== JSON.stringify(scope))
      throw new Error('Stale runtime authority.');
  }
  archiveConversation(
    conversationId: string,
    archived: boolean,
    expectedRevision: number,
  ) {
    const result = this.db
      .prepare(
        'UPDATE runtime_conversations SET archived=?, revision=revision+1 WHERE conversationId=? AND ownerId=? AND revision=? AND revoked=0',
      )
      .run(+archived, conversationId, this.ownerId, expectedRevision);
    if (!result.changes) throw new Error('Runtime binding revision conflict.');
  }
  revoke(
    kind: 'agent' | 'project' | 'conversation',
    id: string,
    expectedRevision: number,
  ) {
    const [table, key] = {
      agent: ['runtime_agents', 'dotId'],
      project: ['runtime_projects', 'spaceId'],
      conversation: ['runtime_conversations', 'conversationId'],
    }[kind];
    const result = this.db
      .prepare(
        `UPDATE ${table} SET revoked=1, revision=revision+1 WHERE ${key}=? AND ownerId=? AND revision=?`,
      )
      .run(id, this.ownerId, expectedRevision);
    if (!result.changes) throw new Error('Runtime binding revision conflict.');
  }
}
