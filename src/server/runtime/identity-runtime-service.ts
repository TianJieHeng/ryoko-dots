import { ReadinessEvidence } from '../operations/readiness-evidence.js';
import { frozenLegacyMemoryInventory } from './be06-migration.js';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { WorkspaceStore } from '../workspace.js';
import { browserScope, type Guard } from '../self-hosted-platform.js';
import { contractVersion } from '../../shared/runtime/contracts.js';
import { specialistsSchema } from '../../shared/runtime/agents.js';
import type {
  AgentConfigurationRecord,
  WorkflowRunPrepareResult,
} from '../../shared/runtime/be06-producer/wire.generated.js';
import {
  IdentitySkillService,
  Be06Error,
  type Be06Binding,
  type OperationInput,
} from './be06-service.js';
import type { Be06Method } from './be06-wire.js';
import type { ConversationTransport } from './stdio.js';
import type { ControlBinding } from './control-service.js';
import type { VerifiedConversationScope } from './bindings.js';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const requireThat = (value: unknown, code: string) => {
  if (!value) throw new Be06Error(code, 403);
};
/** Owner-process registry and conversation-specific admission, never display-selected authority. */
export class IdentityRuntimeService {
  readonly operations: IdentitySkillService;
  private db: DatabaseSync;
  private readinessEvidence = {
    memory: new ReadinessEvidence(),
    learning: new ReadinessEvidence(),
  };
  operationalState(surface: 'memory' | 'learning') {
    return this.readinessEvidence[surface].read(
      this.transport.epoch ?? 0,
      this.transport.connected,
    );
  }
  constructor(
    private workspace: WorkspaceStore,
    database: string,
    private transport: ConversationTransport,
    private bound: (
      id: string,
      auth: Guard,
      access: 'read' | 'write',
    ) => ControlBinding,
    private fence: (
      scope: VerifiedConversationScope,
      auth: Guard,
      access: 'read' | 'write',
    ) => void,
    publicationReviewed: (
      conversationId: string,
      prepared: WorkflowRunPrepareResult,
      auth: Guard,
    ) => Promise<void>,
  ) {
    this.db = new DatabaseSync(database);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS runtime_identity_directory(agentId TEXT PRIMARY KEY,dotId TEXT UNIQUE NOT NULL,ownerId TEXT NOT NULL,authority TEXT NOT NULL,record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_identity_management(conversationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL);`);
    workspace.frozenLearningInventory();
    frozenLegacyMemoryInventory(this.db, workspace.ownerId);
    this.operations = new IdentitySkillService(
      workspace.ownerId,
      database,
      transport,
      (id, auth, access, projectId) =>
        this.binding(id, auth, access, projectId ?? null),
      (b, auth, access) => this.assertCurrent(b, auth, access),
      (b, prepared, auth) =>
        publicationReviewed(b.conversationId, prepared, auth),
    );
  }
  close() {
    this.operations.close();
    this.db.close();
  }
  private directoryAuthority() {
    return JSON.stringify({
      ownerId: this.workspace.ownerId,
      gatewayId: this.transport.config.gatewayId,
      home: this.transport.config.home,
      identity: this.transport.config.identity,
    });
  }
  private entry(agentId: string) {
    const row = this.db
      .prepare(
        'SELECT * FROM runtime_identity_directory WHERE agentId=? AND ownerId=?',
      )
      .get(agentId, this.workspace.ownerId);
    if (!row) return undefined;
    requireThat(
      row.authority === this.directoryAuthority(),
      'identity_directory_authority_changed',
    );
    return {
      dotId: String(row.dotId),
      agent: JSON.parse(String(row.record)) as AgentConfigurationRecord,
    };
  }
  private mappings() {
    return (
      this.transport.config.identityProjects ??
      this.transport.config.nativePages?.projects ??
      []
    );
  }
  async mirror(
    agent: AgentConfigurationRecord,
    auth: Guard,
    management?: ControlBinding,
  ) {
    const config = this.transport.config,
      primary = config.identity.agent_id;
    requireThat(
      agent.role === 'primary'
        ? agent.agent_id === primary &&
            agent.memory_backend === 'personal_mcp' &&
            agent.builtin_memory_namespace === null
        : agent.agent_id !== primary &&
            agent.memory_backend === 'builtin' &&
            !!agent.builtin_memory_namespace,
      'producer_identity_mismatch',
    );
    const prior = this.entry(agent.agent_id);
    if (prior) {
      requireThat(
        prior.agent.role === agent.role &&
          prior.agent.memory_backend === agent.memory_backend &&
          prior.agent.builtin_memory_namespace ===
            agent.builtin_memory_namespace,
        'stable_identity_changed',
      );
      if (prior.agent.revision > agent.revision) return prior;
    }
    const dotId =
      prior?.dotId ??
      (agent.role === 'primary'
        ? config.dotId
        : `ryoko-${hash(JSON.stringify([this.workspace.ownerId, config.gatewayId, config.identity.profile_id, agent.agent_id])).slice(0, 32)}`);
    const maps: { spaceId: string; projectId: string }[] = [];
    for (const mapping of this.mappings()) {
      if (
        agent.archived ||
        !(agent.config.project_grants ?? []).includes(mapping.projectId)
      )
        continue;
      // A primary's own narrowing can fence its calling snapshot before a
      // follow-up project read. Preserve only already verified, still-configured
      // Space access; never expand from this revoked session. Reconnect rechecks.
      if (agent.role === 'primary' && agent.active_session_revision_revoked) {
        if (prior && this.workspace.canAccessSpace(dotId, mapping.spaceId))
          maps.push(mapping);
        continue;
      }
      const manager = management ?? this.management(auth);
      const reply = await this.transport.call('runtime.project.get', {
        schema_version: 1,
        session_id: manager.binding.liveSessionId,
        project_id: mapping.projectId,
      });
      this.fence(manager.scope, auth, 'read');
      requireThat(
        reply.project.id === mapping.projectId &&
          reply.project.project_id === mapping.projectId &&
          reply.project.owner_principal_id === config.identity.principal_id,
        'project_identity_mismatch',
      );
      if (
        !reply.project.archived &&
        reply.project.grants.some(
          (grant) =>
            grant.principal_id === config.identity.principal_id &&
            grant.agent_id === agent.agent_id &&
            grant.permissions.includes('read'),
        )
      )
        maps.push(mapping);
    }
    const latest = this.entry(agent.agent_id);
    if (latest && latest.agent.revision > agent.revision) return latest;
    auth();
    this.workspace.mirrorRuntimeDot(dotId, {
      name: agent.config.name,
      instructions: agent.config.instructions ?? '',
      researchAllowed: agent.config.research_allowed ?? true,
      memoryAllowed: agent.config.memory_allowed ?? true,
      spaceIds: maps.map((m) => m.spaceId),
      defaultSpaceId:
        maps.find((m) => m.projectId === agent.config.default_project_id)
          ?.spaceId ?? null,
    });
    if (!this.workspace.runtimeBindings.hasAgent(dotId))
      this.workspace.runtimeBindings.bindAgent({
        dotId,
        gatewayId: config.gatewayId,
        principalId: config.identity.principal_id,
        profileId: config.identity.profile_id,
        agentId: agent.agent_id,
        privilegeClass: agent.role,
      });
    this.db
      .prepare(
        'INSERT INTO runtime_identity_directory VALUES(?,?,?,?,?) ON CONFLICT(agentId) DO UPDATE SET record=excluded.record',
      )
      .run(
        agent.agent_id,
        dotId,
        this.workspace.ownerId,
        this.directoryAuthority(),
        JSON.stringify(agent),
      );
    // Archival stays visible as a directory record; producer denies new enrollment/effects.
    return { dotId, agent };
  }
  async verifySession(
    scope: VerifiedConversationScope,
    sessionId: string,
    auth: Guard,
  ) {
    auth();
    const status = await this.transport.call('runtime.agent.session.get', {
      schema_version: 1,
      session_id: sessionId,
    });
    auth();
    this.workspace.runtimeBindings.assertCurrent(scope);
    requireThat(
      status.agent_id === scope.agentId &&
        status.role === scope.privilegeClass &&
        status.memory_backend ===
          (scope.privilegeClass === 'primary' ? 'personal_mcp' : 'builtin') &&
        status.startup_frozen &&
        status.activation === 'next_session',
      'enrolled_session_identity_mismatch',
    );
    requireThat(
      status.authority_current && !status.archived,
      'enrolled_session_authority_revoked',
    );
    if (scope.privilegeClass === 'specialist') {
      const expected = this.entry(scope.agentId);
      requireThat(
        expected && expected.dotId === scope.dotId && !expected.agent.archived,
        'specialist_not_verified',
      );
    }
    return status;
  }
  async connected(conversationId: string, auth: Guard) {
    if (!this.transport.be06Qualification) return;
    const b = this.bound(conversationId, auth, 'read');
    if (b.scope.privilegeClass !== 'primary') return;
    const result = await this.transport.call('runtime.agent.list', {
      schema_version: 1,
      session_id: b.binding.liveSessionId,
    });
    this.fence(b.scope, auth, 'read');
    requireThat(
      new Set(result.agents.map((a) => a.agent_id)).size ===
        result.agents.length,
      'duplicate_agent_ids',
    );
    const namespaces = result.agents
      .filter((a) => a.role === 'specialist')
      .map((a) => a.builtin_memory_namespace);
    requireThat(
      new Set(namespaces).size === namespaces.length,
      'duplicate_memory_namespaces',
    );
    for (const record of result.agents)
      await this.mirror(record, auth, this.bound(conversationId, auth, 'read'));
    this.db
      .prepare('INSERT OR IGNORE INTO runtime_identity_management VALUES(?,?)')
      .run(conversationId, this.workspace.ownerId);
    await this.projects(this.transport.config.dotId, auth);
  }
  private management(auth: Guard) {
    for (const row of this.db
      .prepare(
        'SELECT conversationId FROM runtime_identity_management WHERE ownerId=? ORDER BY rowid DESC',
      )
      .all(this.workspace.ownerId)) {
      try {
        const b = this.bound(String(row.conversationId), auth, 'read');
        if (b.scope.privilegeClass === 'primary') return b;
      } catch {
        auth();
      }
    }
    throw new Be06Error(
      'Connect a primary conversation before managing identities.',
      503,
    );
  }
  async projects(dotId: string, auth: Guard) {
    const original = this.workspace.runtimeBindings.resolveDot(dotId);
    const registryOwner = this.management(auth);
    const latest = await this.transport.call('runtime.agent.get', {
      schema_version: 1,
      session_id: registryOwner.binding.liveSessionId,
      agent_id: original.agentId,
    });
    this.fence(registryOwner.scope, auth, 'read');
    requireThat(
      latest.agent.agent_id === original.agentId,
      'agent_registry_response_mismatch',
    );
    await this.mirror(latest.agent, auth);
    const scope = this.workspace.runtimeBindings.resolveDot(dotId);
    auth();
    let manager = this.management(auth);
    const projects: { spaceId: string; projectId: string }[] = [];
    for (const mapping of this.mappings()) {
      if (!this.workspace.canAccessSpace(dotId, mapping.spaceId)) continue;
      const result = await this.transport.call('runtime.project.get', {
        schema_version: 1,
        session_id: manager.binding.liveSessionId,
        project_id: mapping.projectId,
      });
      this.fence(manager.scope, auth, 'read');
      requireThat(
        result.project.id === mapping.projectId &&
          result.project.project_id === mapping.projectId &&
          !result.project.archived &&
          result.project.owner_principal_id === scope.principalId,
        'project_identity_mismatch',
      );
      if (
        !result.project.grants.some(
          (g) =>
            g.principal_id === scope.principalId &&
            g.agent_id === scope.agentId &&
            g.permissions.includes('read'),
        )
      )
        continue;
      try {
        const prior = this.workspace.runtimeBindings.resolveDot(
          dotId,
          mapping.spaceId,
        );
        requireThat(
          prior.projectId === mapping.projectId,
          'project_binding_changed',
        );
      } catch (error) {
        // Only a truly absent server mapping may be established; revoked records stay revoked.
        const saved = this.db
          .prepare('SELECT projectId FROM runtime_projects WHERE spaceId=?')
          .get(mapping.spaceId);
        if (saved) throw error;
        this.workspace.runtimeBindings.bindProject({
          ...mapping,
          gatewayId: scope.gatewayId,
          profileId: scope.profileId,
        });
      }
      manager = this.management(auth);
      projects.push(mapping);
    }
    return {
      version: contractVersion,
      scope: browserScope(this.workspace.runtimeBindings.resolveDot(dotId)),
      projects,
    };
  }
  async specialists(dotId: string, auth: Guard) {
    const manager = this.management(auth);
    const value = await this.transport.call('runtime.agent.list', {
      schema_version: 1,
      session_id: manager.binding.liveSessionId,
    });
    this.fence(manager.scope, auth, 'read');
    const rows: { dotId: string; agent: AgentConfigurationRecord }[] = [];
    for (const agent of value.agents) {
      const row = await this.mirror(agent, auth);
      if (!agent.archived) rows.push(row);
    }
    const scope = this.workspace.runtimeBindings.resolveDot(dotId);
    auth();
    return specialistsSchema.parse({
      version: contractVersion,
      scope: browserScope(scope),
      specialists: rows.map(({ dotId, agent }) => ({
        id: agent.agent_id,
        dotId,
        name: agent.config.name,
        instructions: agent.config.instructions ?? '',
        revision: agent.revision,
        role: agent.role,
        memoryBackend:
          agent.memory_backend === 'personal_mcp'
            ? 'personal_harness'
            : 'built_in',
        memoryEnabled: agent.config.memory_allowed ?? true,
        researchAllowed: agent.config.research_allowed ?? true,
        spaceIds: this.workspace.dot(dotId)!.spaceIds,
        defaultSpaceId:
          this.mappings().find(
            (m) =>
              m.projectId === agent.config.default_project_id &&
              this.workspace.canAccessSpace(dotId, m.spaceId),
          )?.spaceId ?? null,
      })),
    });
  }
  private async binding(
    id: string,
    auth: Guard,
    access: 'read' | 'write',
    projectId: string | null,
  ): Promise<Be06Binding> {
    const bound = this.bound(id, auth, access);
    await this.verifySession(bound.scope, bound.binding.liveSessionId, auth);
    let scope = bound.scope;
    if (projectId !== null) {
      const projects = await this.projects(scope.dotId, auth),
        mapping = projects.projects.find((p) => p.projectId === projectId);
      requireThat(mapping, 'project_not_currently_granted');
      scope = {
        ...this.workspace.runtimeBindings.resolveConversation(id, access),
        ...this.workspace.runtimeBindings.resolveDot(
          scope.dotId,
          mapping!.spaceId,
        ),
      };
      // Conversation identity is retained; project selection is an operation-local grant.
    }
    const entry = this.entry(scope.agentId);
    requireThat(
      entry && entry.dotId === scope.dotId,
      'identity_directory_unavailable',
    );
    return {
      ownerId: scope.ownerId,
      conversationId: id,
      dotId: scope.dotId,
      principalId: scope.principalId,
      profileId: scope.profileId,
      agentId: scope.agentId,
      primaryAgentId: this.transport.config.identity.agent_id,
      role: scope.privilegeClass,
      memoryBackend: entry!.agent.memory_backend,
      namespaceId: entry!.agent.builtin_memory_namespace,
      profileHomeDigest: hash(this.transport.config.home),
      policyDigest: this.transport.config.identity.policy_digest,
      configDigest: this.transport.config.identity.config_digest,
      projectId,
      authorityRevision: scope.authorityRevision,
      liveSessionId: bound.binding.liveSessionId,
      durableSessionId: scope.durableSessionId,
      epoch: bound.epoch,
    };
  }
  async refreshCommandAccess(scope: VerifiedConversationScope, auth: Guard) {
    if (!this.mappings().length) return;
    requireThat(this.entry(scope.agentId), 'identity_directory_unavailable');
    const live = this.bound(scope.conversationId, auth, 'read');
    await this.verifySession(scope, live.binding.liveSessionId, auth);
    await this.projects(scope.dotId, auth);
    this.workspace.runtimeBindings.assertCurrent(scope);
  }
  scheduleDefaultSpace(dotId: string): string | null {
    const scope = this.workspace.runtimeBindings.resolveDot(dotId);
    const projectId = this.entry(scope.agentId)?.agent.config
      .default_project_id;
    if (!projectId) return null;
    return (
      this.mappings().find(
        (mapping) =>
          mapping.projectId === projectId &&
          this.workspace.canAccessSpace(dotId, mapping.spaceId),
      )?.spaceId ?? null
    );
  }
  async projectReviewScope(id: string, projectId: string, auth: Guard) {
    const b = await this.binding(id, auth, 'read', projectId);
    return {
      scope: {
        ...browserScope(this.bound(id, auth, 'read').scope),
        project: projectId,
      },
      assertCurrent: () => this.assertCurrent(b, auth, 'read'),
    };
  }
  private assertCurrent(b: Be06Binding, auth: Guard, access: 'read' | 'write') {
    const current = this.bound(b.conversationId, auth, access);
    this.fence(current.scope, auth, access);
    requireThat(
      current.scope.ownerId === b.ownerId &&
        current.scope.agentId === b.agentId &&
        current.scope.dotId === b.dotId &&
        current.scope.authorityRevision === b.authorityRevision &&
        current.binding.liveSessionId === b.liveSessionId &&
        current.epoch === b.epoch,
      'identity_authority_changed',
    );
    if (b.projectId !== null) {
      const mapping = this.mappings().find((p) => p.projectId === b.projectId);
      requireThat(mapping, 'project_mapping_unavailable');
      const scope = this.workspace.runtimeBindings.resolveDot(
        b.dotId,
        mapping!.spaceId,
      );
      requireThat(scope.projectId === b.projectId, 'project_authority_changed');
    }
  }
  private envelope(
    conversationId: string,
    projectId: string | null,
    auth: Guard,
  ) {
    const b = this.bound(conversationId, auth, 'read');
    return {
      version: contractVersion,
      conversationId,
      scope: { ...browserScope(b.scope), project: projectId },
    };
  }
  private project(payload: unknown, provided?: string | null): string | null {
    const p = payload as Record<string, unknown>;
    if (typeof p.reviewOperationId === 'string')
      return this.operations.operationContext(p.reviewOperationId).projectId;
    if (typeof p.project_id === 'string') return p.project_id;
    if (typeof p.definition_json === 'string')
      return JSON.parse(p.definition_json).project_id;
    if (typeof p.scope === 'string' && p.scope.startsWith('project:'))
      return p.scope.slice(8);
    return provided ?? null;
  }
  async read(
    id: string,
    method: Be06Method,
    payload: unknown,
    auth: Guard,
    projectId?: string | null,
  ) {
    const result = await this.operations.read(
      id,
      method,
      payload,
      auth,
      projectId,
    );
    if (method === 'runtime.agent.list')
      for (const agent of (result as { agents: AgentConfigurationRecord[] })
        .agents)
        await this.mirror(agent, auth);
    const envelope = this.envelope(id, this.project(payload, projectId), auth);
    if (
      method === 'runtime.memory.status' &&
      envelope.scope.agent === this.transport.config.identity.agent_id
    ) {
      const health = (result as { health: { status: string } }).health.status;
      this.readinessEvidence.memory.record(
        health === 'ready'
          ? 'ready'
          : health === 'unconfigured'
            ? 'unconfigured'
            : 'unavailable',
        this.transport.epoch ?? 0,
      );
    }
    if (
      method === 'runtime.workflow.list' &&
      envelope.scope.agent === this.transport.config.identity.agent_id
    )
      this.readinessEvidence.learning.record(
        'ready',
        this.transport.epoch ?? 0,
      );
    return { ...envelope, result };
  }
  async act(
    id: string,
    method: Be06Method,
    payload: unknown,
    input: OperationInput,
    auth: Guard,
    projectId?: string | null,
  ) {
    const receipt = await this.operations.act(
      id,
      method,
      payload,
      input,
      auth,
      projectId,
    );
    const envelope = this.envelope(id, this.project(payload, projectId), auth);
    if (
      receipt.result &&
      typeof receipt.result === 'object' &&
      'agent' in receipt.result
    )
      await this.mirror(
        (receipt.result as { agent: AgentConfigurationRecord }).agent,
        auth,
      );
    return {
      ...envelope,
      ...receipt,
    };
  }
  async inspect(operationId: string, auth: Guard) {
    const context = this.operations.operationContext(operationId),
      receipt = await this.operations.inspect(operationId, auth);
    if (
      receipt.result &&
      typeof receipt.result === 'object' &&
      'agent' in receipt.result
    )
      await this.mirror(
        (receipt.result as { agent: AgentConfigurationRecord }).agent,
        auth,
      );
    return {
      ...this.envelope(context.conversationId, context.projectId, auth),
      ...receipt,
    };
  }
  async present(operationId: string, auth: Guard) {
    const context = this.operations.operationContext(operationId),
      review = await this.operations.present(operationId, auth);
    return {
      ...this.envelope(context.conversationId, context.projectId, auth),
      ...review,
    };
  }
  async exportMemory(
    id: string,
    projectId: string | null,
    includeDeleted: boolean,
    auth: Guard,
  ) {
    const binding = await this.binding(id, auth, 'read', projectId);
    const result = await this.operations.exportMemory(
      id,
      includeDeleted,
      auth,
      projectId,
    );
    return {
      ...result,
      assertCurrent: () => this.assertCurrent(binding, auth, 'read'),
    };
  }
  legacyMemory(dotId: string, offset: number, auth: Guard) {
    auth();
    const scope = this.workspace.runtimeBindings.resolveDot(dotId);
    requireThat(
      scope.privilegeClass === 'primary' &&
        scope.agentId === this.transport.config.identity.agent_id,
      'legacy_global_memory_is_primary_only',
    );
    return {
      version: contractVersion,
      scope: browserScope(scope),
      ...frozenLegacyMemoryInventory(this.db, this.workspace.ownerId, offset),
    };
  }
  legacy(dotId: string, auth: Guard) {
    auth();
    const scope = this.workspace.runtimeBindings.resolveDot(dotId);
    return {
      version: contractVersion,
      scope: browserScope(scope),
      enrollments: this.workspace
        .frozenLearningInventory()
        .filter((row) => row.evidence.dotId === dotId),
    };
  }
}
