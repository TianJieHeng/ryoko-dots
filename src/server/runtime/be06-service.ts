import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  initializeOperationRegistry,
  claimOperation,
} from './operation-registry.js';
import {
  validateBe06Wire,
  type Be06Method,
  type Be06Params,
  type Be06Results,
} from './be06-wire.js';
import type {
  AgentConfigurationRecord,
  MemoryRecord,
  WorkflowRecord,
} from '../../shared/runtime/be06-producer/wire.generated.js';

export const BE06_PRODUCER_COMMIT = '98b9eeb7d2afc02d0e0393fea285f010000a0378';
export type Guard = () => void;
/** Construct only from verified server bindings + producer session inspection, never browser settings. */
export interface Be06Binding {
  ownerId: string;
  conversationId: string;
  dotId: string;
  principalId: string;
  profileId: string;
  agentId: string;
  primaryAgentId: string;
  role: 'primary' | 'specialist';
  memoryBackend: 'personal_mcp' | 'builtin';
  namespaceId: string | null;
  profileHomeDigest: string;
  policyDigest: string;
  configDigest: string;
  projectId: string | null;
  authorityRevision: number;
  liveSessionId: string;
  durableSessionId: string;
  epoch: number;
}
export interface Be06Transport {
  readonly connected: boolean;
  readonly epoch?: number;
  /** Absent in today's stdio implementation. This is a qualification result, not configuration intent. */
  readonly be06Qualification?: {
    producerCommit: string;
    methods: readonly Be06Method[];
    specialistSessions: boolean;
  };
  call<M extends Be06Method>(
    method: M,
    params: Be06Params[M],
  ): Promise<Be06Results[M]>;
}
const readMethods = new Set<Be06Method>([
  'runtime.agent.list',
  'runtime.agent.get',
  'runtime.agent.session.get',
  'runtime.memory.status',
  'runtime.memory.record.get',
  'runtime.memory.records.list',
  'runtime.specialist.catalog',
  'runtime.specialist.status',
  'runtime.evidence.get',
  'runtime.evidence.list',
  'runtime.workflow.get',
  'runtime.workflow.list',
  'runtime.workflow.runs',
  'runtime.workflow.delivery.list',
]);
const reviewedMethods = new Set<Be06Method>([
  'runtime.workflow.decision.commit',
  'runtime.workflow.delivery.commit',
  'runtime.workflow.run.publish',
  'runtime.specialist.handoff',
  'runtime.artifact.cancel',
]);
const prepareFor = {
  'runtime.workflow.decision.commit': 'runtime.workflow.decision.prepare',
  'runtime.workflow.delivery.commit': 'runtime.workflow.delivery.prepare',
  'runtime.workflow.run.publish': 'runtime.workflow.run.prepare',
  'runtime.specialist.handoff': 'runtime.specialist.preview',
} as const;
const prepareMethods = new Set<string>(Object.values(prepareFor));
const idSchema = z.string().min(1).max(256);
const operationSchema = z.strictObject({
  operationId: z.uuid(),
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedGeneration: z.number().int().nonnegative(),
});
export type OperationInput = z.infer<typeof operationSchema>;
type Json = Record<string, unknown>;
interface Row {
  operationId: string;
  ownerId: string;
  conversationId: string;
  authority: string;
  digest: string;
  intent: string;
  state: 'pending' | 'accepted' | 'rejected' | 'outcome_unknown';
  result: string | null;
  evidence: string | null;
}
export class Be06Error extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 409,
  ) {
    super(code);
  }
}
const requireThat: (
  condition: unknown,
  code: string,
  status?: Be06Error['status'],
) => asserts condition = (condition, code, status) => {
  if (!condition) throw new Be06Error(code, status);
};
function canonicalValue(value: unknown, depth = 0): unknown {
  requireThat(depth <= 32, 'json_depth_exceeded', 400);
  if (Array.isArray(value))
    return value.map((item) => canonicalValue(item, depth + 1));
  if (value && typeof value === 'object') {
    requireThat(
      Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null,
      'invalid_json',
      400,
    );
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalValue(item, depth + 1)]),
    );
  }
  requireThat(
    value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)),
    'invalid_json',
    400,
  );
  return value;
}
export function canonicalBe06(value: unknown): string {
  const text = JSON.stringify(canonicalValue(value));
  requireThat(Buffer.byteLength(text) <= 1_000_000, 'payload_too_large', 400);
  return text;
}
export const be06Digest = (value: unknown) =>
  createHash('sha256').update(canonicalBe06(value)).digest('hex');
