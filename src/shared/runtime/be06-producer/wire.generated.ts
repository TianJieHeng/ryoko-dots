// GENERATED exact subset of pinned producer. DO NOT EDIT.
// Regenerate: node scripts/pin-be06-contract.mjs /path/to/ryoko-agent
export interface AgentConfigurationArchiveParams {
  session_id: string
  schema_version: 1
  agent_id: string
  expected_revision: number
}
export interface AgentConfigurationResult {
  agent: AgentConfigurationRecord
}
export interface AgentConfigurationRecord {
  agent_id: string
  role: 'primary' | 'specialist'
  memory_backend: 'personal_mcp' | 'builtin'
  builtin_memory_namespace: string | null
  config: AgentEditableConfig
  revision: number
  archived: boolean
  active_session_revision: number | null
  authority_revocation_revision: number
  active_session_revision_revoked: boolean
  activation?: 'next_session'
  personal_memory_mutation_supported?: false
}
export interface AgentEditableConfig {
  name: string
  instructions?: string
  research_allowed?: boolean
  memory_allowed?: boolean
  project_grants?: string[]
  default_project_id?: string | null
}
export interface AgentConfigurationCreateParams {
  session_id: string
  schema_version: 1
  copy_from_agent_id?: string | null
  config: AgentEditableConfig
}
export interface AgentConfigurationParams {
  session_id: string
  schema_version: 1
  agent_id: string
}
export interface RuntimeSessionParams {
  session_id: string
  schema_version: 1
}
export interface AgentConfigurationList {
  agents: AgentConfigurationRecord[]
  activation?: 'next_session'
}
export interface AgentSessionConfiguration {
  agent_id: string
  role: 'primary' | 'specialist' | 'child'
  memory_backend: 'personal_mcp' | 'builtin'
  active_configuration_revision: number | null
  desired_configuration_revision: number | null
  archived: boolean
  authority_revocation_revision: number
  authority_current: boolean
  revocation_code: string | null
  startup_frozen: boolean
  active_workflows: AgentSessionWorkflowPin[]
  desired_workflows: AgentSessionWorkflowPin[]
  activation: 'next_session'
  execution_authority: false
}
export interface AgentSessionWorkflowPin {
  project_id: string
  workflow_id: string
  version: number
  sha256: string
  delivery_revision: number
  workflow_state: 'draft' | 'tested' | 'approved' | 'deprecated' | 'revoked' | 'unavailable'
}
export interface AgentConfigurationUpdateParams {
  session_id: string
  schema_version: 1
  agent_id: string
  expected_revision: number
  config: AgentEditableConfig
}
export interface RuntimeApprovalResolveParams {
  session_id: string
  schema_version: 1
  approval_id: string
  approval_digest: string
  choice: 'once' | 'deny'
}
export interface RuntimeApprovalResolveResult {
  approval: RuntimeApprovalRecord
  dispatch_performed: false
}
export interface RuntimeApprovalRecord {
  approval_id: string
  run_id: string
  approval_digest: string
  action_digest: string
  input_digest: string
  target_digest: string
  input_revision_digest: string
  artifact_revision_digest: string
  policy_version: string
  policy_digest: string
  status: 'pending' | 'approved' | 'denied' | 'consumed' | 'invalidated'
  expires_at: number
  expired: boolean
  created_at: number
  resolved_at: number | null
  consumed_at: number | null
  invalidation_reason?: string | null
  mission_id?: string | null
  mission_revision?: number | null
  invalidated_at?: number | null
}
export interface ArtifactCommandParams {
  session_id: string
  schema_version: 1
  command_id: string
}
export interface ArtifactControlStatus {
  command_id: string
  run_id: string
  status: 'accepted' | 'claimed' | 'completed' | 'cancelled' | 'failed' | 'blocked'
  owner_live: boolean
  expires_at: number | null
  result: ArtifactPublishResult | ArtifactCancelledResult | ArtifactBlockedResult | ArtifactBundleResult | ArtifactResponseJSON | null
}
export interface ArtifactPublishResult {
  project_id: string
  artifact_id: string
  version: number
  sha256: string
  size: number
  mime: string
  parent_version: number | null
  disposition: 'canonical' | 'branch'
  head_version: number | null
  validation_status: 'passed'
  approval_status: 'approved'
}
export interface ArtifactCancelledResult {
  cancel_requested: boolean
  effects_undone: false
}
export interface ArtifactBlockedResult {
  blocked: true
  reason: 'budget_unavailable'
}
export interface ArtifactBundleResult {
  project_id: string
  outputs: ArtifactPublishResult[]
  manifest: ArtifactPublishResult
  state: 'published'
  publication_atomic: false
  external_production: 'not_performed'
}
export interface ArtifactResponseJSON {
  project_id?: string | null
  response_json: string
}
export interface ArtifactReadParams {
  session_id: string
  schema_version: 1
  project_id: string
  artifact_id: string
  version?: number | null
  offset?: number
  limit?: number
}
export interface ArtifactReadResult {
  project_id: string
  artifact_id: string
  version: number
  sha256: string
  size: number
  mime: string
  offset: number
  data_base64: string
  next_offset: number
  eof: boolean
  preview_mode: 'plain_text' | 'download_only'
}
export interface EvidenceCreateParams {
  session_id: string
  schema_version: 1
  project_id: string
  anchor_id: string
  kind: 'source_span' | 'source_id' | 'decision' | 'constraint' | 'approval' | 'artifact_version'
  source_ref: ArtifactVersionRef | EvidenceCaptureRef | EvidenceApprovalRef
  source_version: string
  range_ref?: EvidenceNumericRange | EvidenceSectionRange | null
  captured_at?: number | null
  authority?: 'observed' | 'source_claim' | 'user_approved' | 'inferred'
  validity?: 'current' | 'stale' | 'revoked' | 'unverified'
  fresh_until?: number | null
  annotation?: string
}
export interface ArtifactVersionRef {
  artifact_id: string
  version: number
}
export interface EvidenceCaptureRef {
  capture_id: string
}
export interface EvidenceApprovalRef {
  approval_id: string
}
export interface EvidenceNumericRange {
  unit: 'line' | 'byte'
  start: number
  end: number
}
export interface EvidenceSectionRange {
  unit: 'section'
  start: string
  end: string
}
export interface EvidenceResult {
  evidence: EvidenceRecord
}
export interface EvidenceRecord {
  anchor_id: string
  project_id: string
  kind: 'source_span' | 'source_id' | 'decision' | 'constraint' | 'approval' | 'artifact_version'
  source_ref: ArtifactVersionRef | EvidenceCaptureRef | EvidenceApprovalRef
  source_version: string
  range_ref: EvidenceNumericRange | EvidenceSectionRange | null
  captured_at: number
  authority: 'observed' | 'source_claim' | 'user_approved' | 'inferred'
  validity: 'current' | 'stale' | 'revoked' | 'unverified'
  effective_validity: 'current' | 'stale' | 'revoked' | 'unverified'
  fresh_until: number | null
  annotation: string
  grants_execution: false
}
export interface EvidenceParams {
  session_id: string
  schema_version: 1
  anchor_id: string
}
export interface SourceListParams {
  session_id: string
  schema_version: 1
  project_id: string
  limit?: number
}
export interface EvidenceListResult {
  evidence: EvidenceRecord[]
  limit: number
  limit_reached: boolean
  complete: false
}
export interface MemoryExportParams {
  session_id: string
  schema_version: 1
  include_deleted?: boolean
  project_id?: string | null
  expected_revision?: number | null
  offset?: number
  limit?: number
}
export interface MemoryExportResult {
  revision: number
  sha256: string
  size: number
  format: 'json'
  deletion_semantics: 'tombstones_not_physical_erasure'
  offset: number
  data_base64: string
  next_offset: number
  eof: boolean
}
export interface MemoryDeleteParams {
  session_id: string
  schema_version: 1
  record_id: string
  expected_version: number
}
export interface MemoryMutationResult {
  outcome: MemoryWriteSuccess | MemoryWriteConflict
}
export interface MemoryWriteSuccess {
  success: true
  record: MemoryRecord
  acknowledged_version: number
  revision: number
}
export interface MemoryRecord {
  record_id: string
  version: number
  revision: number
  supersedes_version: number | null
  owner_agent_id: string
  owner_principal_id: string
  owner_profile_id: string
  namespace_id: string
  target: 'memory' | 'user'
  kind: 'stated_fact' | 'inference' | 'preference' | 'decision' | 'procedure_reference'
  content: string | null
  source_ref: string
  author: string
  created_at: number
  updated_at: number
  valid_from: number
  valid_to: number | null
  confidence: number | null
  validity: 'valid' | 'uncertain' | 'invalid' | 'superseded'
  scope: string
  deletion_state: 'present' | 'deleted'
  deleted_at: number | null
  superseded_by_version?: number | null
}
export interface MemoryWriteConflict {
  success: false
  code: 'version_conflict'
  conflict_id: string
  record_id: string
  expected_version: number
  current_version: number
}
export interface MemoryRecordParams {
  session_id: string
  schema_version: 1
  record_id: string
  version?: number | null
}
export interface MemoryRecordResult {
  record: MemoryRecord
}
export interface MemoryWriteParams {
  session_id: string
  schema_version: 1
  content: string
  record_id: string
  expected_version?: number
  target?: 'memory' | 'user'
  kind?: 'stated_fact' | 'inference' | 'preference' | 'decision' | 'procedure_reference'
  source_ref?: string | null
  author?: string | null
  valid_from?: number | null
  valid_to?: number | null
  confidence?: number | null
  validity?: 'valid' | 'uncertain' | 'invalid'
  scope?: string
}
export interface MemoryListParams {
  session_id: string
  schema_version: 1
  include_deleted?: boolean
  project_id?: string | null
  expected_revision?: number | null
  offset?: number
  limit?: number
}
export interface MemoryListResult {
  revision: number
  records: MemoryRecord[]
  offset: number
  next_offset: number
  total: number
  has_more: boolean
}
export interface MemoryScopeParams {
  session_id: string
  schema_version: 1
  project_id: string | null
}
export interface MemoryScopeResult {
  project_id: string | null
  scope_key: string
}
export interface MemoryStatusResult {
  capabilities: MemoryCapabilities
  health: MemoryHealth
}
export interface MemoryCapabilities {
  backend: 'builtin' | 'personal_mcp'
  recall: boolean
  write: boolean
  supersede: boolean
  delete: boolean
  export: boolean
  session_ingest: boolean
}
export interface MemoryHealth {
  backend: 'builtin' | 'personal_mcp'
  status: 'ready' | 'unconfigured' | 'degraded' | 'disabled'
  reason_code: string | null
  supported_operations: string[]
}
export interface MissionCreateParams {
  session_id: string
  schema_version: 1
  previous_mission_id?: string | null
  previous_revision?: number | null
  mission_id: string
  contract: MissionIntent
}
export interface MissionIntent {
  outcome: string
  project_id?: string | null
  deliverables?: MissionDeliverable[]
  acceptance?: (MissionExistenceCriterion | MissionSectionCriterion | MissionTextCriterion | MissionSchemaCriterion | MissionLinkedCriterion | MissionTestCriterion | MissionUserCriterion)[]
  scope_ref?: string | null
  budget_ref?: string | null
  deadline?: number | null
  dependencies?: MissionDependency[]
  plan_steps?: MissionPlanStep[]
  policy?: 'direct' | 'reviewed'
  risk?: 'unknown' | 'low' | 'consequential'
  uncertainty?: 'unknown' | 'low' | 'high'
  max_turns?: number
  no_progress_limit?: number
  legacy_contract?: MissionLegacyContract
  subgoals?: string[]
  gates?: MissionHistoricalGate[]
}
export interface MissionDeliverable {
  deliverable_id: string
  description?: string
  artifact_ref?: MissionArtifactRef | null
  required?: boolean
}
export interface MissionArtifactRef {
  artifact_id: string
  version: number
  digest: string
}
export interface MissionExistenceCriterion {
  criterion_id: string
  description?: string
  artifact_refs?: MissionArtifactRef[]
  required?: boolean
  kind: 'existence'
  parameters?: MissionReadParameters
}
export interface MissionReadParameters {
  require_current_head?: boolean
  require_current_dependencies?: boolean
}
export interface MissionSectionCriterion {
  criterion_id: string
  description?: string
  artifact_refs?: MissionArtifactRef[]
  required?: boolean
  kind: 'markdown_sections'
  parameters: MissionSectionParameters
}
export interface MissionSectionParameters {
  require_current_head?: boolean
  require_current_dependencies?: boolean
  required_sections: string[]
  nonempty?: boolean
}
export interface MissionTextCriterion {
  criterion_id: string
  description?: string
  artifact_refs?: MissionArtifactRef[]
  required?: boolean
  kind: 'text_exact'
  parameters: MissionTextParameters
}
export interface MissionTextParameters {
  require_current_head?: boolean
  require_current_dependencies?: boolean
  contains?: string[]
  excludes?: string[]
  equals?: string | null
}
export interface MissionSchemaCriterion {
  criterion_id: string
  description?: string
  artifact_refs?: MissionArtifactRef[]
  required?: boolean
  kind: 'json_schema'
  parameters: MissionSchemaParameters
}
export interface MissionSchemaParameters {
  require_current_head?: boolean
  require_current_dependencies?: boolean
  schema: Record<string, unknown>
}
export interface MissionLinkedCriterion {
  criterion_id: string
  description?: string
  artifact_refs?: MissionArtifactRef[]
  required?: boolean
  kind: 'linked_consistency'
  parameters: MissionLinkedParameters
}
export interface MissionLinkedParameters {
  require_current_head?: boolean
  require_current_dependencies?: boolean
  sections?: MissionLinkedSection[]
  tokens?: string[]
}
export interface MissionLinkedSection {
  artifact_id: string
  heading: string
}
export interface MissionTestCriterion {
  criterion_id: string
  description?: string
  artifact_refs?: MissionArtifactRef[]
  required?: boolean
  kind: 'test_execution'
  parameters?: MissionIsolatedTestParameters | MissionTestParameters
}
export interface MissionIsolatedTestParameters {
  adapter: 'isolated_python_v1'
  code: string
  code_sha256: string
}
export interface MissionTestParameters {
  command?: string | null
  evidence_ref?: string | null
}
export interface MissionUserCriterion {
  criterion_id: string
  description?: string
  artifact_refs?: MissionArtifactRef[]
  required?: boolean
  kind: 'user_acceptance'
  parameters?: MissionEmptyParameters
}
export type MissionEmptyParameters = Record<string, never>
export interface MissionDependency {
  dependency_id: string
  kind: 'artifact' | 'evidence' | 'input' | 'mission'
  reference: string
  version?: string | number | null
  digest?: string | null
  status?: string | null
}
export interface MissionPlanStep {
  step_id: string
  description?: string
  status?: 'pending' | 'working' | 'completed' | 'blocked' | 'skipped'
  checkpoint?: boolean
  depends_on?: string[]
  input_digests?: string[]
  target_refs?: string[]
  approval_ids?: string[]
}
export interface MissionLegacyContract {
  outcome?: string
  verification?: string
  constraints?: string
  boundaries?: string
  stop_when?: string
}
export interface MissionHistoricalGate {
  command: string
  timeout_seconds?: number
  max_retries?: number
}
export interface MissionResult {
  mission: MissionRecord
  dispatch_performed?: false
}
export interface MissionRecord {
  outcome: string
  project_id?: string | null
  deliverables?: MissionDeliverable[]
  acceptance?: (MissionExistenceCriterion | MissionSectionCriterion | MissionTextCriterion | MissionSchemaCriterion | MissionLinkedCriterion | MissionTestCriterion | MissionUserCriterion)[]
  scope_ref?: string | null
  budget_ref?: string | null
  deadline?: number | null
  dependencies?: MissionDependency[]
  plan_steps?: MissionPlanStep[]
  policy?: 'direct' | 'reviewed'
  risk?: 'unknown' | 'low' | 'consequential'
  uncertainty?: 'unknown' | 'low' | 'high'
  max_turns?: number
  no_progress_limit?: number
  legacy_contract?: MissionLegacyContract
  subgoals?: string[]
  gates?: MissionHistoricalGate[]
  schema_version: 1
  mission_id: string
  session_id: string
  agent_id: string
  revision: number
  state: 'ready' | 'working' | 'waiting_for_user' | 'waiting_for_source' | 'ready_to_review' | 'completed' | 'partially_completed' | 'paused' | 'cancelled' | 'failed'
  execution_status: string
  acceptance_status: string
  delivery_status: string
  next_step: string
  blockers: string[]
  artifact_refs: MissionArtifactRef[]
  effect_refs: MissionEffectRef[]
  delivery_refs: MissionDeliveryRef[]
  effect_refs_total?: number
  effect_refs_truncated?: boolean
  delivery_refs_total?: number
  delivery_refs_truncated?: boolean
  verification_current?: boolean | null
  turns_used: number
  consecutive_no_progress: number
  verification_rounds: number
  last_run_id: string | null
  paused_reason: string | null
  recovery_choices: string[]
  missed_steer: MissionMissedSteer[]
  created_at: number
  updated_at: number
  legacy_imported: boolean
  archived?: boolean
  archived_at?: number | null
}
export interface MissionEffectRef {
  effect_id: string
  state: 'prepared' | 'dispatched' | 'confirmed' | 'failed' | 'outcome_unknown' | 'reconciliation_required'
}
export interface MissionDeliveryRef {
  delivery_id: string
  state: string
}
export interface MissionMissedSteer {
  revision: number
  run_id?: string | null
  effect_ids: string[]
  reason: 'effect_already_dispatched' | 'turn_already_finalizing'
}
export interface RuntimeProjectGrantsParams {
  session_id: string
  schema_version: 1
  project_id: string
  expected_revision: number
  grants: ProjectGrant[]
}
export interface ProjectGrant {
  principal_id: string
  agent_id: string
  permissions: ('read' | 'write' | 'share')[]
}
export interface RuntimeProjectResult {
  project: RuntimeProjectRecord
}
export interface RuntimeProjectRecord {
  id: string
  project_id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  board_slug: string | null
  primary_path: string | null
  archived: boolean
  created_at: number
  folders: RuntimeProjectFolder[]
  revision: number
  owner_principal_id: string | null
  purpose: string
  source_refs: ProjectSourceRef[]
  canonical_artifact_refs: ArtifactVersionRef[]
  active_mission_refs: ProjectMissionRef[]
  grants: ProjectGrant[]
}
export interface RuntimeProjectFolder {
  path: string
  label: string | null
  is_primary: boolean
  added_at: number
}
export interface ProjectSourceRef {
  capture_id: string
}
export interface ProjectMissionRef {
  session_id: string
  run_id: string
}
export interface SpecialistProjectParams {
  session_id: string
  schema_version: 1
  project_id: string
}
export interface SpecialistCatalog {
  specialists: SpecialistDescriptor[]
  unavailable: SpecialistUnavailable[]
  teams_enabled?: false
  execution?: 'local_single_child'
}
export interface SpecialistDescriptor {
  agent_id: string
  responsibility: string
  manifest_sha256: string
  methods_ref: SpecialistReference
  limits: SpecialistLimits
  grants: SpecialistGrants
  builtin_memory_namespace: string
  output_contract_json: string
}
export interface SpecialistReference {
  id: string
  version: number
  sha256: string
}
export interface SpecialistLimits {
  max_depth: number
  max_total_children: number
  max_concurrent_children: number
}
export interface SpecialistGrants {
  allowed_tools: string[]
  project_grants: string[]
  mcp_grants: Record<string, string[]>
  memory_backend: 'builtin'
  personal_memory_access?: false
}
export interface SpecialistUnavailable {
  agent_id: string
  code: string
}
export interface SpecialistHandoffParams {
  session_id: string
  schema_version: 1
  command_id: string
  idempotency_key: string
  expected_revision: number | null
  selection: SpecialistSelection
  preview_sha256: string
}
export interface SpecialistSelection {
  project_id: string
  specialist_id: string
  objective: string
  artifacts?: SpecialistReference[]
  evidence?: SpecialistReference[]
  constraints?: string[]
  manifest_sha256: string
  config_digest: string
  parent_policy_digest: string
  mission_id: string | null
  mission_revision: number | null
  expires_at: number
}
export interface CommandReceipt {
  schema_version: 1
  command_id: string
  status: 'accepted' | 'rejected' | 'duplicate'
  durable_revision: number
  run_id: string | null
  conflict?: RuntimeConflict | null
}
export interface RuntimeConflict {
  code: string
  message: string
}
export interface SpecialistPreviewParams {
  project_id: string
  specialist_id: string
  objective: string
  artifacts?: SpecialistReference[]
  evidence?: SpecialistReference[]
  constraints?: string[]
  session_id: string
  schema_version: 1
}
export interface SpecialistPreview {
  specialist: SpecialistDescriptor
  selection: SpecialistSelection
  preview_sha256: string
  runtime_revision: number
}
export interface SpecialistStatusParams {
  session_id: string
  schema_version: 1
  command_id: string
}
export interface SpecialistStatus {
  command_id: string
  run_id: string
  specialist_id: string
  manifest_sha256: string
  project_id: string
  status: 'accepted' | 'claimed' | 'completed' | 'failed' | 'blocked' | 'cancelled'
  outcome: 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled' | 'unknown'
  completion: SpecialistCompletion | null
  execution_resumed?: false
}
export interface SpecialistCompletion {
  specialist_id: string
  manifest_sha256: string
  project_id: string
  child_id: string | null
  handoff_sha256: string | null
  state: 'completed' | 'failed' | 'blocked' | 'cancelled' | 'unknown'
  summary: string
  summary_truncated: boolean
  schema_valid: boolean | null
  parent_review_required?: true
  execution_resumed?: false
}
export interface WorkflowCreateParams {
  session_id: string
  schema_version: 1
  command_id: string
  definition_json: string
}
export interface WorkflowResult {
  workflow: WorkflowRecord
}
export interface WorkflowRecord {
  workflow_id: string
  version: number
  project_id: string
  sha256: string
  definition_json: string
  state: 'draft' | 'tested' | 'approved' | 'deprecated' | 'revoked'
  revision: number
  evaluation_ref: string | null
  active_version: number | null
  head_revision: number
}
export interface WorkflowDecisionCommitParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  sha256: string
  expected_revision: number
  expected_head_revision: number
  action: 'approve' | 'deprecate' | 'revoke' | 'rollback' | 'authorize_export'
  recipient?: string | null
  approval_id: string
  approval_digest: string
}
export interface WorkflowDecisionResult {
  workflow: WorkflowRecord
  decision_json: string
}
export interface WorkflowDecisionParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  sha256: string
  expected_revision: number
  expected_head_revision: number
  action: 'approve' | 'deprecate' | 'revoke' | 'rollback' | 'authorize_export'
  recipient?: string | null
}
export interface WorkflowDecisionPrepareResult {
  approval_id: string
  approval_digest: string
  expires_at: number
  scope_json: string
  workflow: WorkflowRecord
}
export interface WorkflowDeliveryCommitParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  sha256: string
  specialist_id: string
  expected_delivery_revision: number
  action: 'deliver' | 'rollback'
  approval_id: string
  approval_digest: string
}
export interface WorkflowDeliveryCommitResult {
  delivery: WorkflowDeliveryRecord
}
export interface WorkflowDeliveryRecord {
  delivery_id: string
  project_id: string
  workflow_id: string
  version: number
  sha256: string
  specialist_id: string
  delivery_revision: number
  action: 'deliver' | 'rollback'
  approval_id: string
  approval_digest: string
  previous_delivery_id: string | null
  activation: 'next_session'
  execution_authority: false
  personal_memory_shared: false
  recorded_at: number
}
export interface WorkflowDeliveryListParams {
  session_id: string
  schema_version: 1
  project_id: string
  specialist_id: string
}
export interface WorkflowDeliveryListResult {
  deliveries: WorkflowDeliveryRecord[]
  complete: true
}
export interface WorkflowDeliveryParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  sha256: string
  specialist_id: string
  expected_delivery_revision: number
  action: 'deliver' | 'rollback'
}
export interface WorkflowDeliveryPrepareResult {
  approval_id: string
  approval_digest: string
  expires_at: number
  scope_json: string
  workflow: WorkflowRecord
  current_delivery: WorkflowDeliveryRecord | null
}
export interface WorkflowEvaluateParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  expected_revision: number
  cases_json: string
}
export interface WorkflowEvaluateResult {
  workflow: WorkflowRecord
  evaluation_json: string
}
export interface WorkflowFeedbackParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  evidence_json: string
}
export interface WorkflowEvidenceResult {
  evidence_json: string
}
export interface WorkflowVersionParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
}
export interface WorkflowProjectParams {
  session_id: string
  schema_version: 1
  project_id: string
}
export interface WorkflowListResult {
  workflows: WorkflowRecord[]
  complete: false
}
export interface WorkflowRunParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  sha256: string
  mission_id: string
  mission_revision: number
  parameters_json: string
}
export interface WorkflowRunPrepareResult {
  workflow_run_id: string
  pin_json: string
  proposals: ArtifactProposalResult[]
  publication_atomic: false
}
export interface ArtifactProposalResult {
  request_id: string
  project_id: string
  artifact_id: string
  version: number
  sha256: string
  size: number
  mime: string
  parent_version: number | null
  expected_head_version: number | null
  action_digest: string
  approval_id: string
  approval_digest: string
  expires_at: number
}
export interface WorkflowRunPublishParams {
  session_id: string
  schema_version: 1
  project_id: string
  workflow_id: string
  version: number
  command_id: string
  sha256: string
  mission_id: string
  mission_revision: number
  parameters_json: string
  approvals: DomainApproval[]
}
export interface DomainApproval {
  approval_id: string
  approval_digest: string
}
export interface WorkflowRunPublishResult {
  workflow_run_id: string
  state: 'published'
  outputs: ArtifactPublishResult[]
  manifest: ArtifactPublishResult
  publication_atomic: false
  mission_completed: false
}
export interface WorkflowHistoryResult {
  runs_json: string
  complete: false
}
export interface WorkflowTemplateResult {
  template_id: string
  version: number
  project_id: string
  sha256: string
  definition_json: string
}
