# Ryoko Dots: Hermes Integration Handoff

**Status:** Proposed integration specification; documentation only. No adapter, runtime API, schema migration, or deployment is implemented by this document.

**Reviewed:** 2 October 2026. **Build order:** upgrade Hermes first; integrate OpenDots afterward.

**Repositories and baselines**

- OpenDots consumer: [`TianJieHeng/ryoko-dots`](https://github.com/TianJieHeng/ryoko-dots), `main` at [`b01ac1f6a903e5e56c119d960901353ac0a3d171`](https://github.com/TianJieHeng/ryoko-dots/commit/b01ac1f6a903e5e56c119d960901353ac0a3d171), cloned and inspected for this handoff
- Hermes runtime: [`TianJieHeng/ryoko-agent`](https://github.com/TianJieHeng/ryoko-agent), planning baseline [`b78931e3b0959c42dca7400c78a4dffd1bb48575`](https://github.com/TianJieHeng/ryoko-agent/commit/b78931e3b0959c42dca7400c78a4dffd1bb48575)
- Companion plans: [BackEnd_BuildPlan.md](https://github.com/TianJieHeng/ryoko-agent/blob/main/BackEnd_BuildPlan.md) and [FrontEnd_BuildPlan.md](https://github.com/TianJieHeng/ryoko-agent/blob/main/FrontEnd_BuildPlan.md). Their phase IDs are the dependency vocabulary below; `main` links intentionally follow the maintained plans, whereas implementation findings use immutable source links
- Build history: the single shared root [buildjournal.md](https://github.com/TianJieHeng/ryoko-agent/blob/main/buildjournal.md) records planning and future BE/FE implementation checkpoints; do not create a competing per-phase journal tree
- Design inputs: the supplied `upgrade(2).md` and `user-facing-upgrades(2).md`, plus their companion PDFs. Their historical assertions are inputs, not evidence that a proposed capability exists in this fork

## 1. Decision and non-negotiable ownership

OpenDots becomes Ryoko's interface and channel projection over an upgraded Hermes runtime. Retain its useful chat, Spaces/pages, review, computer, voice, and Slack surfaces. Replace its agent execution ownership with a Hermes-backed AG-UI adapter.

| Concern | Authority after integration | OpenDots responsibility |
| --- | --- | --- |
| Identity, agent/session/project/mission binding | Hermes-authenticated identity and scope records | Resolve authenticated surface identities; maintain verified projection mappings |
| Agent loop, provider routing, budgets, tools, delegation | Hermes | Submit commands and display progress; no second planning/tool loop |
| Durable missions, checkpoints, cancellation, retries | Hermes | Reconnect, inspect, steer, request cancellation; display acknowledged states |
| Permission policy, grants, exact-action approvals | Hermes deterministic broker and policy | Render review and forward a scoped decision; never manufacture a grant |
| External effects and unknown-outcome reconciliation | Hermes effect ledger and authorized executor | Display evidence and repair choices; never blindly retry an effect |
| Schedules, monitors, commitments | Hermes | Edit through runtime commands and render next run/status |
| Memory | Hermes-scoped integration: Ryoko alone uses the external personal-memory MCP harness; other agents use isolated built-in memory | Render scoped memory controls/receipts; no shared preference injection or browser-side harness access |
| Shared project material | Explicitly authorized project/artifact store | Spaces/pages and artifact views; sharing project material does not share personal memory |
| Delivery | Hermes durable delivery intent/status; an authorized channel adapter performs delivery | Translate safe projections to web/Slack/voice and return receipts |
| Documents and files | One designated authoritative store per artifact, registered in Hermes | Preserve native page editing where retained; enforce revision checks and report committed versions |
| LAYA | Hermes typed decision client and deterministic consumers | Optional explanation/status projection; no direct authority or browser-to-Jetson control path |

CopilotKit Intelligence may continue to store thread/display history, and OpenDots may retain page bytes and presentation metadata. Neither becomes a competing owner of mission state, memory policy, effect truth, or execution authority. A SQLite database is not forbidden; ambiguous ownership is.

The proposed LAYA service is LAN-hosted and non-generative on a dedicated Jetson; hardware, serving compatibility and deployment remain to be verified. Confidence cannot authorize an action, bypass an approval, upgrade a capability, or certify a deliverable without deterministic evidence. Its unavailable/low-confidence behavior is defined by Hermes per decision point. It is not an OpenAI-compatible chat endpoint.

All sixteen LAYA points remain a capability catalog, not sixteen required models or datasets and not a prerequisite for completing Hermes or a non-LAYA Dots adapter. The initial experiment uses the existing intention-routing dataset for DP16/front-door intent after validating its actual schema, labels, license and independent held-out quality. After the agent and real memory integration are built, an additional DP05 Ryoko-harness recall-decision dataset can be prepared against the actual allowed operations and scopes, with denial, defer/unclear, stale context, outage and invalidation cases. This roadmap authorizes no data export, training or deployment; privacy-safe fixtures and point-specific evaluation precede any separately approved promotion.

Explicit agent identities will be configured. The immutable IDs, names, credentials and deployment bindings remain implementation configuration; none are invented by this handoff.

## 2. What this fork actually does today

The following are source-observed at the pinned OpenDots SHA, not claims about connected-service verification or a security audit.

| Existing implementation | Integration consequence | Pinned evidence |
| --- | --- | --- |
| `Platform` creates `DotAgent` instances for the CopilotKit runtime and Slack channel | Replacing only web chat leaves a separate Slack execution path; both factories must use the same Hermes adapter | [`platform.ts`, lines 39–85](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/platform.ts#L39-L85) |
| `DotAgent extends AbstractAgent`, but internally constructs `BuiltInAgent`, TanStack `chat`, a model adapter, iteration limits, and tool executors | AG-UI inheritance is a suitable seam, not proof that OpenDots is already a thin client. Replace the inner loop rather than wrapping a second autonomous loop | [`dot-agent.ts`, lines 26–57](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/dot-agent.ts#L26-L57), [lines 171–251](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/dot-agent.ts#L171-L251) |
| `OPENAI_BASE_URL` becomes `openaiCompatibleText`'s Chat Completions base URL | Changing this variable only changes model transport. It does not transfer ownership of tools, missions, approvals, scheduling, or replay to Hermes | [`index.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/index.ts), [`dot-agent.ts`, lines 178–194](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/dot-agent.ts#L178-L194) |
| Chat aborts after 90 seconds; `Runner` also applies a 90-second deadline. Headless server turns use `IntelligenceAgent` through the same runtime | Request/stream deadlines must be separated from durable mission lifetime; an adapter alone cannot fix runner ownership | [`dot-agent.ts`, lines 47–57](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/dot-agent.ts#L47-L57), [`runner.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/runner.ts), [`headless.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/headless.ts) |
| SQLite `Store` owns tasks, runs, events, repeat intervals, and 180-second claim leases; the process starts a local runner | Existing lease-checked writes are useful, but this is not a Hermes mission/effect/delivery transaction. Migrate or retire each schedule exactly once | [`store.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/store.ts), [`index.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/index.ts) |
| `Store.memories()` is a global list injected into every Dot that has memory enabled | Do not carry this behavior into the new multi-agent design. Separate per-agent scopes before enabling specialist memory | [`store.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/store.ts), [`dot-agent.ts`, lines 178–195](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/dot-agent.ts#L178-L195) |
| Workspace bindings track owner, Dot, thread, Space access, and a learning container frozen at thread creation | Preserve useful binding/grant checks, but add explicit Hermes session/project/mission mappings. Decide skill-evidence routing separately from memory | [`workspace.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/workspace.ts), [`learning.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/learning.ts) |
| Pages use expected revisions and transactional review receipts keyed by `(threadId, toolCallId)`; web exposes a canonical review tool, Slack none | Preserve idempotent save recovery, but a page-save receipt is not a generic approval grant. Bind Hermes approval to exact content, destination, revision, and effect | [`pages.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/pages.ts), [`page-routes.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/page-routes.ts), [`PageReviewCard.tsx`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/client/PageReviewCard.tsx) |
| Voice compute calls `Platform.turn`, deduplicates in an in-memory call map, has a 90-second compute timeout, and is aborted when the call ends; local receipts can await Intelligence sync | Keep media/call lifetime separate from accepted durable mission lifetime; replace in-memory-only command deduplication with durable command IDs | [`voice.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/voice.ts) |
| Slack uses team/human-user allowlists and serial channel concurrency; runtime scope validation binds whole route paths to known Dots/threads | Preserve these defenses. Serial channel handling is not global per-session ownership across web, voice, Slack, and workers | [`slack-channel.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/slack-channel.ts), [`runtime-scope.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/runtime-scope.ts) |
| Computer actions have per-Dot credentials, permissions, takeover checks, and audit records whose terminal outcomes are succeeded/failed | Preserve isolation and takeover, but add Hermes effect correlation and an explicit unknown outcome. A transport exception must not prove an external action did not happen | [`computer-service.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/computer-service.ts), [`computer-store.ts`](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/src/server/computer-store.ts) |

The repository declares a single-owner starting point and documents remaining connected-service verification limits. Do not infer multi-user readiness from the presence of an owner ID. See pinned [README](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/README.md), [SECURITY.md](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/SECURITY.md), and [CONTRIBUTING.md](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/CONTRIBUTING.md). No `AGENTS.md` or repository-local `.agents/skills` was present in this checkout.

## 3. The integration seam

Proposed flow:

```text
Web / page chat / Slack / voice compute
  -> authenticated OpenDots ingress and IdentityBinding
  -> Hermes-backed AG-UI adapter
  -> versioned Hermes command API
  -> Hermes session owner, journal, broker, workers, effect and delivery ledgers
  -> resumable Hermes event/snapshot API
  -> safe AG-UI projection, channel delivery, and artifact views
```

The provisional class name `HermesAgUiAgent` denotes an `AbstractAgent` implementation, not an existing file or required final name. It translates authenticated commands and typed events; it does not construct TanStack `chat`, inject its own memory, choose authoritative tools, or execute browser/page/shell effects autonomously.

Both web and Slack factories in `Platform` must select the adapter. Page conversations, scheduled invocations, and voice compute must converge on the same Hermes admission path. A temporary backend selector is server-controlled and sticky per session/mission; a provider error must never fall through from Hermes into the old DotAgent loop.

### Connection, run, and mission are different lifetimes

- A socket/subscriber may disconnect without cancelling accepted work
- An AG-UI run is a surface interaction/projection segment; its finish event does not by itself mean the durable mission completed
- A mission can pause for review, continue across process restarts, and survive a browser refresh or voice hangup
- Explicit stop/cancel controls issue a cancellation command and await its receipt. Subscription teardown only detaches. Adapter tests must verify SDK behavior so `abortRun` and unsubscribe do not accidentally share the old cancellation path
- The existing 90-second chat/background/voice-compute deadlines may bound a request or wait for an initial result. They cannot bound the Hermes mission lifetime. Any mission deadline is explicit runtime policy, not an inherited UI timer
- Ending a call stops media. It cancels only work explicitly designated call-scoped. The UI must disclose which accepted missions continue; voice expiry does not silently cancel them

## 4. Proposed minimum runtime contract

These names and semantics are proposed targets to agree and version in Hermes U32/BE02, which owns the canonical generated schema. The field sketches below use the companion BE02 vocabulary; additional semantics become versioned fields during that schema freeze, not independently named client fields. They are not claims about current Hermes endpoints. Choose concrete HTTP/SSE/WebSocket or other transport details only after the BE02 contract proof; do not invent an OpenAI Chat Completions orchestration protocol.

### 4.1 Records and identifiers

| Record | Minimum semantics |
| --- | --- |
| `RuntimeCapabilities` | Supported protocol/schema versions, commands/events, artifact and approval capabilities, replay retention and snapshot recovery, cancellation semantics, configured runtime identity. Unsupported versions fail closed with a clear compatibility state |
| `IdentityBinding` | `principal_id`, `profile_id`, stable `agent_id`, `session_id`, optional `project_id`/`mission_id`/`surface_thread_id`, `runtime_owner`, `binding_revision`, and `provenance` containing verified surface/provider identity. The principal comes from trusted transport authentication; external actor provenance is not a client-selected authority |
| `RuntimeCommand` | `schema_version`, durable `command_id`, `idempotency_key`, `expected_revision` where state can race, `identity_binding`, `operation`, and validated `payload`. Authorized target IDs are resolved within that binding. Actor and permissions come from trusted transport authentication, not editable JSON |
| `CommandReceipt` | `command_id`, `status: accepted / rejected / duplicate`, `durable_revision`, optional `run_id` and `conflict`. The final schema must also define safe errors and how the receipt resolves the authorized outcome/cursor. Acceptance means persisted admission, not execution or delivery success |
| `RuntimeEventEnvelope` | `schema_version`, `event_id`, stable stream identity, monotonically ordered per-stream `seq` and opaque resume `cursor`, timestamp, type, typed payload, plus applicable session/mission/run/command/operation/effect/delivery/approval correlations |
| `MissionSnapshot` | BE02 fields `revision`, `state`, `outstanding_requests`, `artifacts`, `unresolved_effects`, and `last_cursor`. Versioned projections include checkpoint/current work, pending approvals and delivery state; `last_cursor` represents exactly the snapshot boundary |
| `ApprovalRequest` / `ApprovalDecision` | Stable approval ID and revision, action digest, exact target and arguments or redacted display plus verifiable digest, actor/scope, policy version, expiry, decision, and durable receipt |
| `EffectReceipt` | BE06 fields `operation_id`, `effect_id`, `input_digest`, `target_ref`, `state`, optional `idempotency_key`/`remote_receipt`/`reconciliation_evidence`, and `generation`. States are `prepared`, `dispatched`, `confirmed`, `failed`, `outcome_unknown`, and `reconciliation_required`; provider references and attempt history remain linked evidence |
| `DeliveryReceipt` | Stable delivery ID, authorized destination and artifact/message version, attempt and provider-message reference, pending/sending/confirmed/failed/unknown status; explicitly separate from execution |
| `ArtifactRef` | Stable artifact ID/version, content digest, MIME type, size, safe display name, store locator, authorized project/agent scope, provenance, validation status, and access method/expiry |
| `ScheduleSnapshot` | Runtime schedule ID/revision, timezone, trigger, next eligible run, missed-run/overlap policy, bounded authorization, pause state, and resulting mission IDs |

`dot.id`, a display name, a CopilotKit thread ID, a Slack thread timestamp, a Hermes session ID, and a mission ID are not interchangeable. One conversation can host multiple missions; one authorized mission can project to several surfaces. Create bindings transactionally and enforce uniqueness before admitting work. Clients cannot remap an existing thread to a different agent, owner, or project.

Hermes owns session fencing. The UI sees a safe runtime identity/revision, not a bearer execution lease that it can invent or extend. A stale adapter command is rejected or reconciled against its persisted command receipt.

### 4.2 Commands and read paths

Minimum logical operations:

1. Discover capabilities and authenticate a narrowly scoped OpenDots-to-Hermes service connection
2. Create/resolve an authorized session binding; read current session/mission/project snapshots
3. `submit_input`, `start_mission`, and `steer_mission`, each with stable ingress deduplication
4. Subscribe/reconnect with an opaque cursor; fetch a snapshot when replay is unavailable
5. `request_cancel`, and read local/upstream cancellation evidence
6. `respond_approval`, binding a specific decision to the exact pending action
7. Resolve/read artifact metadata and authorized downloads; submit version-checked artifact edit commands when enabled
8. Create/update/pause schedules and monitors through Hermes commands once BE12 is ready

Project, delegation, memory-correction, and operator-repair operations are capability-gated extensions. A thin client must not simulate a missing server feature with local autonomous work.

### 4.3 Event mapping and completion

Semantic event families are input accepted/rejected; mission state/checkpoint; message delta/completed; tool/effect state; approval required/resolved/expired; artifact committed; delivery state; cancel requested/acknowledged/outcome unknown; and snapshot required. Exact event names must be schema-versioned.

Map safe text/tool lifecycle events to ordinary AG-UI events. Carry mission state, approval binding, artifacts, and delivery status in agreed state/custom projections. Preserve stable message IDs and artifact versions. Never turn a raw tool payload, private trace, secret, model-internal reasoning, or personal memory result into a channel event automatically.

The user-visible completion state distinguishes:

- Execution reached its verified completion standard
- Required artifacts are committed and accessible
- Delivery is pending, confirmed, failed, or unknown
- Cancellation is requested, locally stopped, provider-acknowledged, or still uncertain

An empty stream, `RUN_FINISHED`, timeout, or successful HTTP response is insufficient evidence that all four are resolved. A delivery retry must not repeat the mission or its external effects.

## 5. Reliability and authority invariants

### Durable admission, deduplication, and replay

Persist input admission and its deduplication key before execution. Derive ingress keys from verified provider message/event IDs where available; web and voice use stable client operation IDs retained across retries. The same key plus the same canonical request recovers the original receipt; the same key with different content is a conflict. Retention must cover the supported provider retry and recovery window, with explicit behavior after expiry.

Network delivery is at least once. The adapter persists its cursor with its projection update, discards already-applied event IDs/sequence numbers, and detects gaps instead of assuming receipt order. Recovery is snapshot at cursor C, followed by events strictly after C, without a race between snapshot and subscription. Replay retention expiry, event redaction, or a missing sequence leads to an explicit resync, not silent history loss. Do not execute tools or recreate approval requests when replaying history.

Transport retries reuse the command ID; they do not create another mission. Concurrent web/Slack/voice inputs meet Hermes's one ownership/admission policy. Slow consumers get bounded buffering and resync/backpressure behavior, never an unbounded queue or loss of an approval/cancellation transition.

### Exact approvals and revocation

The displayed approval identifies action, destination, changed data, cost/commitment where relevant, artifact/input version, and applicable scope. Hermes stores the pending request and validates the response's principal, approval ID/revision, canonical action digest, expiry, and current grants. Approval cannot authorize a later substituted URL, command, file, amount, recipient, or argument set. A material change requires a new approval.

Double-click, refreshed tabs, concurrent decisions, and a lost response recover one durable decision receipt. Stale/expired/denied decisions cannot reopen execution. Revoking a grant while review is open or a run is active is enforced by the runtime/executor before the next effect; UI polling alone is not the enforcement mechanism.

The current page review receipt is reusable evidence of a saved page, not proof that every requested action was approved. In Hermes mode, review UI submits a decision; it must not directly perform a page save and then independently cause Hermes to save it again. If a retained page service executes the write, it does so under the single Hermes effect ID and registered artifact/version contract. Manual user edits remain user-originated, revision-checked artifact operations.

Slack initially links to the authenticated review surface if it cannot carry the full secure interaction. A generic reaction, arbitrary message text, or forwarded tool result is not an approval token. Voice transcripts alone do not become action grants; use the same explicit approval flow and actor binding.

### Cancellation and uncertain effects

`request_cancel` persists intent and returns a receipt even when the worker/provider is unreachable. Hermes stops further dispatch, fences stale workers, and records local stop, provider acknowledgment, and effects already started separately. If an external request may have executed, retain `outcome_unknown` and reconcile through provider status/evidence or an authorized repair; do not relabel it failed merely because the connection closed. Retry is safe only with a verified idempotency contract or reconciled absence of effect.

Cancellation is not rollback. Any compensation is a new authorized action. The interface must keep unresolved effects inspectable after the mission is cancelled. A restarted adapter or runtime must recover pending cancellation and review state without requiring the user to remember an operation ID.

## 6. Memory, artifacts, and service boundaries

### Per-agent memory

Only the designated Ryoko primary personal agent receives the external personal-memory MCP harness binding and credentials. All other specialists use Hermes built-in memory in isolated per-agent namespaces/stores. A name change, copied Dot configuration, parent delegation, or shared project membership cannot inherit Ryoko's memory privileges.

Shared project artifacts and explicitly supplied task context may cross authorized project boundaries without merging agents' private memories. Record provenance and scope for that transfer. Do not copy Ryoko's full personal memory into specialist prompts, logs, learned skills, or channel history. Tests must cover specialist-to-specialist leakage as well as specialist-to-Ryoko access.

The legacy OpenDots global preference list must be inventoried and migrated only to an explicitly chosen permitted destination; there is no automatic fan-out into every agent. In Hermes mode its old read/write UI either maps to the selected agent's authorized memory contract or is disabled with an accurate explanation. An unavailable harness does not cause a silent personal-memory fallback into a second durable store.

Automatic Learning is a distinct potential skill/evidence pipeline. Its existing container routing and frozen conversation enrollment do not override memory separation. Disable it for migrated runtime sessions until evidence scope, external egress, publication/review, and skill rollback are explicitly reconciled with BE11 and BE17. Existing learning enrollment must not enroll new personal-memory content by accident.

### Artifact and page safety

OpenDots pages may remain authoritative for their native document bytes if registered as an artifact store; Hermes owns their task association, validation/evidence, and effect intent. The same document must not have two competing editable authorities. Keep expected-revision checks, preserve user edits, and surface conflicts rather than force-saving the model's version.

Artifact events carry references and safe metadata, not arbitrary local paths or raw unrestricted download URLs. Downloads authorize the current principal and project/agent scope, constrain paths and size, validate MIME/content where appropriate, and avoid treating generated HTML or Markdown as executable trusted content. Render previews in an appropriately sandboxed context. Signed access expires; access revocation applies to new retrievals. Files are not accessible merely because an event mentions them.

An artifact is “ready” only after the producing store acknowledges commit, the required validation/render/test evidence is recorded, and the intended viewer can retrieve it. Sharing/publication is a separate effect with its own approved audience. Shared Space membership is not blanket permission to publish externally.

### Auth, egress, and computer control

Keep runtime/provider/MCP/Jetson secrets server-side. Authenticate the OpenDots service to Hermes with minimum scopes and rotation/revocation; authenticate the human separately and verify the actor-to-owner mapping at ingress. Do not forward the owner's UI token as an all-purpose runtime credential. Any new credential or persistent-access creation follows the deployment's approval process.

Preserve the current whole-route runtime checks, same-origin controls, explicit Slack team/user allowlist, safe error redaction, per-Dot computer separation, and takeover checks. Revalidate scope on reads and mutations, including replay, artifact retrieval, approvals, and resume. Do not trust `agentId`, `threadId`, provider metadata, client-supplied role messages, or display names as proof of authority.

The computer UI may remain, but agent actions must flow through the Hermes broker and effect ledger. The OpenBot service can be a registered isolated executor; it must not retain a second autonomous loop or broader ambient credentials. Human takeover and emergency stop remain enforceable out-of-band; resume requires fresh state and runtime reconciliation. Do not expose the Jetson decision service publicly or route browser clients directly to it.

## 7. Later OpenDots delivery phases

Backend phases BE00–BE18 and frontend phases FE00–FE14 are defined in the companion plans. These OD phases are future consumer work, not permission to begin implementation before the Hermes prerequisites pass.

| Phase | Scope and principal files | Dependencies and exit gate |
| --- | --- | --- |
| **OD00 — Freeze contracts and prove a thin adapter** | Pin both SHAs and protocol fixtures; agree `IdentityBinding`, commands, receipts, events, snapshots, and capability negotiation. Disposable proof around the `AbstractAgent` seam, not a production second runtime | BE01/BE02/U02/U03/U32 first. Earliest proof is fixture/read-only. An end-to-end proof uses the ready Hermes slice A/B; any writes additionally require BE05/BE06 authority/effect guarantees. Gate: submit, disconnect, replay, and recover the same accepted command with no duplicate loop |
| **OD01 — Replace execution ownership** | Add adapter and server-controlled backend selection; change `platform.ts` factories, `platform-config.ts`, setup checks, `headless.ts`, and `dot-agent.ts` wiring. Keep model credentials out of the adapter configuration | BE03–BE06 plus BE08/BE09 for production mission semantics. Gate: web and page chat share the same Hermes ownership, model/tool execution, identity, and memory policy; no TanStack loop on a migrated session |
| **OD02 — Build durable task and review projections** | Replace local task execution controls with mission snapshots; update task views, review cards, results/artifacts, memory settings, and revision-aware page adapters | BE06–BE09, BE12 for schedules, corresponding FE contract work. Gate: restart-safe approvals, cancellation acknowledgments, artifact conflicts, unknown effects, and separate delivery status pass fault injection |
| **OD03 — Unify channels and devices** | Route Slack, voice compute/receipts, and computer UI through the same contracts; reconcile Learning; durable provider ingress/delivery IDs | BE11–BE13; BE15/BE16 only for enabled LAYA-dependent behavior. Gate: cross-surface continuity, voice hangup semantics, channel retries, computer takeover, privacy, and no memory leakage pass connected-service tests |
| **OD04 — Cut over and retire duplicate owners** | Inventory/migrate legacy bindings and schedules; freeze old writers; observe and reconcile; remove legacy paths only after recovery is proven | FE14/BE18 production readiness, BE14 operations and retention controls. Gate: migration/rollback drills, supported deployment matrix, remote exact-commit CI, and explicit deployment approval |

“Hermes first” does not mean designing U32 at the end. The narrow API, ownership, identity, and resumable event contract advance in BE01/BE02 so Hermes's own clients and tests build against the eventual boundary. Later OpenDots implementation consumes those contracts rather than forcing a runtime redesign. Broad LAYA training or every product feature is not a prerequisite for a narrow non-LAYA adapter; only enabled capabilities carry their corresponding gates.

## 8. Migration and rollback runbook requirements

1. Inventory and back up OpenDots pages, Space grants, Dot IDs, conversation bindings, pending reviews, call receipts, local preferences, schedule definitions, and computer scopes. Pin schema and runtime versions; validate restores before migration
2. Add an explicit per-session `runtime_owner` and migration state. Existing sessions remain legacy until reconciled; new canary sessions use Hermes. No automatic backend fallback, dual executing writers, or simultaneous scheduling for one imported task
3. Persist one-to-one import mappings for legacy schedule IDs and stable bindings for sessions/projects. Freeze the legacy schedule before enabling its Hermes replacement. Record checkpoint, last known outcome, next eligible occurrence, timezone/missed-run interpretation, and overlap policy; do not backfill unverified missed effects automatically
4. Settle or visibly carry forward pending page reviews and uncertain computer/provider effects. Never reinterpret a historical page approval as a fresh Hermes approval. Any unresolved old outcome blocks unsafe replay
5. Import artifact references without overwriting editable pages. Validate owner/project access, versions, hashes where available, and all user-facing links. Retain legacy history read-only; reconstruct only justified runtime state from evidence
6. Canary with isolated test identities/projects and restricted tools. Observe duplicates, missing events, stale approvals, unknown effects, delivery failures, memory cross-scope access, and replay recovery; do not use production external writes as a shadow experiment
7. Rollback disables new Hermes admission and freezes affected schedules. Already accepted missions remain owned by Hermes until terminal or safely reconciled; they are not re-run through DotAgent. Restore a compatible projection or show read-only status while repairing. Preserve journals, receipts, mappings, and backups
8. Remove the local runner, duplicate scheduling, global preference injection, and agent-side tool execution only after migration gates pass. Deletion of legacy state follows the explicit retention/recovery policy, not an eager cleanup script

Rollback success means one execution owner and recoverable truth, not merely that the old chat screen loads.

## 9. Acceptance and verification matrix

| Test family | Required scenario and evidence |
| --- | --- |
| Ownership and provider independence | One command from web and Slack retries resolves to one accepted operation; no migrated factory constructs the old loop; model endpoint configuration cannot redirect orchestration |
| Identity and isolation | Forged agent/thread/project IDs, cross-owner reads, unknown Slack actor, stale binding, copied specialist, and concurrent surface commands are rejected or serialized correctly |
| Replay and cursor atomicity | Disconnect before/after admission, restart after effect dispatch, duplicate/out-of-order events, retained cursor and expired cursor, snapshot/subscription race, slow consumer. Final projection matches the authoritative snapshot without repeated tools |
| Cancellation | Detach without cancel; explicit cancel before dispatch/during tool execution; disconnected provider; restart during cancellation; late provider acknowledgment. UI retains unknown effects and never promises billing/remote execution stopped without evidence |
| Approval | Changed recipient/amount/command/file/draft revision, expired request, revoked grant, duplicate click, conflicting decisions, replayed tool response, and lost decision receipt. Only the bound action executes once |
| Effect and delivery recovery | Provider executed but reply was lost; send succeeded but receipt persistence failed; execution completed but Slack delivery failed. Reconcile or safely retry only the appropriate operation; never repeat an entire mission to resend a result |
| Memory and learning | Ryoko alone reaches the external personal harness; every other agent has isolated built-in memory; shared artifacts do not leak private memory; learning is off or explicitly scoped; unavailable harness does not silently redirect writes |
| Artifacts and pages | Concurrent owner/model edits, stale approval draft, duplicate save, inaccessible/expired link, path traversal, oversized payload, unsafe preview, interrupted upload/commit. Preserve revision checks and prove viewer access |
| Schedules | Import once, freeze legacy owner, concurrent startup, missed occurrence, timezone/DST behavior, overlap policy, revoke authorization, pause/resume and restart. One authorized mission per intended occurrence |
| Channels and computers | Slack retry and actor mapping, voice request duplicated across reconnect, media expiry with a surviving mission, call receipt retry, computer takeover/release, stale screenshot, executor restart, and permission revocation |
| LAYA and security | Jetson unavailable/slow/wrong/low-confidence output cannot broaden policy or report unsupported success. Redacted events and service credentials are tested at each boundary |
| Rollout and rollback | Migrate and restore representative fixtures; fail the new adapter after admission; old loop remains unable to re-execute accepted Hermes work; journals and artifact versions remain inspectable |

Reuse the existing tests for runtime scope, Slack channel wiring, headless turns, page reviews, pages/revisions, runners/leases, voice, computers, security, and shutdown. They establish useful regression locations, not proof of the proposed architecture. Add protocol golden fixtures and cross-repository compatibility/fault-injection suites with the exact producer and consumer versions recorded.

For implementation changes, the repository's declared Node 24 CI runs `npm ci`, `npm run check-format`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; see the pinned [CI workflow](https://github.com/TianJieHeng/ryoko-dots/blob/b01ac1f6a903e5e56c119d960901353ac0a3d171/.github/workflows/ci.yml). Changed UI flows additionally need visual, keyboard, narrow-screen, interrupted, and repeated-action checks. Verify real configured channel/provider flows separately from mocks. No test suite or connected-service run is claimed by this documentation review.

## 10. Decisions to close before implementation

- Agree the BE02 API schema/versioning, event order/retention, cursor recovery, and the supported AG-UI/Intelligence adapter behavior
- Choose authoritative page/artifact storage and its revision/effect callback contract; do not dual-write editable bytes
- Specify authenticated service/actor scopes and how revocation reaches active executions and cached projections
- Agree exact cancellation semantics for AG-UI stop, tab close, voice hangup, global pause, and emergency computer takeover
- Define the authorized delivery path for each channel, including provider deduplication or explicit unknown-outcome reconciliation
- Decide which legacy preferences, schedules, and learning enrollments migrate, which remain read-only, and which require renewed approval
- Publish protocol fixtures, migration fixtures, supported configuration, rollback procedure, and observed verification results before enabling production traffic

These are engineering contract choices within the agreed ownership model. They do not reopen the build order, introduce a competing memory harness, grant LAYA authority, or authorize implementation/deployment in this documentation-only change.
