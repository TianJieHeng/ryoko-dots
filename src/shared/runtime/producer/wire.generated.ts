// GENERATED exact subset of pinned producer. DO NOT EDIT.
// Regenerate: node scripts/pin-producer-contract.mjs /path/to/ryoko-agent
/* eslint-disable */
export interface RuntimeCapabilitiesParams {
  session_id: string
}
export interface RuntimeCapabilities {
  schema_versions: 1[]
  operations: RuntimeOperationCapability[]
  strict_identity_required: boolean
  durable_replay: boolean
  max_events: number
  admission?: RuntimeAdmissionLimits | null
  provider?: RuntimeProviderCapabilities | null
  tool_view?: RuntimeToolView | null
  cursor_policy: 'snapshot_required_on_expired_or_unknown_cursor'
}
export interface RuntimeOperationCapability {
  operation: 'submit' | 'steer' | 'cancel' | 'approval'
  accepts_commands: boolean
  executes: boolean
  effects_enabled: boolean
  reason?: string | null
}
export interface RuntimeAdmissionLimits {
  scope?: 'profile_store'
  max_active: number
  max_queued: number
  max_per_principal: number
  max_payload_bytes: number
  max_queue_bytes: number
  max_database_bytes: number
  ttl_seconds: number
  interactive_boost_seconds: number
  launch_lease_seconds: number
}
export interface RuntimeProviderCapabilities {
  schema_version: 1
  api_mode: string
  adapter: string
  declaration_scope: 'adapter'
  streaming: 'supported' | 'unsupported' | 'unknown'
  parallel_tools: 'supported' | 'unsupported' | 'unknown'
  media_inputs: string[]
  model_capabilities: 'unverified'
  usage: 'final_response' | 'provider_reported' | 'unknown'
  cancellation: 'local_only' | 'provider_acknowledgment' | 'unknown'
  cache_semantics: string
  opaque_state_version: number | null
  execution_owner: 'hermes' | 'provider' | 'unknown'
  durable_execution: boolean
  bounded_budget: 'conditional_openai_text' | 'unsupported'
}
export interface RuntimeToolView {
  catalog_version: string
  session_policy_version: string
  installed_tool_ids: string[]
  authorized_tool_ids: string[]
  discoverable_tool_ids: string[]
  selected_tool_ids: string[]
  unavailable_reasons: Record<string, string>
}
export interface RuntimeEventsSinceParams {
  session_id: string
  schema_version: 1
  cursor?: string | null
  limit?: number
}
export interface RuntimeEventsSinceResult {
  status: 'ok' | 'snapshot_required'
  events: RuntimeEventEnvelope[]
  snapshot: MissionSnapshot | null
  last_cursor: string
  has_more: boolean
}
export interface RuntimeEventEnvelope {
  schema_version: 1
  event_id: string
  session_id: string
  seq: number
  cursor: string
  generation: number
  mission_id: string | null
  run_id: string | null
  operation_id: string | null
  effect_id: string | null
  delivery_id: string | null
  approval_id: string | null
  occurred_at: number
  type: 'command.accepted' | 'command.claimed' | 'command.completed' | 'command.failed' | 'command.blocked' | 'command.cancelled' | 'checkpoint.published' | 'runtime.output' | 'runtime.state' | 'approval.requested' | 'approval.resolved' | 'effect.recorded' | 'model.started' | 'model.completed' | 'model.failed' | 'tool.started' | 'tool.completed' | 'tool.failed' | 'decision.observed' | 'decision.outcome' | 'decision.tool_plan' | 'decision.policy' | 'decision.planner_miss' | 'operations.repair_started' | 'operations.repair_finished' | 'operations.deletion_requested' | 'operations.deletion_finished'
  payload: RuntimeEventPayload
}
export interface RuntimeEventPayload {
  decision_receipt?: DecisionReceipt | null
  decision_outcome?: DecisionOutcomeLabel | null
  decision_tool_plan?: DecisionToolPlan | null
  decision_policy?: DecisionPolicyRecord | null
  decision_planner_miss?: DecisionPlannerMiss | null
  command_id?: string | null
  operation?: 'submit' | 'steer' | 'cancel' | 'approval' | 'artifact' | null
  effect_state?: 'prepared' | 'dispatched' | 'confirmed' | 'failed' | 'outcome_unknown' | 'reconciliation_required' | null
  operation_type?: 'artifact_publish' | 'project_artifact_publish' | 'mission_test_execution' | 'unsupported' | null
  approval_status?: 'pending' | 'approved' | 'denied' | 'consumed' | 'invalidated' | null
  expires_at?: number | null
  invalidation_reason?: string | null
  mission_revision?: number | null
  mission_state?: 'ready' | 'working' | 'waiting_for_user' | 'waiting_for_source' | 'ready_to_review' | 'completed' | 'partially_completed' | 'paused' | 'cancelled' | 'failed' | null
  checkpoint_id?: string | null
  included_seq?: number | null
  cancellation?: RuntimeCancellation | null
  physical_attempt?: RuntimePhysicalAttempt | null
  admission_state?: 'expired' | 'cancelled' | 'rejected' | null
  control_outcome?: 'steer_queued' | 'steer_not_queued' | 'cancel_requested' | 'cancel_not_requested' | null
}
export interface DecisionReceipt {
  schema_version: 1
  receipt_id: string
  point_id: string
  contract_version: number
  contract_digest: string
  question_id: string
  request_id: string
  input_digest: string
  scope_digest: string
  classification: 'private' | 'public' | 'synthetic'
  model_digest: string
  calibration_digest: string
  service_digest: string
  mode: 'off' | 'shadow' | 'advisory' | 'enforce'
  thresholds: Record<string, unknown>
  point_gate_digest: string | null
  live_options: string[]
  distribution: Record<string, unknown> | null
  selected: string | null
  unclear: boolean
  actual_route: 'incumbent' | 'advisory' | 'qualified_recommendation'
  fallback: 'off' | 'privacy_not_qualified' | 'private_transport_unqualified' | 'private_destination_authorization_required' | 'point_gate_required' | 'durable_receipt_required' | 'transport_unconfigured' | 'deadline_exceeded' | 'node_capacity' | 'node_unavailable' | 'node_http_error' | 'circuit_open' | 'invalid_response_schema' | 'response_binding_mismatch' | 'bundle_mismatch' | 'invalid_distribution_options' | 'invalid_probability' | 'invalid_distribution_sum' | 'invalid_selection' | 'invalid_unclear' | 'selection_not_argmax' | 'invalid_latency' | 'unclear' | 'below_threshold' | 'shadow_observation' | 'receipt_unavailable' | null
  incumbent: string
  latency_ms: number
  node_latency_ms: number | null
  recorded_at: number
  outcome: null
  raw_state_retained: false
}
export interface DecisionOutcomeLabel {
  receipt_id: string
  label: string
  outcome: 'correct' | 'incorrect' | 'unresolved' | 'recovered'
  source_digest: string
}
export interface DecisionToolPlan {
  need: 'no_tools' | 'needs_tools' | 'defer'
  effort_bucket: 'one' | 'two_three' | 'four_plus' | 'defer'
  families: string[]
  verified_tool_ids: string[]
  live_catalog_version: string
  bundle_id: string
  reopen_policy: 'authorized_search_describe_call'
  scope_digest: string
  mode: 'off' | 'shadow' | 'advisory' | 'enforce'
  fallback: string | null
  decision_receipt_ids: string[]
  elapsed_ms: number
}
export interface DecisionPolicyRecord {
  kind: 'point_policy'
  operation: 'observer' | 'promote' | 'rollback'
  point_id: string
  policy_digest: string
  scope_digest: string
  mode?: 'off' | 'shadow' | 'advisory' | 'enforce' | null
  thresholds_by_class?: unknown[][] | null
  timeout_seconds?: number | null
  allowed_effects?: string[] | null
  rollout_scope?: string[] | null
  gate_digest?: string | null
  evidence_digest?: string | null
  approval_digest?: string | null
  previous_policy_digest?: string | null
  bundle?: DecisionReleaseBundle | null
  recorded_at?: number | null
  reason?: 'operator' | 'drift' | 'false_allow' | 'missed_direct_request' | 'stale_menu' | 'tool_recovery_failed' | 'budget_violation' | 'latency_regression' | null
}
export interface DecisionReleaseBundle {
  model_digest: string
  calibration_digest: string
  service_digest: string
}
export interface DecisionPlannerMiss {
  kind: 'planner_miss'
  scope_digest: string
  bundle_id: string | null
  catalog_version: string
  previous_catalog_version: string
  tool_digest: string
  recovered: boolean
  reason: 'authorized_reopen' | 'not_authorized_or_unavailable'
  prefix_digest: string
  observation_only?: boolean
}
export interface RuntimeCancellation {
  request_id: string | null
  requested_at: number | null
  local_state: 'running' | 'requested' | 'stopped'
  upstream_ack: boolean | null
  pending_effect_ids: string[]
  pending_handles: string[]
  partial_result_available: boolean
  remote_effects_undone: false
}
export interface RuntimePhysicalAttempt {
  attempt_id: string
  reason: 'initial' | 'auth_failure' | 'quota_exhausted' | 'throttled' | 'overloaded' | 'context_overflow' | 'unsupported_capability' | 'ambiguous_transport' | 'request_rejected'
  provider_account_ref: string
  reservation_id: string
  remote_acceptance: 'unknown' | 'rejected' | 'accepted'
  logical_request_id: string
}
export interface MissionSnapshot {
  schema_version: 1
  session_id: string
  revision: number
  state: RuntimeSnapshotState
  outstanding_requests: RuntimeOutstandingRequest[]
  artifacts: RuntimeArtifactReference[]
  unresolved_effects: RuntimeUnresolvedEffect[]
  unresolved_invocations?: RuntimeUnresolvedInvocation[]
  reference_counts?: RuntimeReferenceCounts
  reference_limit?: number
  references_truncated?: boolean
  last_cursor: string
  compatibility_status: 'native' | 'legacy'
  admission?: RuntimeAdmissionSnapshot | null
}
export interface RuntimeSnapshotState {
  status: 'idle' | 'accepted' | 'claimed' | 'completed' | 'failed' | 'blocked' | 'cancelled'
  run_id: string | null
  last_command_id: string | null
  last_operation: 'submit' | 'steer' | 'cancel' | 'approval' | null
}
export interface RuntimeOutstandingRequest {
  request_id: string
  kind: 'approval' | 'input'
  status: 'pending'
}
export interface RuntimeArtifactReference {
  artifact_id: string
  version: string
}
export interface RuntimeUnresolvedEffect {
  effect_id: string
  status: 'prepared' | 'dispatched' | 'outcome_unknown' | 'reconciliation_required'
}
export interface RuntimeUnresolvedInvocation {
  operation_id: string
  status: 'pending' | 'outcome_uncertain'
}
export interface RuntimeReferenceCounts {
  outstanding_requests?: number
  artifacts?: number
  unresolved_effects?: number
  unresolved_invocations?: number
}
export interface RuntimeAdmissionSnapshot {
  draining: boolean
  jobs: RuntimeAdmissionJob[]
}
export interface RuntimeAdmissionJob {
  command_id: string
  state: 'queued' | 'running' | 'finished' | 'expired' | 'cancelled' | 'rejected'
  enqueued_at: number
  expires_at: number
  reason: string | null
}
export interface RuntimeSessionParams {
  session_id: string
  schema_version: 1
}