export const be06IntentDigest = (method: string, payload: unknown) =>
  be06Digest({ method, payload });
const object = (value: unknown): Json => {
  requireThat(
    !!value && typeof value === 'object' && !Array.isArray(value),
    'object_required',
    400,
  );
  return value as Json;
};
const detached = <T>(value: T): T => JSON.parse(canonicalBe06(value)) as T;

/** Staged BE06 admission seam. No model, MCP client, global memory injector or fallback backend. */
export class IdentitySkillService {
  private db: DatabaseSync;
  constructor(
    private ownerId: string,
    database: string,
    private transport: Be06Transport,
    private boundSession: (
      conversationId: string,
      auth: Guard,
      access: 'read' | 'write',
      projectId?: string | null,
    ) => Promise<Be06Binding>,
    private assertCurrent: (
      binding: Be06Binding,
      auth: Guard,
      access: 'read' | 'write',
    ) => void,
    /** Must use BE05 exact prepared bytes/reviews. Metadata-only acknowledgement does not qualify. */
    private assertPublicationReviewed?: (
      binding: Be06Binding,
      prepared: Be06Results['runtime.workflow.run.prepare'],
      auth: Guard,
    ) => Promise<void>,
  ) {
    this.db = new DatabaseSync(database);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_identity_skill_ingress(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,conversationId TEXT NOT NULL,authority TEXT NOT NULL,digest TEXT NOT NULL,intent TEXT NOT NULL,state TEXT NOT NULL,result TEXT,evidence TEXT);
      CREATE TABLE IF NOT EXISTS runtime_identity_skill_origins(operationId TEXT PRIMARY KEY,liveBinding TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_identity_skill_presentations(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,authority TEXT NOT NULL,liveBinding TEXT NOT NULL,fingerprint TEXT NOT NULL);`);
    initializeOperationRegistry(this.db, 'identity_skill');
  }
  close() {
    this.db.close();
  }
  private authority(b: Be06Binding) {
    return canonicalBe06(
      Object.fromEntries(
        Object.entries(b).filter(
          ([key]) => key !== 'liveSessionId' && key !== 'epoch',
        ),
      ),
    );
  }
  private liveKey(b: Be06Binding) {
    return canonicalBe06([b.liveSessionId, b.epoch]);
  }
  private fence(b: Be06Binding, auth: Guard, access: 'read' | 'write') {
    auth();
    this.assertCurrent(b, auth, access);
    requireThat(
      b.ownerId === this.ownerId &&
        this.transport.connected &&
        (this.transport.epoch ?? 0) === b.epoch,
      'binding_changed',
    );
    requireThat(
      b.role === 'primary'
        ? b.agentId === b.primaryAgentId &&
            b.memoryBackend === 'personal_mcp' &&
            b.namespaceId === null
        : b.agentId !== b.primaryAgentId &&
            b.memoryBackend === 'builtin' &&
            !!b.namespaceId,
      'memory_identity_mismatch',
      403,
    );
  }
  private qualified(b: Be06Binding, method: Be06Method) {
    const q = this.transport.be06Qualification;
    requireThat(
      q?.producerCommit === BE06_PRODUCER_COMMIT &&
        q.methods.includes(method) &&
        (b.role === 'primary' || q.specialistSessions),
      'be06_transport_unqualified',
      503,
    );
  }
  private body(payload: unknown) {
    const body = object(detached(payload));
    requireThat(
      !['schema_version', 'session_id', 'command_id', 'idempotency_key'].some(
        (key) => key in body,
      ),
      'caller_selected_authority',
      400,
    );
    return body;
  }
  private scope(b: Be06Binding, method: Be06Method, params: Json) {
    if (
      method.startsWith('runtime.agent.') &&
      method !== 'runtime.agent.session.get'
    )
      requireThat(b.role === 'primary', 'primary_owner_required', 403);
    if (
      method.startsWith('runtime.memory.') &&
      method !== 'runtime.memory.status'
    )
      requireThat(
        b.role === 'specialist' && b.memoryBackend === 'builtin',
        'personal_harness_operation_unsupported',
        503,
      );
    if ('project_id' in params)
      requireThat(
        params.project_id === b.projectId,
        'project_scope_mismatch',
        403,
      );
    if ('definition_json' in params) {
      let definition: Json;
      try {
        definition = object(JSON.parse(String(params.definition_json)));
      } catch {
        throw new Be06Error('invalid_workflow_definition', 400);
      }
      requireThat(
        definition.project_id === b.projectId && b.projectId !== null,
        'project_scope_mismatch',
        403,
      );
    }
    if (method === 'runtime.memory.record.write' && params.scope !== undefined)
      requireThat(
        params.scope === 'individual' ||
          (b.projectId !== null && params.scope === `project:${b.projectId}`),
        'memory_scope_mismatch',
        403,
      );
    if (method === 'runtime.agent.create')
      requireThat(
        params.copy_from_agent_id !== b.primaryAgentId,
        'primary_copy_forbidden',
        403,
      );
  }
  private wire(
    b: Be06Binding,
    method: Be06Method,
    payload: Json,
    operationId?: string,
  ) {
    const params: Json = {
      ...payload,
      schema_version: 1,
      session_id: b.liveSessionId,
    };
    if (
      operationId &&
      ((method.startsWith('runtime.workflow.') && !method.endsWith('.list')) ||
        method === 'runtime.specialist.handoff')
    )
      params.command_id ??= operationId;
    if (method === 'runtime.specialist.handoff')
      params.idempotency_key = operationId;
    validateBe06Wire(method, 'params', params);
    this.scope(b, method, params);
    return params;
  }
  private agent(b: Be06Binding, value: AgentConfigurationRecord) {
    requireThat(
      value.role === 'primary'
        ? value.agent_id === b.primaryAgentId &&
            value.memory_backend === 'personal_mcp' &&
            value.builtin_memory_namespace === null
        : value.agent_id !== b.primaryAgentId &&
            value.memory_backend === 'builtin' &&
            !!value.builtin_memory_namespace,
      'agent_response_scope_mismatch',
      403,
    );
  }
  private record(b: Be06Binding, row: MemoryRecord) {
    requireThat(
      row.owner_agent_id === b.agentId &&
        row.owner_principal_id === b.principalId &&
        row.owner_profile_id === b.profileId &&
        row.namespace_id === b.namespaceId &&
        (row.scope === 'individual' ||
          (b.projectId !== null && row.scope === `project:${b.projectId}`)),
      'memory_response_scope_mismatch',
      403,
    );
  }
  private checkResult(
    b: Be06Binding,
    method: Be06Method,
    params: Json,
    value: unknown,
  ) {
    validateBe06Wire(method, 'result', value);
    const result = object(value);
    if ('agent' in result) {
      const agent = result.agent as AgentConfigurationRecord;
      this.agent(b, agent);
      if ('agent_id' in params)
        requireThat(
          agent.agent_id === params.agent_id,
          'agent_response_scope_mismatch',
          403,
        );
      if (method === 'runtime.agent.create')
        requireThat(
          agent.role === 'specialist' &&
            agent.agent_id !== params.copy_from_agent_id,
          'copy_identity_reused',
          403,
        );
    }
    if ('agents' in result) {
      const agents = result.agents as AgentConfigurationRecord[];
      for (const agent of agents) this.agent(b, agent);
      const ids = agents.map((a) => a.agent_id),
        namespaces = agents
          .filter((a) => a.role === 'specialist')
          .map((a) => a.builtin_memory_namespace);
      requireThat(
        new Set(ids).size === ids.length &&
          new Set(namespaces).size === namespaces.length,
        'agent_namespace_collision',
        403,
      );
    }
    if (method === 'runtime.agent.session.get')
      requireThat(
        result.agent_id === b.agentId &&
          result.role === b.role &&
          result.memory_backend === b.memoryBackend,
        'session_identity_mismatch',
        403,
      );
    if (method === 'runtime.memory.status') {
      const caps = object(result.capabilities),
        health = object(result.health);
      requireThat(
        caps.backend === b.memoryBackend && health.backend === b.memoryBackend,
        'memory_backend_mismatch',
        403,
      );
      if (b.role === 'primary')
        requireThat(
          ['write', 'supersede', 'delete', 'export', 'session_ingest'].every(
            (key) => caps[key] === false,
          ),
          'unqualified_personal_harness_capability',
          503,
        );
    }
    if ('record' in result) {
      this.record(b, result.record as MemoryRecord);
      requireThat(
        object(result.record).record_id === params.record_id,
        'memory_record_mismatch',
        403,
      );
    }
    if ('records' in result) {
      for (const row of result.records as MemoryRecord[]) this.record(b, row);
      const records = result.records as MemoryRecord[];
      requireThat(
        result.offset === (params.offset ?? 0) &&
          result.next_offset === Number(result.offset) + records.length &&
          records.length <= Number(params.limit ?? 100) &&
          Number(result.next_offset) <= Number(result.total) &&
          result.has_more ===
            Number(result.next_offset) < Number(result.total) &&
          (params.expected_revision === undefined ||
            params.expected_revision === null ||
            result.revision === params.expected_revision),
        'memory_snapshot_changed',
      );
    }
    if (
      method === 'runtime.memory.record.write' ||
      method === 'runtime.memory.record.delete'
    ) {
      const outcome = object(result.outcome);
      if (outcome.success) {
        const row = outcome.record as MemoryRecord;
        this.record(b, row);
        requireThat(
          row.record_id === params.record_id &&
            row.version === Number(params.expected_version ?? 0) + 1 &&
            outcome.acknowledged_version === row.version &&
            outcome.revision === row.revision,
          'memory_receipt_mismatch',
        );
        if (method.endsWith('.delete'))
          requireThat(
            row.deletion_state === 'deleted' && row.content === null,
            'memory_delete_receipt_mismatch',
          );
      } else
        requireThat(
          outcome.record_id === params.record_id &&
            outcome.expected_version === (params.expected_version ?? 0),
          'memory_conflict_receipt_mismatch',
        );
    }
    const checkWorkflow = (workflow: WorkflowRecord) => {
      requireThat(
        workflow.project_id === b.projectId,
        'workflow_scope_mismatch',
        403,
      );
      requireThat(
        createHash('sha256').update(workflow.definition_json).digest('hex') ===
          workflow.sha256,
        'workflow_bytes_changed',
      );
      if (typeof params.definition_json === 'string') {
        const requested = object(JSON.parse(params.definition_json));
        requireThat(
          requested.workflow_id === workflow.workflow_id &&
            requested.version === workflow.version,
          'workflow_pin_mismatch',
        );
        requireThat(
          canonicalBe06(JSON.parse(workflow.definition_json)) ===
            canonicalBe06({
              ...requested,
              predecessor: requested.predecessor ?? null,
              template_ref: requested.template_ref ?? null,
            }),
          'workflow_definition_changed',
        );
      }
      for (const key of ['workflow_id', 'version', 'sha256'] as const)
        if (key in params)
          requireThat(workflow[key] === params[key], 'workflow_pin_mismatch');
    };
    if ('workflow' in result) checkWorkflow(result.workflow as WorkflowRecord);
    if ('workflows' in result)
      for (const row of result.workflows as WorkflowRecord[])
        checkWorkflow(row);
    if (typeof result.project_id === 'string')
      requireThat(
        result.project_id === b.projectId,
        'response_project_scope_mismatch',
        403,
      );
    if (method === 'runtime.workflow.template.create') {
      const requested = object(JSON.parse(String(params.definition_json)));
      requireThat(
        result.template_id === requested.template_id &&
          result.version === requested.version &&
          typeof result.definition_json === 'string' &&
          createHash('sha256').update(result.definition_json).digest('hex') ===
            result.sha256,
        'template_receipt_mismatch',
      );
    }
    if ('evidence' in result)
      for (const row of Array.isArray(result.evidence)
        ? result.evidence
        : [result.evidence])
        requireThat(
          object(row).project_id === b.projectId &&
            (!('anchor_id' in params) ||
              object(row).anchor_id === params.anchor_id),
          'evidence_scope_mismatch',
          403,
        );
    if (method.startsWith('runtime.workflow.delivery.')) {
      const rows =
        result.deliveries ?? (result.delivery ? [result.delivery] : []);
      for (const row of rows as Json[]) {
        requireThat(
          row.project_id === b.projectId &&
            row.specialist_id === params.specialist_id,
          'delivery_scope_mismatch',
          403,
        );
        for (const key of [
          'workflow_id',
          'version',
          'sha256',
          'action',
        ] as const)
          if (key in params)
            requireThat(row[key] === params[key], 'delivery_pin_mismatch');
        if (method.endsWith('.commit'))
          requireThat(
            row.delivery_revision ===
              Number(params.expected_delivery_revision) + 1 &&
              row.approval_id === params.approval_id &&
              row.approval_digest === params.approval_digest,
            'delivery_receipt_mismatch',
          );
      }
    }
    if (method === 'runtime.specialist.preview') {
      const selection = object(result.selection),
        specialist = object(result.specialist);
      requireThat(
        selection.project_id === b.projectId &&
          selection.specialist_id === params.specialist_id &&
          specialist.agent_id === params.specialist_id,
        'specialist_scope_mismatch',
        403,
      );
      for (const key of ['objective', 'artifacts', 'evidence', 'constraints']) {
        const expected =
          key === 'objective' ? params[key] : (params[key] ?? []);
        requireThat(
          canonicalBe06(selection[key]) === canonicalBe06(expected),
          'specialist_selection_changed',
        );
      }
    }
    if (method === 'runtime.specialist.status')
      requireThat(
        result.command_id === params.command_id &&
          result.project_id === b.projectId,
        'specialist_scope_mismatch',
        403,
      );
    if (method === 'runtime.specialist.handoff')
      requireThat(
        result.command_id === params.command_id,
        'handoff_receipt_mismatch',
      );
    if (method === 'runtime.artifact.cancel')
      requireThat(
        result.command_id === params.command_id &&
          result.status === 'cancelled' &&
          result.owner_live === false,
        'decline_control_receipt_mismatch',
      );
  }
  private async call(b: Be06Binding, method: Be06Method, params: Json) {
    const result = await this.transport.call(method, params as never);
    this.checkResult(b, method, params, result);
    return detached(result);
  }
  async read(
    conversationId: string,
    method: Be06Method,
    payload: unknown,
    auth: Guard,
    projectId?: string | null,
  ) {
    requireThat(readMethods.has(method), 'read_method_unsupported', 400);
    const b = detached(
      await this.boundSession(
        conversationId,
        auth,
        'read',
        this.selectedProject(payload, projectId),
      ),
    );
    this.fence(b, auth, 'read');
    this.qualified(b, method);
    // Status command_id is an owned reference, never admission authority.
    const params =
      method === 'runtime.specialist.status'
        ? {
            ...z
              .strictObject({ command_id: idSchema })
              .parse(detached(payload)),
            schema_version: 1,
            session_id: b.liveSessionId,
          }
        : this.wire(b, method, this.body(payload));
    validateBe06Wire(method, 'params', params);
    this.scope(b, method, params);
    const result = await this.call(b, method, params);
    this.fence(b, auth, 'read');
    return result;
  }
  /** Buffer, verify full digest/revision/owner, then return a local download; never stream unverified records. */
  async exportMemory(
    conversationId: string,
    includeDeleted: boolean,
    auth: Guard,
    projectId: string | null = null,
  ) {
    const b = detached(
      await this.boundSession(conversationId, auth, 'read', projectId),
    );
    this.fence(b, auth, 'read');
    this.qualified(b, 'runtime.memory.export');
    const chunks: Buffer[] = [];
    let offset = 0;
    let first: Be06Results['runtime.memory.export'] | undefined;
    while (true) {
      const params = this.wire(b, 'runtime.memory.export', {
        include_deleted: includeDeleted,
        project_id: b.projectId,
        offset,
        limit: 65536,
        ...(first ? { expected_revision: first.revision } : {}),
      });
      this.fence(b, auth, 'read');
      const chunk = (await this.call(
        b,
        'runtime.memory.export',
        params,
      )) as Be06Results['runtime.memory.export'];
      this.fence(b, auth, 'read');
      first ??= chunk;
      const bytes = Buffer.from(chunk.data_base64, 'base64');
      requireThat(
        chunk.size >= 0 &&
          chunk.size <= 8 * 1024 * 1024 &&
          bytes.length <= 65536 &&
          bytes.toString('base64') === chunk.data_base64 &&
          chunk.offset === offset &&
          chunk.next_offset === offset + bytes.length &&
          chunk.next_offset <= chunk.size &&
          chunk.eof === (chunk.next_offset === chunk.size) &&
          (chunk.eof || bytes.length > 0) &&
          chunk.revision === first.revision &&
          chunk.sha256 === first.sha256 &&
          chunk.size === first.size,
        'memory_export_changed',
      );
      chunks.push(bytes);
      offset = chunk.next_offset;
      if (chunk.eof) break;
    }
    const bytes = Buffer.concat(chunks);
    requireThat(
      createHash('sha256').update(bytes).digest('hex') === first.sha256,
      'memory_export_digest_mismatch',
    );
    const snapshot = object(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    requireThat(
      snapshot.revision === first.revision && Array.isArray(snapshot.records),
      'memory_export_snapshot_mismatch',
    );
    for (const row of snapshot.records) {
      validateBe06Wire('runtime.memory.record.get', 'result', { record: row });
      this.record(b, row as MemoryRecord);
    }
    this.fence(b, auth, 'read');
    return {
      bytes,
      sha256: first.sha256,
      revision: first.revision,
      deletionSemantics: 'tombstones_not_physical_erasure' as const,
    };
  }
  has(operationId: string) {
    return !!this.row(operationId);
  }
  operationContext(operationId: string) {
    const row = this.row(operationId);
    requireThat(row, 'operation_not_found', 404);
    const authority = object(JSON.parse(row.authority));
    return {
      conversationId: row.conversationId,
      projectId: authority.projectId as string | null,
    };
  }
  private selectedProject(
    payload: unknown,
    provided?: string | null,
  ): string | null {
    const body = object(payload);
    let project: unknown = body.project_id;
    if (typeof body.definition_json === 'string')
      project = object(JSON.parse(body.definition_json)).project_id;
    if (typeof body.scope === 'string' && body.scope.startsWith('project:'))
      project = body.scope.slice(8);
    if (typeof body.reviewOperationId === 'string')
      project = this.operationContext(body.reviewOperationId).projectId;
    if (provided !== undefined && project !== undefined)
      requireThat(provided === project, 'project_scope_mismatch', 403);
    project = project ?? provided ?? null;
    requireThat(
      project === null ||
        (typeof project === 'string' && idSchema.safeParse(project).success),
      'invalid_project',
      400,
    );
    return project as string | null;
  }
  private row(operationId: string): Row | undefined {
    return this.db
      .prepare(
        'SELECT * FROM runtime_identity_skill_ingress WHERE operationId=? AND ownerId=?',
      )
      .get(operationId, this.ownerId) as unknown as Row | undefined;
  }
  private receipt(row: Row) {
    return {
      operationId: row.operationId,
      intentDigest: row.digest,
      status: row.state === 'pending' ? 'outcome_unknown' : row.state,
      result: row.evidence ? (JSON.parse(row.evidence) as unknown) : null,
      reason:
        row.state === 'accepted'
          ? 'Exact producer receipt retained; completion, publication and next-session activation remain separate.'
          : 'Inspection never repeats this action. Unknown outcomes require reconciliation.',
    };
  }
  private settle(
    row: Row,
    state: Exclude<Row['state'], 'pending'>,
    evidence?: unknown,
  ) {
    const updated = {
      ...row,
      state,
      evidence: evidence === undefined ? null : canonicalBe06(evidence),
    };
    const receipt = this.receipt(updated);
    this.db
      .prepare(
        "UPDATE runtime_identity_skill_ingress SET state=?,result=?,evidence=? WHERE operationId=? AND ownerId=? AND state='pending'",
      )
      .run(
        state,
        canonicalBe06(receipt),
        updated.evidence,
        row.operationId,
        this.ownerId,
      );
    return receipt;
  }
  private admit(
    b: Be06Binding,
    input: OperationInput,
    method: Be06Method,
    payload: Json,
  ) {
    const intent = canonicalBe06({ method, payload }),
      authority = this.authority(b);
    requireThat(
      be06IntentDigest(method, payload) === input.intentDigest,
      'intent_digest_mismatch',
      400,
    );
    this.db.exec('BEGIN IMMEDIATE');
    try {
      requireThat(
        claimOperation(
          this.db,
          input.operationId,
          this.ownerId,
          'identity_skill',
          input.intentDigest,
          authority,
        ),
        'operation_id_conflict',
      );
      const prior = this.row(input.operationId);
      if (prior) {
        requireThat(
          prior.intent === intent &&
            prior.authority === authority &&
            prior.conversationId === b.conversationId,
          'operation_intent_conflict',
        );
        this.db.exec('COMMIT');
        return { row: prior, fresh: false };
      }
      const pending = this.db
        .prepare(
          "SELECT count(*) n FROM runtime_identity_skill_ingress WHERE ownerId=? AND state IN ('pending','outcome_unknown')",
        )
        .get(this.ownerId);
      requireThat(Number(pending?.n) < 256, 'recovery_queue_full', 503);
      this.db
        .prepare(
          'INSERT INTO runtime_identity_skill_ingress VALUES(?,?,?,?,?,?,?,NULL,NULL)',
        )
        .run(
          input.operationId,
          this.ownerId,
          b.conversationId,
          authority,
          input.intentDigest,
          intent,
          'pending',
        );
      this.db
        .prepare('INSERT INTO runtime_identity_skill_origins VALUES(?,?)')
        .run(input.operationId, this.liveKey(b));
      this.db.exec('COMMIT');
      return { row: this.row(input.operationId)!, fresh: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private review(b: Be06Binding, payload: Json, method: Be06Method) {
    const review = z
      .strictObject({
        reviewOperationId: z.uuid(),
        reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(payload);
    const row = this.row(review.reviewOperationId);
    requireThat(
      row?.state === 'accepted' &&
        row.evidence &&
        row.authority === this.authority(b) &&
        row.conversationId === b.conversationId,
      'review_unavailable',
    );
    const intent = JSON.parse(row.intent) as {
      method: Be06Method;
      payload: Json;
    };
    const expected = prepareFor[method as keyof typeof prepareFor];
    requireThat(
      expected
        ? intent.method === expected
        : method === 'runtime.artifact.cancel' &&
            [
              'runtime.workflow.decision.prepare',
              'runtime.workflow.delivery.prepare',
              'runtime.workflow.run.prepare',
            ].includes(intent.method),
      'review_method_mismatch',
    );
    const shown = this.db
      .prepare(
        'SELECT * FROM runtime_identity_skill_presentations WHERE operationId=? AND ownerId=?',
      )
      .get(row.operationId, this.ownerId);
    const result = object(JSON.parse(row.evidence));
    requireThat(
      shown?.authority === row.authority &&
        shown.liveBinding === this.liveKey(b) &&
        shown.fingerprint === review.reviewDigest &&
        be06Digest(result) === review.reviewDigest,
      'review_not_presented_or_stale',
    );
    const expiry =
      method === 'runtime.specialist.handoff'
        ? object(result.selection).expires_at
        : result.expires_at;
    if (expiry !== undefined)
      requireThat(
        typeof expiry === 'number' && expiry * 1000 > Date.now(),
        'review_expired',
      );
    return { row, intent, result };
  }
  async present(operationId: string, auth: Guard) {
    const row = this.row(idSchema.parse(operationId));
    requireThat(
      row?.state === 'accepted' && row.evidence,
      'review_unavailable',
    );
    const b = detached(
      await this.boundSession(
        row.conversationId,
        auth,
        'read',
        this.operationContext(operationId).projectId,
      ),
    );
    this.fence(b, auth, 'read');
    requireThat(
      row.authority === this.authority(b),
      'operation_authority_changed',
      403,
    );
    const intent = JSON.parse(row.intent) as { method: Be06Method };
    requireThat(
      prepareMethods.has(intent.method),
      'operation_not_reviewable',
      400,
    );
    const origin = this.db
      .prepare(
        'SELECT liveBinding FROM runtime_identity_skill_origins WHERE operationId=?',
      )
      .get(operationId);
    requireThat(
      origin?.liveBinding === this.liveKey(b),
      'review_origin_rebound',
    );
    const result = JSON.parse(row.evidence) as unknown,
      fingerprint = be06Digest(result);
    this.db
      .prepare(
        'INSERT INTO runtime_identity_skill_presentations VALUES(?,?,?,?,?) ON CONFLICT(operationId) DO UPDATE SET authority=excluded.authority,liveBinding=excluded.liveBinding,fingerprint=excluded.fingerprint',
      )
      .run(
        row.operationId,
        this.ownerId,
        row.authority,
        this.liveKey(b),
        fingerprint,
      );
    return {
      reviewOperationId: row.operationId,
      reviewDigest: fingerprint,
      method: intent.method,
      result,
    };
  }
  async act(
    conversationId: string,
    method: Be06Method,
    payload: unknown,
    input: OperationInput,
    auth: Guard,
    projectId?: string | null,
  ) {
    input = operationSchema.parse(input);
    requireThat(
      !readMethods.has(method) && method !== 'runtime.memory.export',
      'mutation_method_unsupported',
      400,
    );
    const body = this.body(payload);
    const b = detached(
      await this.boundSession(
        conversationId,
        auth,
        'write',
        this.selectedProject(body, projectId),
      ),
    );
    this.fence(b, auth, 'write');
    this.qualified(b, method);
    requireThat(
      input.expectedGeneration === b.authorityRevision,
      'authority_generation_changed',
    );
    // Freeze original intent before the first await/dispatch; repeat IDs only inspect.
    const admitted = this.admit(b, input, method, body);
    if (!admitted.fresh) return this.inspect(input.operationId, auth);
    let dispatched = false;
    try {
      let params: Json;
      if (reviewedMethods.has(method)) {
        const review = this.review(b, body, method);
        if (method === 'runtime.specialist.handoff')
          params = {
            selection: review.result.selection,
            preview_sha256: review.result.preview_sha256,
            expected_revision: review.result.runtime_revision,
          };
        else if (method === 'runtime.artifact.cancel') {
          params = { command_id: review.row.operationId };
        } else if (method === 'runtime.workflow.run.publish') {
          requireThat(
            this.assertPublicationReviewed,
            'exact_publication_review_unavailable',
            503,
          );
          await this.assertPublicationReviewed(
            b,
            review.result as unknown as Be06Results['runtime.workflow.run.prepare'],
            auth,
          );
          const proposals = review.result.proposals as Json[];
          requireThat(
            proposals.every((p) => Number(p.expires_at) * 1000 > Date.now()),
            'review_expired',
          );
          params = {
            ...review.intent.payload,
            command_id: review.row.operationId,
            approvals: proposals.map((p) => ({
              approval_id: p.approval_id,
              approval_digest: p.approval_digest,
            })),
          };
        } else
          params = {
            ...review.intent.payload,
            command_id: review.row.operationId,
            approval_id: review.result.approval_id,
            approval_digest: review.result.approval_digest,
          };
        params = this.wire(b, method, params, input.operationId);
      } else params = this.wire(b, method, body, input.operationId);
      this.fence(b, auth, 'write');
      this.qualified(b, method);
      dispatched = true;
      const result = await this.call(b, method, params);
      // Persist the exact receipt before browser/session revalidation.
      const response = object(result);
      const rejected =
        ('outcome' in response && object(response.outcome).success === false) ||
        (method === 'runtime.specialist.handoff' &&
          response.status === 'rejected');
      const receipt = this.settle(
        admitted.row,
        rejected ? 'rejected' : 'accepted',
        result,
      );
      this.fence(b, auth, 'read');
      return receipt;
    } catch (error) {
      if (this.row(input.operationId)?.evidence !== null) throw error;
      const receipt = this.settle(
        admitted.row,
        dispatched ? 'outcome_unknown' : 'rejected',
      );
      this.fence(b, auth, 'read');
      if (!dispatched) throw error;
      return receipt;
    }
  }
  /** Never sends an RPC, never guesses success from the current workflow/memory head. */
  async inspect(operationId: string, auth: Guard) {
    const row = this.row(idSchema.parse(operationId));
    requireThat(row, 'operation_not_found', 404);
    const b = detached(
      await this.boundSession(
        row.conversationId,
        auth,
        'read',
        this.operationContext(operationId).projectId,
      ),
    );
    this.fence(b, auth, 'read');
    requireThat(
      row.authority === this.authority(b),
      'operation_authority_changed',
      403,
    );
    return this.receipt(row);
  }
}
