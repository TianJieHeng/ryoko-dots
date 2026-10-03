# BE12 acceptance map and release disposition

**Production readiness: false.** Local source/protocol qualification is complete. Mandatory browser, host, live-provider, export, encrypted-restore and controlled-cutover acceptance remains open.

Tested production source: BE11 `0cb5f0e5d76f8e429054f3d9eb721d04de84e45e`, tree `bb0cee9e6cfce665aa0d67e099ccd20b0a400dd6`. Producer: `98b9eeb7d2afc02d0e0393fea285f010000a0378`. BE12 changes only evidence/docs, CI validation steps and a managed-identity controls fixture; production behavior is unchanged.

See [release summary](backend-release.md) and [machine-readable matrix](backend-acceptance.json). The matrix maps all 65 phase requirements, 37 check groups and 39 baseline controls. Test counts overlap and must not be added.

## Final local evidence

- Repository aggregate:767 passed,11 conditional skips; format/lint/typecheck/build/runtime-contract/production-boundary passed
- Actual stdio:15 passed/1 fixture failure in the10-file consolidation; corrected managed-Dot fixture then passed. All16 cases exercised successfully without rerunning successful families
- Producer:175 tests/22 files passed through the canonical runner on Python3.14.7
- Operations:33 Python tests; clean production-only package install and gated frontend/server boot passed
- Browser:0 assertions and0 screenshots; documented Chromium socket/cloud-browser restrictions were not bypassed
- Target/live providers:synthetic and loopback evidence never qualifies hardware, actual audio, Slack, primary harness or a deployment

## Resolved retained-route findings

- **gap_space_create**: BE05 retained Space creation. Bounded owner-authenticated retained route implemented without starting legacy execution. Four focused retained-route regressions and the final aggregate passed.
- **gap_capture_poll**: BE02/BE08 retained capture/read fallback disposition. Bounded owner-authenticated retained route implemented without starting legacy execution. Four focused retained-route regressions and the final aggregate passed.
- **gap_legacy_task_detail**: BE04/BE07 retained read-only legacy task/run/event history. Bounded owner-authenticated retained route implemented without starting legacy execution. Four focused retained-route regressions and the final aggregate passed.

## Mandatory remaining gates

- **browser**: Supported browser QA remains blocked by documented Chromium socket and loopback browser restrictions; no bypass. Owner-accepted exclusion: false.
- **computer_host**: Actual pinned supervisor/image, browser/shell sandbox and egress, durable volumes and hardware takeover are unqualified. Owner-accepted exclusion: false.
- **voice_live**: Actual microphone/playback/provider/latency/cost/quotas are unqualified; no media credential activated. Owner-accepted exclusion: false.
- **slack_live**: No real workspace installation, signing credentials or external message delivery activated. Owner-accepted exclusion: false.
- **migration_source**: Actual authorized Intelligence export availability and conversion must be established; normalized supplied archives are distinct evidence. Owner-accepted exclusion: false.
- **host_backup_boundary**: Full target-host writer census, remote executor volumes and real encrypted backup/restore remain to be established. Owner-accepted exclusion: false.
- **cutover**: No declared owner/session cohort or deployment acceptance has been authorized; old/new live admissions not switched. Owner-accepted exclusion: false.
- **target_host**: Real non-root native/Compose/TLS/proxy/secret mounts/schema/auth rotation and service manager are unqualified. Owner-accepted exclusion: false.
- **runtime_live_provider**: Real selected model/service behaviour, cost, error and quota are unqualified; all model SDK proof is loopback synthetic. Owner-accepted exclusion: false.
- **primary_harness_live**: No live personal-MCP/harness used. Unsupported primary mutation/export/delete/ingestion remain unavailable by contract, not passed or emulated. Owner-accepted exclusion: false.
- **encrypted_restore**: Actual age executable/crypto round-trip and key recovery were not performed. Passthrough fixture proves parser mechanics only. Owner-accepted exclusion: false.
- **target_host_load**: No representative target-host load, disk-pressure/large profile/stuck-provider performance or measured production RTO/RPO. Owner-accepted exclusion: false.
- **research_fallback**: The end-to-end web→research→page journey remains unqualified. Public reader/security source is retained; canonical legacy capture is intentionally null and new output uses runtime result/artifact routes. Do not infer browser/provider research parity from retained unit tests. Owner-accepted exclusion: false.
- **external_ci**: Workflow exists; zero exact-commit Actions runs/statuses observed. Not a pass. Final commit must be queried. Owner-accepted exclusion: false.

## BE00 — Pin contracts and prove read-only transport

Plan exit: valid/invalid schema, incompatible version, unavailable runtime, same-account other-session denial, A→B→A stale response, cursor expiry/gap/duplicate/foreign generation, slow consumer, connection loss. Record exact producer+consumer commits. OD00 is passed only by executed consumer proof, not by importing TypeScript.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE00-R01 — implemented_bounded_source

Inventory every web/page/voice/Slack/headless/task ingress and existing test. Record current behavior and migration disposition, including learned skills and read-only browser fallback

Implementation: All ingress disposition tracked; original inventory remains baseline, current per-control mapping is below. Legacy execution remains source/test only.

Sources: `docs/runtime/parity-inventory.md`, `src/server/index.ts`, `src/server/self-hosted-app.ts`

Tests: `tests/frontend-package.test.js`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE00-R02 — implemented_bounded_source

Import/generate only qualified schema types with provenance; never manually invent compatibility types. Record schema hashes and required operation capability matrix

Implementation: Generated transitive producer subsets, full SHA-256 provenance and exact clean source pin; no hand-authored producer compatibility types.

Sources: `src/shared/runtime/producer/provenance.json`, `src/shared/runtime/be06-producer/provenance.json`, `src/server/runtime/source-pin.ts`, `scripts/pin-producer-contract.mjs`, `scripts/pin-be06-contract.mjs`

Tests: `tests/producer-source-pin.test.ts`, `tests/backend-runtime.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE00-R03 — implemented_bounded_source

Create a read-only adapter against an isolated synthetic Ryoko home. Establish authenticated owner binding, capabilities, snapshot and ordered event replay; distinguish live transport ID from durable lineage

Implementation: Bounded read-only RPC and transactional cursor/event projection; actual producer-entrypoint owner binding added by BE02.

Sources: `src/server/runtime/rpc.ts`, `src/server/runtime/projection.ts`, `src/server/runtime/stdio.ts`

Tests: `tests/backend-runtime.test.ts`, `tests/self-hosted-conversations.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE00-R04 — implemented_bounded_source

Prove restart/resubscribe behavior before selecting WS vs HTTP. If service-to-human binding is unsupported, coordinate the producer change; no shared master credential in a browser or client-chosen identity

Implementation: Production-entrypoint restart/rebind and canonical operation inspection proven locally in later actual stdio fixtures. No public WS/server-to-human grant assumed.

Sources: `src/server/runtime/stdio.ts`, `src/server/self-hosted-platform.ts`

Tests: `tests/self-hosted-conversations.test.ts`, `tests/self-hosted-commands.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE00-C01**: valid/invalid schema; incompatible version; unavailable runtime; bounds/slow consumer; split/oversized/disconnected pipe. Evidence kind: synthetic_source_tests. Tests: `tests/backend-runtime.test.ts`, `tests/runtime-contract.test.ts`, `tests/conversation-rpc.test.ts`. Remaining: See final local evidence and overall release gates
- **BE00-C02**: same-account other-session denial; A→B→A; cursor expiry/gap/duplicate/foreign generation; persistent generation/restart. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/backend-runtime.test.ts`, `tests/runtime-bindings.test.ts`, `tests/runtime-connection.test.ts`, `tests/self-hosted-conversations.test.ts`. Remaining: See final local evidence and overall release gates
- **BE00-C03**: exact consumer/producer pin; OD00 actual consumer proof. Evidence kind: actual_local_protocol. Tests: `tests/producer-source-pin.test.ts`, `tests/self-hosted-conversations.test.ts`. Remaining: target_host

## BE01 — Self-hosted authentication and scoped bindings

Plan exit: cross-origin/CSRF, host spoofing, expired/revoked auth, unauthorized object IDs, forged profile/agent fields, subscription scope leakage, archive/delete access and remote bind without secure setup. Existing `security.test.ts` and `runtime-scope.test.ts` regressions remain covered.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE01-R01 — implemented_bounded_source

Retain single-owner boundary initially. Replace browser-held broad service credentials with a server-managed authenticated session design; recommended HttpOnly/Secure/SameSite cookies plus CSRF protection, with explicitly scoped API credentials for machine ingress

Implementation: SQLite-backed owner cookie/session lifecycle replaces bearer bypass; browser retains no broad service credential.

Sources: `src/server/owner-auth.ts`, `src/client/api.ts`

Tests: `tests/owner-auth.test.ts`, `tests/client-auth.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE01-R02 — implemented_bounded_source

Keep loopback defaults, exact origin/host checks, body limits, timing-safe credential verification, TLS requirements and rate limits. Define logout/session expiry/revocation, proxy trust, WebSocket ticket origin validation and log redaction

Implementation: Exact host/origin, CSRF, body/rate bounds, timing-safe token check, TLS/proxy constraints, expiry/logout/revocation. Selected stdio route has no browser WebSocket credential.

Sources: `src/server/owner-auth.ts`, `src/server/owner-auth-config.ts`, `src/server/self-hosted-app.ts`

Tests: `tests/owner-auth.test.ts`, `tests/security.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE01-R03 — implemented_bounded_source

Persist unique owner/profile/agent/conversation/runtime mappings with revisions. Verify Dot/Space grants on all reads, writes, event subscriptions and downloads. Ensure renaming an agent never changes its privilege class

Implementation: Owner/profile/agent/conversation mappings with CAS/tombstone/grant fences and immutable privilege class; manual owner Space access is single-owner metadata, not an agent grant.

Sources: `src/server/runtime/bindings.ts`, `src/server/workspace.ts`

Tests: `tests/runtime-bindings.test.ts`, `tests/runtime-identity-service.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE01-R04 — implemented_bounded_source

Store secrets server-side in deployment secret facilities; define rotation and restart behavior. Credential creation/permission changes require their separate authorization

Implementation: Server-owned exact configuration and rotation fences. Real secret mount/TLS/proxy deployment remains a target-host check.

Sources: `src/server/runtime/stdio.ts`, `src/server/owner-auth-config.ts`, `.env.example`, `SECURITY.md`

Tests: `tests/owner-auth.test.ts`, `tests/runtime-provider-scope.test.ts`

Remaining gates: target_host

### Check mapping

- **BE01-C01**: cross-origin/CSRF; exact Host/spoofed proxy; forged profile/agent; revoked/expired/logout/rotation auth; remote insecure bind. Evidence kind: synthetic_source_tests. Tests: `tests/owner-auth.test.ts`, `tests/client-auth.test.ts`. Remaining: See final local evidence and overall release gates
- **BE01-C02**: unauthorized object IDs; cross-session/grant subscription/download denial; archive/delete; stale generation; post-read revocation. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/runtime-bindings.test.ts`, `tests/runtime-scope.test.ts`, `tests/self-hosted-conversations.test.ts`. Remaining: See final local evidence and overall release gates
- **BE01-C03**: real browser cookie behavior and target-host TLS/proxy. Evidence kind: not_qualified. Tests: `tests/owner-auth.test.ts`. Remaining: browser, target_host

## BE02 — Replace Intelligence conversation ownership

Plan exit: no Intelligence key/network required; create/send/reload/search/archive; pagination/order; duplicate ingestion; interrupted stream then final-message reconciliation; runtime/store restart; compression lineage; page-context and Slack/voice receipts remain correctly linked. Existing headless/page-service/workspace tests ported.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE02-R01 — implemented_bounded_source

Build Ryoko-owned conversation lifecycle with stable IDs, ordered canonical messages, source/channel provenance, pagination, search, rename/archive and retained history. Dots stores indexes/projections and surface links, not independent inference truth

Implementation: Canonical producer lifecycle; Dots only durable ingress/index/projection and surface mappings; stable IDs, title search, ordering, pagination, rename/archive.

Sources: `src/server/self-hosted-platform.ts`, `src/server/runtime/conversation-ledger.ts`, `src/client/runtime/history-loader.ts`

Tests: `tests/self-hosted-conversations.test.ts`, `tests/runtime-history-chunks.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE02-R02 — implemented_bounded_source

Specify accepted input vs pending draft vs canonical committed message; reconcile user/assistant/tool messages after reconnect without duplication. Persist command-to-message/run/mission mappings and immutable message revisions where edits are supported

Implementation: Canonical input IDs/run links and committed text reconcile after restart; pending drafts retain original immutable operation.

Sources: `src/server/runtime/command-service.ts`, `src/client/runtime/use-live-history.ts`, `src/client/runtime/commands.ts`

Tests: `tests/runtime-command-recovery.test.ts`, `tests/runtime-history-recovery.test.ts`, `tests/self-hosted-commands.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE02-R03 — implemented_bounded_source

Preserve page-conversation reservation/recovery and one page-plus-specialist binding under concurrent creation, including unknown create outcomes. Preserve call anchor message IDs and hidden internal voice-receipt semantics in history migration

Implementation: Page+Dot reservations survive concurrent/unknown create; call event identity is BE09. Actual old voice anchors require source migration validation.

Sources: `src/server/runtime/conversation-ledger.ts`, `src/server/runtime/voice-ledger.ts`, `src/server/runtime/voice-service.ts`

Tests: `tests/self-hosted-conversations.test.ts`, `tests/self-hosted-voice.test.ts`

Remaining gates: migration_source

### BE02-R04 — implemented_bounded_source

Remove creation/history/readiness dependency on `INTELLIGENCE_API_KEY`; remove Intelligence-based generated thread names or replace through an explicitly supported Ryoko operation with deterministic fallback title

Implementation: Production starts self-hosted BFF without Intelligence; titles are canonical/deterministic and not generated by a hidden model.

Sources: `src/server/index.ts`, `src/server/self-hosted-platform.ts`

Tests: `tests/self-hosted-conversations.test.ts`, `tests/frontend-package.test.js`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE02-R05 — implemented_bounded_source

Replace `Platform.history`, `createConversation`, headless `IntelligenceAgent`, thread resume and page conversation creation. Provide export/restore and bounded history retention. Do not synthesize missing old history

Implementation: Legacy Platform/headless execution retired. Canonical bounded safe-text export implemented; complete restore is BE11, actual legacy history is not synthesized.

Sources: `src/server/index.ts`, `src/server/self-hosted-app.ts`, `src/server/runtime/conversation-ledger.ts`

Tests: `tests/self-hosted-conversations.test.ts`

Remaining gates: migration_source, host_backup_boundary

### BE02-R06 — implemented_bounded_source

Keep optional AG-UI/CopilotKit rendering only after proving it can operate without managed Intelligence; select a local provider/adapter otherwise

Implementation: Browser no longer imports hosted CopilotKit providers; AG-UI text shapes only. Actual browser integration still blocked.

Sources: `src/client/Chat.tsx`, `src/client/ChatTranscript.tsx`, `package.json`

Tests: `tests/frontend-package.test.js`, `tests/transcript.test.tsx`

Remaining gates: browser

### Check mapping

- **BE02-C01**: no Intelligence key/network requirement; create/send/reload/title-search/archive; duplicate title/compression lineage; pagination/order/400KB Unicode; duplicate chunks. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-conversations.test.ts`, `tests/runtime-history-chunks.test.ts`. Remaining: See final local evidence and overall release gates
- **BE02-C02**: interrupted stream/final reconciliation; command-message identity; runtime/store restart; page-context reservation and concurrent create. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-commands.test.ts`, `tests/runtime-history-recovery.test.ts`, `tests/self-hosted-conversations.test.ts`. Remaining: See final local evidence and overall release gates
- **BE02-C03**: Slack/voice receipt linking; late transcript/hidden internal provenance. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-voice.test.ts`, `tests/voice-provenance.test.tsx`, `tests/self-hosted-slack-stdio.test.ts`. Remaining: migration_source

## BE03 — Single command adapter and lifecycle

Plan exit: one input → one canonical command under repeated clicks/retries/process crash; byte-conflict rejection; no local model/tool path in Ryoko mode; long job survives refresh; cancel distinct from detach; unsupported operations fail closed. Replace `tanstack-agent`, `dot-agent-channel`, headless-runtime tests with equivalent boundary tests.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE03-R01 — implemented_bounded_source

Replace `BuiltInAgent`, TanStack `chat`, model adapter, local tool execution and global-memory prompt injection with an AG-UI-compatible projection adapter or documented equivalent

Implementation: One producer command authority; no production DotAgent/TanStack/local-memory loop or fallback.

Sources: `src/server/index.ts`, `src/server/runtime/command-service.ts`

Tests: `tests/self-hosted-commands.test.ts`, `tests/frontend-package.test.js`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE03-R02 — implemented_bounded_source

Route every accepted web/page/headless/channel input through the same authenticated command admission. Persist operation ID+digest and recover receipt on unknown submission outcome

Implementation: All canonical input, including channel/voice bridges, uses immutable ledger + global operation namespace and original receipt inspection.

Sources: `src/server/runtime/command-ledger.ts`, `src/server/runtime/command-service.ts`, `src/server/runtime/voice-service.ts`, `src/server/runtime/slack-bridge.ts`

Tests: `tests/self-hosted-commands.test.ts`, `tests/self-hosted-voice-stdio.test.ts`, `tests/self-hosted-slack-stdio.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE03-R03 — implemented_bounded_source

Map safe text/tool state without forwarding private prompts, raw traces, memory contents or credentials. Keep transcript streaming separate from mission-event projection; finalized transcript is canonical

Implementation: Private producer notifications dropped; journal invalidations are separate from canonical bounded text history; no false token-stream claim.

Sources: `src/server/runtime/conversation-rpc.ts`, `src/client/runtime/use-live-history.ts`, `src/client/runtime/history-loader.ts`

Tests: `tests/conversation-rpc.test.ts`, `tests/runtime-result-notifications.test.ts`, `tests/runtime-history-recovery.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE03-R04 — implemented_bounded_source

Retire inherited 90-second execution deadlines as mission lifetime. Request timeout/unsubscribe detaches; explicit cancel sends a durable command and awaits evidence. Never fall back to old DotAgent on provider failure

Implementation: Detach/abort/refresh do not cancel; explicit exact run cancellation preserves acceptance/ack/effect distinctions; >90-second local fixture exists.

Sources: `src/server/runtime/command-service.ts`, `src/client/runtime/commands.ts`

Tests: `tests/self-hosted-commands.test.ts`, `tests/runtime-command-recovery.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE03-R05 — implemented_bounded_source

Enforce capability gating and bounded queue/admission backpressure; reconnect does not resubmit input

Implementation: Capability and bounded admission/queue controls; restart recovers original accepted work rather than re-submitting from browser.

Sources: `src/server/runtime/command-service.ts`, `src/server/runtime/conversation-rpc.ts`

Tests: `tests/command-lifecycle-recovery.test.ts`, `tests/runtime-commands.test.ts`, `tests/self-hosted-commands.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE03-C01**: one command under repeats/retries/admission crash; byte conflict; immutable source/context; no local-loop fallback. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-commands.test.ts`, `tests/runtime-commands.test.ts`, `tests/runtime-command-recovery.test.ts`. Remaining: See final local evidence and overall release gates
- **BE03-C02**: long job survives detached reader; cancel distinct from detach; restart/unknown inspection; unsupported requests fail closed; backpressure. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-commands.test.ts`, `tests/command-lifecycle-recovery.test.ts`, `tests/conversation-rpc.test.ts`. Remaining: runtime_live_provider, browser

## BE04 — Missions, exact approvals, effects and delivery

Plan exit: double approval, response lost, deny/expiry/revocation, changed bytes/recipient/version, simultaneous tabs, stale generation, effect timeout after dispatch, partial artifact, failed/unknown delivery and cancelled mission with unresolved effect. Journal exact receipt evidence.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE04-R01 — implemented_source_after_bounded_repair

Expose mission state, checkpoints, next action, blockers, required outputs and unresolved effects from Ryoko snapshots. Keep accepted/executing/verified/artifact-committed/delivery-confirmed independent

Implementation: Canonical mission/checkpoint/blocker/effect/output projections, no inferred completion from HTTP success. BE11 adds bounded read-only legacy task detail with explicit provenance and no action path.

Sources: `src/server/runtime/control-service.ts`, `src/client/runtime/MissionDetails.tsx`

Tests: `tests/runtime-control-service.test.ts`, `tests/runtime-results.test.tsx`, `tests/retained-local-surfaces.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE04-R02 — implemented_bounded_source

Use exact approval detail and `runtime.approval.resolve` according to generated schema. Bind decision to actor, session/generation, approval ID/revision, digest, target/content/version, expiry and live grants. Generic runtime command `approval` is not a supported shortcut

Implementation: Exact presented bytes/target/recipient/versions/expiry/live authority fingerprint precedes runtime.approval.resolve; immutable producer revision uses documented zero sentinel.

Sources: `src/server/runtime/control-service.ts`, `src/shared/runtime/reviews.ts`

Tests: `tests/runtime-control-service.test.ts`, `tests/self-hosted-controls.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE04-R03 — implemented_bounded_source

Page review receipt remains a page-save receipt; it is not generic execution authority. Decisions must not perform a local write and then independently trigger a second Ryoko write

Implementation: Native page review resolves original waiter and one producer effect; historical save receipt is not generic approval.

Sources: `src/server/runtime/page-runtime-service.ts`, `src/server/runtime/page-effect-service.ts`

Tests: `tests/self-hosted-pages.test.ts`, `tests/runtime-page-runtime-service.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE04-R04 — implemented_bounded_source

Define global Pause as a runtime-authorized control with explicit new-admission, scheduled-occurrence and in-flight-work behavior; show requested versus acknowledged state and never silently drop accepted work. Revocation fences the next effect even if the browser is offline

Implementation: Owner/profile pause inhibits new admissions/scheduled dispatch and next effect boundaries; accepted/dispatched work truth retained.

Sources: `src/server/runtime/control-service.ts`, `src/server/runtime/command-service.ts`

Tests: `tests/runtime-control-service.test.ts`, `tests/self-hosted-controls.test.ts`, `tests/self-hosted-voice-stdio.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE04-R05 — implemented_bounded_source

Persist delivery intent/receipt correlation. Retry delivery of immutable output without rerunning inference/effects. Unknown remote outcomes stay inspectable and require reconciliation

Implementation: Immutable verified chunk/result outbox and component ACK; response-loss inspection and delivery-only retry cannot replay inference.

Sources: `src/server/runtime/delivery-service.ts`, `src/server/runtime/control-service.ts`

Tests: `tests/runtime-delivery-service.test.ts`, `tests/self-hosted-delivery.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE04-R06 — implemented_bounded_source

Cancellation records requested/local stop/provider acknowledgment/uncertain in-flight effects separately; never imply rollback or trigger compensation without authority

Implementation: Run/mission cancel acceptance, external/provider outcome and unresolved effects remain distinct; no compensation.

Sources: `src/server/runtime/control-service.ts`, `src/server/runtime/command-service.ts`

Tests: `tests/runtime-control-service.test.ts`, `tests/self-hosted-commands.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE04-C01**: double decision; lost resolve response; deny/expiry/revocation; changed bytes/recipient/version; simultaneous tabs; stale generation. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/runtime-control-service.test.ts`, `tests/self-hosted-controls.test.ts`. Remaining: See final local evidence and overall release gates
- **BE04-C02**: effect timeout after dispatch; partial artifact; failed/unknown delivery; cancelled mission with unresolved effect; response-loss ACK. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/runtime-control-service.test.ts`, `tests/runtime-delivery-service.test.ts`, `tests/self-hosted-delivery.test.ts`, `tests/runtime-page-effect-service.test.ts`. Remaining: See final local evidence and overall release gates

## BE05 — Spaces, pages and artifact store adapter

Plan exit: concurrent autosave/review, new page double-submit, saved receipt lost, parent/Space grant revoked, stale page context, interrupted artifact download, digest mismatch, malicious page text, cross-Space access, backup restore and old links. Port pages/page-routes/page-service/library/page-context tests.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE05-R01 — implemented_source_after_bounded_repair

Keep Space list/default destination vs authorized Space grants distinct. Preserve page creation/edit/rename/archive, snapshots, page chat binding, autosave conflict handling and existing native editor semantics

Implementation: Space/page list/editor/autosave/page reservation retained. BE11 repaired the missing bounded owner-only New Space POST; creation never infers Dot/project grants.

Sources: `src/server/self-hosted-app.ts`, `src/server/pages.ts`, `src/client/WorkspaceDialog.tsx`, `src/client/App.tsx`

Tests: `tests/pages.test.ts`, `tests/autosave.test.ts`, `tests/page-chat-request.test.ts`, `tests/retained-local-surfaces.test.ts`

Remaining gates: browser

### BE05-R02 — implemented_bounded_source

Register native page bytes as one declared artifact store. Retain immutable versions/digests and expected-revision compare-and-swap; map canonical head and source lineage. Define transaction/outbox recovery when Dots commits bytes but Ryoko receipt is delayed

Implementation: Atomic native immutable bytes/snapshot/head CAS/source lineage/effect receipt; committed bytes recover independently of later manual edits.

Sources: `src/server/pages.ts`, `src/server/runtime/page-effect-service.ts`

Tests: `tests/runtime-page-effect-service.test.ts`, `tests/self-hosted-pages.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE05-R03 — implemented_bounded_source

Agent page mutations execute only under one validated Ryoko effect/approval identity; manual owner edits remain revision-checked operations. Do not expose unrestricted legacy page tools to an independent loop

Implementation: Only exact producer native callback can perform agent saves; authenticated owner manual edits use expected revision.

Sources: `src/server/runtime/page-runtime-service.ts`, `src/server/runtime/page-effect-service.ts`, `src/server/self-hosted-app.ts`

Tests: `tests/runtime-page-runtime-service.test.ts`, `tests/self-hosted-pages.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE05-R04 — implemented_bounded_source

Stream authorized downloads with MIME/size bounds, safe filenames and digest verification; sanitize rendered Markdown/HTML and block unsafe links/path traversal/SSRF. Preserve source captures/screenshots under scoped retention

Implementation: Digest-verified bounded authorized artifact bytes and safe native JSON/Markdown render; public reader security source retained, but canonical research/capture fallback parity is not demonstrated.

Sources: `src/server/runtime/page-effect-service.ts`, `src/client/runtime/artifacts.ts`, `src/browser/security.ts`, `src/browser/transport.ts`

Tests: `tests/runtime-artifacts.test.ts`, `tests/markdown.test.ts`, `tests/security.test.ts`, `tests/transport.test.ts`

Remaining gates: research_fallback, browser

### BE05-R05 — implemented_bounded_source

Map page review recovery `(threadId, toolCallId)` to canonical operation IDs without losing old receipts. Version conflicts offer explicit recovery, never last-write-wins overwrite

Implementation: Historical thread/tool review identity reads native receipts, no second save; explicit version conflicts preserve drafts.

Sources: `src/server/self-hosted-app.ts`, `src/server/runtime/page-effect-service.ts`, `src/client/PageReviewCard.tsx`

Tests: `tests/runtime-page-effect-service.test.ts`, `tests/page-review.test.tsx`, `tests/autosave.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE05-C01**: concurrent autosave/review; double create; lost save receipt; owner/agent CAS and transaction rollback; stale page/parent/Space grant; cross-Space/cycle/archive denial. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/runtime-page-effect-service.test.ts`, `tests/runtime-page-runtime-service.test.ts`, `tests/pages.test.ts`, `tests/autosave.test.ts`. Remaining: See final local evidence and overall release gates
- **BE05-C02**: interrupted/corrupt artifact; digest mismatch; malicious rendered content; immutable lineage/old review links. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/runtime-artifacts.test.ts`, `tests/runtime-delivery-service.test.ts`, `tests/markdown.test.ts`, `tests/self-hosted-pages.test.ts`. Remaining: See final local evidence and overall release gates
- **BE05-C03**: actual backup restore/old provider links; browser dirty-navigation/rich editor/download interaction. Evidence kind: not_qualified. Tests: `tests/page-archive.test.tsx`, `scripts/qa-runtime-browser.mjs`. Remaining: host_backup_boundary, migration_source, browser

## BE06 — Agent identities, memory boundaries and skills

Plan exit: primary→specialist and specialist↔specialist leakage, rename/copy privilege escalation, project sharing without memory sharing, revoked scope, harness outage, supported correction/delete receipts, frozen enrollment and skill version rollback. Port learning tests rather than silently deleting coverage.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE06-R01 — implemented_bounded_source

Map configurable Dot display identities to stable Ryoko primary/specialist IDs; validate role/profile binding on server. Persistent specialists use isolated built-in namespaces; delegation passes explicit authorized task/project context only

Implementation: Stable primary/specialist roles, frozen session enrollment, verified project intersection; explicit named task/project context only.

Sources: `src/server/runtime/identity-runtime-service.ts`, `src/server/runtime/be06-service.ts`

Tests: `tests/self-hosted-identities.test.ts`, `tests/runtime-identity-service.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE06-R02 — implemented_bounded_source

Disable legacy global preference injection. Inventory old memories and route only through an explicitly reviewed supported destination; never fan them out to all agents or silently fall back from personal harness to local memory

Implementation: Legacy global memory is read-only owner inventory, no bodies copied or injected; frozen source/enrollment preserved.

Sources: `src/server/runtime/be06-migration.ts`, `src/server/runtime/identity-runtime-service.ts`

Tests: `tests/runtime-identity-service.test.ts`, `tests/self-hosted-identities.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE06-R03 — explicitly_unsupported_primary_operations

Show primary harness as unconfigured/unavailable when actual contract is missing. Implement mutation/export/delete only where real harness capability and authorization exist; built-in controls do not certify personal-harness erasure

Implementation: Primary harness operations unsupported stay unavailable; actual primary backend health literal; specialist CAS/tombstone/export does not certify primary/backup erasure.

Sources: `src/server/runtime/be06-service.ts`, `src/shared/runtime/identity.ts`, `docs/runtime/identity-skill-adapter.md`

Tests: `tests/runtime-identity-service.test.ts`

Remaining gates: primary_harness_live

### BE06-R04 — implemented_bounded_source

Replace Intelligence learning containers with a self-hosted scoped evidence and reviewed skill/workflow lifecycle. Implement evidence selection/provenance, immutable draft versions, deterministic evaluation receipts, explicit accept/decline, publication, version-pinned skill delivery and rollback through actual Ryoko contracts; coordinate missing producer operations before claiming parity. Preserve frozen conversation enrollment and opt-in state as migration evidence; no automatic enrollment of personal memory or private transcripts. Merely hiding Learning is acceptable during staged rollout, not full-scope completion

Implementation: Reviewed evidence, immutable workflow/style drafts/evaluation/accept-decline/publication/version delivery/rollback through real producer; no automatic enrollment.

Sources: `src/server/runtime/be06-service.ts`, `src/server/runtime/identity-runtime-service.ts`, `src/client/runtime/ReviewedLearning.tsx`

Tests: `tests/self-hosted-identities.test.ts`, `tests/runtime-identity-service.test.ts`, `tests/identity-learning-client.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE06-R05 — explicitly_bounded_specialist_scope

Named specialist handoff/status is included. Broader teams/budgets/synthesis remain unavailable until producer contract and qualification exist

Implementation: Named specialist handoff/status only; broader teams/budgets/synthesis unavailable until producer support.

Sources: `src/server/runtime/identity-runtime-service.ts`, `src/server/runtime/be06-service.ts`

Tests: `tests/self-hosted-identities.test.ts`, `tests/runtime-identity-service.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE06-C01**: primary→specialist and specialist↔specialist isolation; copy/rename privilege; project shared without memory; revoked scope; harness outage. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/runtime-identity-service.test.ts`, `tests/self-hosted-identities.test.ts`. Remaining: See final local evidence and overall release gates
- **BE06-C02**: supported specialist correction/tombstone/export; frozen enrollment; exact-byte approval/decline/publication; upgrade/version rollback. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/runtime-identity-service.test.ts`, `tests/self-hosted-identities.test.ts`, `tests/identity-learning-client.test.ts`. Remaining: See final local evidence and overall release gates
- **BE06-C03**: real primary personal-harness status; unsupported primary mutations must remain unavailable; third-party physical erasure never inferred. Evidence kind: not_qualified. Tests: `tests/runtime-identity-service.test.ts`. Remaining: primary_harness_live

## BE07 — Schedules, monitors and background tasks

Plan exit: DST/timezone boundaries, duplicate import, simultaneous old/new runner, restart during occurrence admission, missed run, pause vs cancel, run-now deduplication and output delivery failure. Replace runner/store task tests with projection+migration+scheduler contract tests.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE07-R01 — implemented_bounded_source

Retire Dots' local execution timer/leases for migrated jobs; exactly one Ryoko scheduler owns each imported schedule and occurrence

Implementation: Production has no Dots runner timer; permanent SQL freeze/retirement prevents old schedule claims or mutation.

Sources: `src/server/index.ts`, `src/server/store.ts`, `src/server/runtime/legacy-schedule-migration.ts`

Tests: `tests/legacy-schedule-migration.test.ts`, `tests/runner.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE07-R02 — implemented_bounded_source

Map prompt, timezone, recurrence, pause/cancel/run-now, bounded standing authorization, overlap/missed-run policy and next eligible run to real runtime contracts. One-time jobs and task history remain inspectable

Implementation: Paused create/immutable edit; real one-time, interval, calendar/timezone/DST, budget, overlap/missed-run controls and raw histories.

Sources: `src/server/runtime/schedule-service.ts`, `src/client/runtime/SchedulesPanel.tsx`

Tests: `tests/runtime-schedule-service.test.ts`, `tests/runtime-schedule-actions.test.ts`, `tests/self-hosted-schedules.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE07-R03 — implemented_bounded_source

Import with stable legacy schedule+occurrence IDs and durable receipts. Stop legacy new admissions, reconcile active claims, then switch ownership without overlapping execution

Implementation: Stable source/occurrence IDs and retirement receipt; source changed/unresolved work prevents cutover. No actual schedules migrated.

Sources: `src/server/runtime/legacy-schedule-migration.ts`, `src/server/store.ts`

Tests: `tests/legacy-schedule-migration.test.ts`

Remaining gates: migration_source, cutover

### BE07-R04 — implemented_bounded_source

Separate schedule pause from running mission cancellation; server restart/offline intervals cannot manufacture catch-up actions beyond configured policy

Implementation: Future pause/cancel distinct from running mission; restart uses producer stored missed-run policy and observed ticker owner.

Sources: `src/server/runtime/schedule-service.ts`

Tests: `tests/runtime-schedule-service.test.ts`, `tests/self-hosted-schedules.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE07-C01**: DST/timezone fold/gap; one-time/interval/calendar; next run; missed/overlap policy. Evidence kind: synthetic_source_tests. Tests: `tests/runtime-schedule-service.test.ts`, `tests/runtime-schedule-actions.test.ts`, `tests/runtime-schedules.test.ts`. Remaining: See final local evidence and overall release gates
- **BE07-C02**: duplicate import; old/new runner SQL freeze; active/interrupted claim; restart occurrence admission; exact original history; run-now dedupe; pause vs cancel; failed delivery no occurrence replay. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/legacy-schedule-migration.test.ts`, `tests/runtime-schedule-service.test.ts`, `tests/self-hosted-schedules.test.ts`. Remaining: cutover
- **BE07-C03**: actual old/new host scheduler census and cohort retirement. Evidence kind: not_qualified. Tests: `tests/legacy-schedule-migration.test.ts`. Remaining: host_backup_boundary, cutover

## BE08 — Computer and browser executor integration

Plan exit: takeover races, permissions revoked mid-action, stale snapshot, wrong container/bot, secret reflection, bounded response, lost write response, restart/persistent files, sandbox and network controls. Port computer, deployment, transport and research security tests; real executor smoke remains a separate required gate.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE08-R01 — implemented_bounded_source

Preserve per-Dot container/credential isolation, enabled/browser/files/shell permissions, human takeover and fresh snapshot requirement before resumed control

Implementation: Per-Dot credentials/target identity, permissions, independent human holder and fresh snapshot fence in source; deployment isolation unqualified.

Sources: `src/server/computer-service.ts`, `src/server/runtime/computer-http-edge.ts`, `src/computer/index.ts`

Tests: `tests/computer-governed.test.ts`, `tests/computer-edge-protocol.test.ts`

Remaining gates: computer_host

### BE08-R02 — implemented_bounded_source

Register one actual computer executor behind Ryoko policy/effect dispatch. Agent-origin actions must not bypass broker through old routes. Owner direct actions are explicitly authenticated, recorded and scoped

Implementation: One real protocol execution edge behind producer broker; owner actions distinct; primitive-boundary guard; no legacy direct route bypass.

Sources: `src/server/runtime/computer-effect-service.ts`, `src/server/runtime/computer-runtime-service.ts`, `src/computer/target-driver.ts`

Tests: `tests/self-hosted-computers.test.ts`, `tests/computer-target-driver.test.ts`, `tests/computer-edge-protocol.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE08-R03 — implemented_bounded_source

Add unknown/reconciliation-required outcome to audit model where transport failure may follow execution; attach effect/operation/agent/session IDs and redacted evidence. Retry shell/browser writes only after idempotency/reconciliation proof

Implementation: Immutable operation/effect audit/reservations; uncertain admission blocks new writes and survives restart; original inspection only.

Sources: `src/server/computer-store.ts`, `src/server/runtime/computer-effect-service.ts`, `src/computer/index.ts`

Tests: `tests/computer-edge-protocol.test.ts`, `tests/self-hosted-computers.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE08-R04 — implemented_with_unqualified_behavior

Keep canonical-public-page reader restrictions, redirect/private network protections and optional fallback capability when computers are not configured. Enforce isolation against SSRF/DNS rebinding/container escape and redact reflected secrets

Implementation: Public reader/DNS/address/redirect/response protections retained and reused by target; production no-computer research fallback/capture path not established.

Sources: `src/browser/security.ts`, `src/browser/transport.ts`, `src/computer/target-driver.ts`, `docs/runtime/computer-target-edge.md`

Tests: `tests/security.test.ts`, `tests/transport.test.ts`, `tests/research.test.ts`, `tests/computer-public-transport.test.ts`

Remaining gates: research_fallback

### BE08-R05 — not_host_qualified

Qualify advertised browser/files/shell capabilities against real supervisor and target host. Missing executor is unavailable, never a simulated success

Implementation: Fingerprint-bound operator host receipt required; synthetic denied in production. Host browser/files/shell unavailable without actual qualification.

Sources: `src/server/runtime/computer-http-edge.ts`, `src/computer/index.ts`, `deployment/computers/edge.Dockerfile`

Tests: `tests/runtime-computer-runtime-service.test.ts`, `tests/computer-deployment.test.js`

Remaining gates: computer_host

### Check mapping

- **BE08-C01**: takeover/handback; revoke mid-action; stale snapshot; wrong container/bot; bound response and escaped-secret reflection. Evidence kind: synthetic_source_tests. Tests: `tests/computer-edge-protocol.test.ts`, `tests/computer-target-driver.test.ts`, `tests/runtime-computer-runtime-service.test.ts`. Remaining: See final local evidence and overall release gates
- **BE08-C02**: lost write response; target/BFF/Python restart; exact receipt/one dispatch; durable unknown write fence. Evidence kind: actual_local_protocol. Tests: `tests/self-hosted-computers.test.ts`, `tests/computer-edge-protocol.test.ts`. Remaining: computer_host
- **BE08-C03**: real supervisor/browser/shell; filesystem persistence; kernel/container isolation; SSRF/egress; hardware takeover. Evidence kind: not_qualified. Tests: `tests/computer-deployment.test.js`, `tests/computer-public-transport.test.ts`. Remaining: computer_host, browser, host_backup_boundary

## BE09 — Voice and call-to-compute lifecycle

Plan exit: microphone denied, missing local model/provider, dropped call, duplicate compute call, restart, hangup during long mission, transcript arrives late, pending receipt, budget exhaustion and unknown synthesis outcome. Port `voice.test.ts`; qualify actual browser microphone/playback and selected provider. Nonstreaming producer speech is not streaming speech support.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE09-R01 — implemented_bounded_source

Own call records/transcripts/receipts locally; remove Intelligence sync and `Platform.turn` dependency. Choose qualified local STT/TTS or explicit optional provider adapter without changing control-plane authority

Implementation: Durable calls/transcript/receipts; optional official realtime media shell, one ask_compute bridge; no Intelligence/Platform.turn or summary loop.

Sources: `src/server/runtime/voice-service.ts`, `src/server/runtime/voice-media.ts`, `src/server/runtime/voice-ledger.ts`

Tests: `tests/self-hosted-voice.test.ts`, `tests/voice-media-adapter.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE09-R02 — implemented_bounded_source

Persist compute tool-call/operation deduplication across restart; bind call/speaker/session and permitted delegation scope. Untrusted transcript never becomes approval authority

Implementation: Stable owner/call/speaker/session/tool UUID/canonical command mapping persists before admission with global namespace/digest fences.

Sources: `src/server/runtime/voice-ledger.ts`, `src/server/runtime/voice-service.ts`

Tests: `tests/self-hosted-voice.test.ts`, `tests/self-hosted-voice-stdio.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE09-R03 — implemented_bounded_source

Keep microphone capture, speech playback stop, discard audio, hangup, compute detach and mission cancellation separate. Clearly mark call-scoped work; durable accepted missions continue unless explicitly cancelled

Implementation: Capture/playback/discard/hangup/detach/cancel distinct; canonical pause hangs up media but accepted compute continues; physical behavior untested.

Sources: `src/server/runtime/voice-service.ts`, `src/client/useVoice.ts`

Tests: `tests/self-hosted-voice-http.test.ts`, `tests/self-hosted-voice-stdio.test.ts`

Remaining gates: voice_live, browser

### BE09-R04 — explicitly_unqualified_media

Use short-lived scoped media credentials where supported, bounded duration/cost/concurrency and explicit provider error states; never silently route to another provider. Do not activate or download models as a side effect of setup

Implementation: Server-held fixed official media endpoint and scoped SDP; duration/concurrency/request accounting, not guaranteed currency cap; enabled+qualified required. Finite local speech unavailable in this realtime UI.

Sources: `src/server/runtime/voice-config.ts`, `src/server/runtime/voice-media.ts`, `docs/runtime/voice-lifecycle.md`

Tests: `tests/voice-media-adapter.test.ts`, `tests/runtime-voice-client.test.ts`

Remaining gates: voice_live

### BE09-R05 — implemented_bounded_source

Replace call-summary sync with canonical call receipt and separately admitted summary where required. Handle late transcript and out-of-order events without duplicate messages

Implementation: Late/out-of-order local call transcript receipts dedupe; canonical compute result digest separately verified; no automatic hangup summary command.

Sources: `src/server/runtime/voice-ledger.ts`, `src/server/runtime/voice-service.ts`

Tests: `tests/self-hosted-voice.test.ts`, `tests/voice-provenance.test.tsx`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE09-C01**: duplicate compute; restart; hangup/detach during long canonical work; late transcript; pending/unknown receipt; budget refusal; foreign scope; paused call. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-voice.test.ts`, `tests/self-hosted-voice-http.test.ts`, `tests/self-hosted-voice-stdio.test.ts`. Remaining: See final local evidence and overall release gates
- **BE09-C02**: missing/unqualified provider or local model; bounded SDP/provider rejection; unknown synthesis/media debt never replayed; legacy voice coverage retained. Evidence kind: synthetic_source_tests. Tests: `tests/voice-media-adapter.test.ts`, `tests/runtime-voice-client.test.ts`, `tests/voice.test.ts`. Remaining: See final local evidence and overall release gates
- **BE09-C03**: microphone denied/capture; speaker playback; real dropped call; actual provider signalling/media/hangup; latency/cost/quota. Evidence kind: not_qualified. Tests: `scripts/qa-runtime-browser.mjs`. Remaining: voice_live, browser

## BE10 — Self-hosted Slack ingress and delivery

Plan exit: wrong team/user, spoofed/replayed events, duplicate retry, bot loop, concurrent surfaces, unthreaded/threaded reply mapping, revoked channel access, throttling, send accepted/response lost, private artifact link access and disconnected adapter. Port Slack wiring/channel tests; connected workspace end-to-end verification is mandatory before enabling.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE10-R01 — implemented_bounded_source

Replace Intelligence-managed Slack dependency using an actual supported Ryoko Slack adapter or a thin self-hosted signed-events/Socket Mode adapter; choose one authoritative ingress and sender per installation, never run both in parallel

Implementation: Thin signed-events ingress replaces managed Channels; competing legacy/socket/producer sender config rejected.

Sources: `src/server/runtime/slack-runtime.ts`, `src/server/runtime/slack-config.ts`, `src/server/index.ts`

Tests: `tests/self-hosted-slack.test.ts`, `tests/slack-consumer-http.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE10-R02 — implemented_bounded_source

Validate Slack event signature/timestamp/replay or authenticated Socket Mode envelope; verify workspace/channel/user/thread mappings and allowlists. Bot events, edits and unsupported event families get explicit handling rules

Implementation: Exact raw HMAC/timestamp bounded parse + pair allowlists + expiring scoped actor/channel standing authority, not signature alone; bots/edits/reactions ignored.

Sources: `src/server/runtime/slack-service.ts`, `src/server/runtime/slack-config.ts`

Tests: `tests/self-hosted-slack.test.ts`, `tests/slack-consumer-http.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE10-R03 — implemented_bounded_source

Deduplicate provider event IDs before command admission; map Slack threads to canonical conversations and preserve message provenance/order. Apply shared per-session ownership across web/voice/Slack, not merely per-channel serial execution

Implementation: Durable event/thread/canonical operation mapping before dispatch; one shared command service and original provenance; no second loop.

Sources: `src/server/runtime/slack-ledger.ts`, `src/server/runtime/slack-bridge.ts`

Tests: `tests/self-hosted-slack-stdio.test.ts`, `tests/slack-consumer-http.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE10-R04 — implemented_bounded_source

Deliver from durable immutable outbox records with rate-limit/backoff, actual provider receipt and unknown-outcome recovery. Channel reply scope never grants unrelated sharing

Implementation: Immutable original-destination outbox; paced explicit429 retry only; response loss reconciles exact unedited bot/block/timestamp; no match is not resend permission. Scheduled cross-channel output is not exposed.

Sources: `src/server/runtime/slack-service.ts`, `src/server/runtime/slack-api.ts`, `docs/runtime/self-hosted-slack.md`

Tests: `tests/self-hosted-slack.test.ts`, `tests/self-hosted-slack-stdio.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE10-R05 — implemented_bounded_source

Link unsupported approvals to the authenticated exact-action review surface; reactions/free text are not generic approval tokens. Preserve links/citations and safe artifact authorization

Implementation: Exact authenticated web review/result links; no free-text/reaction approval and no public artifact upload.

Sources: `src/server/runtime/slack-bridge.ts`, `src/server/runtime/slack-api.ts`

Tests: `tests/self-hosted-slack.test.ts`, `tests/slack-consumer-http.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### Check mapping

- **BE10-C01**: wrong team/user/pair; spoof/replay timestamp; duplicate event; bot loop; thread/unthreaded mappings; concurrent shared admission. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-slack.test.ts`, `tests/slack-consumer-http.test.ts`, `tests/self-hosted-slack-stdio.test.ts`. Remaining: See final local evidence and overall release gates
- **BE10-C02**: revoked channel/project authority; throttling; send accepted/response lost; restart; exact bot-marker inspection; private link; disconnected adapter. Evidence kind: actual_local_protocol_and_synthetic. Tests: `tests/self-hosted-slack.test.ts`, `tests/slack-consumer-http.test.ts`, `tests/self-hosted-slack-stdio.test.ts`. Remaining: See final local evidence and overall release gates
- **BE10-C03**: actual workspace installation/membership/scopes/signatures/provider behaviour/rate limits/external delivery. Evidence kind: not_qualified. Tests: `tests/self-hosted-slack-stdio.test.ts`. Remaining: slack_live

## BE11 — Migration, deployment, privacy and operations

Plan exit: restore rehearsal, partial import resume, source history unavailable, old links, task overlap guard, auth rotation/revocation, disk full/corrupt projection, runtime unavailable, process kill, slow provider and redaction. Document exact host/provider qualification and recovery time/data-loss targets measured by test, not invented guarantees.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE11-R01 — implemented_with_local_checks_passed

Produce dry-run inventory of SQLite, Intelligence history/export access, page versions, thread/task/call mappings, global preferences, learning settings and computer identities. Export historical Intelligence records only with available authorized access; record missing/partial exports, never claim SQLite backup contains old conversations

Implementation: Read-only offline SQLite inventory includes mappings/preferences/enrollment/pages/computers; source WAL refusal; original authorized cloud export must be supplied.

Sources: `scripts/operations/legacy_inventory.py`, `docs/BE11-operations.md`

Tests: `tests/test_operations.py`

Remaining gates: migration_source

### BE11-R02 — implemented_with_local_checks_passed

Import into self-hosted canonical/projection stores with stable IDs, provenance, counts/digests, recoverable batches and quarantine conflicts. Never replay historic tool calls/approvals/effects. Keep legacy archives readable and rollback-safe

Implementation: Resumable inert archives stable IDs/digests/batches/quarantine/tombstones + owner-auth imported-history reads; no producer canonical import operation claimed, no historical tool replay.

Sources: `scripts/operations/history_import.py`, `src/server/operations/history-archive.ts`, `src/client/runtime/ImportedHistory.tsx`, `docs/history-export-contract.md`

Tests: `tests/test_history_import.py`, `tests/history-archive.test.ts`, `tests/imported-history-ui.test.tsx`

Remaining gates: migration_source, browser

### BE11-R03 — implemented_with_local_checks_passed

Remove runtime reliance on Intelligence keys/URLs/SDK methods/managed Channels and unneeded packages after parity tests. Retain appropriate OSS notices and optional provider settings. Add startup capability/schema diagnostics and readiness independent per surface

Implementation: Production AST boundary, build/dev-only legacy packages, clean production-only no-Intelligence boot and independent readiness.

Sources: `scripts/check-production-boundary.mjs`, `scripts/test-production-boot.mjs`, `package.json`, `src/server/index.ts`

Tests: `tests/frontend-package.test.js`, `tests/operations-routes.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE11-R04 — implemented_with_local_checks_passed

Back up and restore Ryoko state, Dots metadata, page/artifact bytes and mapping/outbox records at a documented consistent boundary. Encrypt/protect backups; specify retention, export/delete propagation, tombstones and limits of third-party erasure

Implementation: Offline paired DB/artifact snapshot under same gate, manifest/no-replace restore, explicit state census, protected mode, tombstone/privacy limits. Real encryption/complete host restore unqualified.

Sources: `scripts/operations/safe_state.py`, `scripts/operations/lifetime_gate.py`, `deployment/state-plan.example.json`, `docs/BE11-operations.md`

Tests: `tests/test_operations.py`

Remaining gates: host_backup_boundary, encrypted_restore

### BE11-R05 — implemented_with_local_checks_passed

Add structured redacted logs/metrics for command admission, adapter lag, replay gaps, stuck approval/effect/delivery, channel health, storage pressure and queue saturation. IDs are correlation, not secrets. No raw personal memory or audio in routine telemetry

Implementation: Redacted numeric allowlist diagnostics/readiness/admission and local unknown/queue/storage gauges; unavailable global producer latency/stuck counters not fabricated.

Sources: `src/server/operations/runtime-operations.ts`, `src/server/operations/state-metrics.ts`, `src/server/operations/readiness-evidence.ts`

Tests: `tests/runtime-operations.test.ts`, `tests/operations-routes.test.ts`

Remaining gates: target_host_load

### BE11-R06 — implemented_with_local_checks_passed

Harden non-root images/private ports, secret mounts, resource limits, TLS/proxy configuration, migrations, health/readiness, graceful stop/drain and restart. Fresh install must work without an Intelligence account

Implementation: Admission drain/process-tree gate and forced-exit store safety; non-root native/Compose specimens, secret mounts/TLS/resource limits. Real host install/build/census remains unqualified.

Sources: `src/server/index.ts`, `src/server/operations/state-gate.ts`, `scripts/operations/lifetime_gate.py`, `deployment/Dockerfile.self-hosted`, `deployment/compose.self-hosted.yml`, `deployment/dots-native.service.example`

Tests: `tests/state-gate.test.ts`, `tests/test_operations.py`, `tests/runtime-operations.test.ts`

Remaining gates: target_host, host_backup_boundary

### Check mapping

- **BE11-C01**: partial import resume; missing/partial source; changed content quarantine; tombstones; stable old-ID link; no replay. Evidence kind: synthetic_local. Tests: `tests/test_history_import.py`, `tests/test_operations.py`, `tests/history-archive.test.ts`, `tests/imported-history-ui.test.tsx`. Remaining: migration_source, browser
- **BE11-C02**: paired restore; held gate; process/wrapper/Node kill; owned Python survivor; pending WAL; ENOSPC/corruption/tamper; no-replace; path safety; computer journal/workspace inclusion. Evidence kind: synthetic_local. Tests: `tests/test_operations.py`, `tests/state-gate.test.ts`. Remaining: host_backup_boundary, encrypted_restore
- **BE11-C03**: fresh compiled production-only boot; unconfigured runtime; auth rotation/revocation; unavailable/slow probe; redaction; graceful drain deadline. Evidence kind: synthetic_local. Tests: `scripts/test-production-boot.mjs`, `tests/runtime-operations.test.ts`, `tests/operations-routes.test.ts`, `tests/owner-auth.test.ts`. Remaining: target_host, target_host_load
- **BE11-C04**: real export normalization; true target-host full-writer census; real crypto restore; large data/load; cross-version rollback/RTO/RPO. Evidence kind: not_qualified. Tests: `docs/BE11-operations.md`. Remaining: migration_source, host_backup_boundary, encrypted_restore, target_host_load, cutover

## BE12 — Consolidated qualification and controlled cutover

Plan exit: exact receipts, all required checks passed or explicit owner-accepted scope exclusions; no unresolved critical authority/data-loss defects. Production readiness remains false if mandatory producer, external-service, backup/restore or target-host gates are missing. Plan completion is not deployment authorization.

Local disposition: local_checks_passed_external_gates_open. External gates remain independently binding.

### BE12-R01 — local_qualification_passed_external_journeys_open

Run focused phase tests again against final assembled commits, then repository aggregate format/lint/typecheck/test/build and complete cross-service journeys. Pin exact producer+consumer/schema/config versions

Implementation: Final aggregate and all 16 stdio cases exercised successfully on final production source; one retired-API fixture correction passed targeted rerun. Exact pins and evidence recorded in finalLocalValidation.

Sources: `package.json`, `scripts/test-runtime-stdio.mjs`, `src/shared/runtime/producer/provenance.json`

Tests: `tests/self-hosted-conversations.test.ts`, `tests/self-hosted-commands.test.ts`, `tests/self-hosted-controls.test.ts`, `tests/self-hosted-delivery.test.ts`, `tests/self-hosted-pages.test.ts`, `tests/self-hosted-identities.test.ts`, `tests/self-hosted-schedules.test.ts`, `tests/self-hosted-computers.test.ts`, `tests/self-hosted-voice-stdio.test.ts`, `tests/self-hosted-slack-stdio.test.ts`

Remaining gates: No additional requirement-specific gate; overall release gates still apply

### BE12-R02 — source_disposition_complete_external_acceptance_open

Compare pre-migration capability inventory to final disposition; no unexplained missing chat/history/Space/review/task/voice/Slack/computer/learning behavior. Unsupported/deferred breadth is visibly disabled with an honest reason

Implementation: All39 baseline controls mapped. Three retained routes repaired and included in passing aggregate. Unsupported primary harness operations/finite realtime speech/teams/LAYA remain explicit; actual browser/provider research acceptance remains open.

Sources: `docs/runtime/parity-inventory.md`, `docs/runtime/identity-skill-adapter.md`, `docs/runtime/voice-lifecycle.md`

Tests: `scripts/qa-runtime-browser.mjs`

Remaining gates: research_fallback

### BE12-R03 — not_qualified

Complete fault/security/load/restore/privacy and real supported surface tests below. Label synthetic, browser, native/host and live-provider evidence separately. A mock cannot certify actual voice, Slack, computer or public deployment

Implementation: Synthetic/local protocol/browser/native host/live provider evidence separated. Mock/loopback does not certify external services or containment.

Sources: `docs/runtime/frontend-release.md`, `docs/runtime/computer-target-edge.md`, `docs/runtime/voice-lifecycle.md`, `docs/runtime/self-hosted-slack.md`, `docs/BE11-operations.md`

Tests: `scripts/qa-runtime-browser.mjs`

Remaining gates: browser, computer_host, voice_live, slack_live, runtime_live_provider, host_backup_boundary, encrypted_restore, target_host_load

### BE12-R04 — not_qualified

Cut over one declared owner/session cohort with old admissions frozen and a verified single runtime/scheduler. Observe command, artifact, delivery and resource evidence; expand only after explicit acceptance

Implementation: One explicit owner/session cohort, frozen old admissions and verified single owner/scheduler required before authorized cutover. No cohort or live routing switch performed.

Sources: `src/server/runtime/legacy-schedule-migration.ts`, `docs/BE11-operations.md`

Tests: `tests/legacy-schedule-migration.test.ts`

Remaining gates: cutover

### BE12-R05 — not_qualified

Rollback freezes new admissions and restores client routing/config safely. Already accepted Ryoko work retains ownership until resolved. Do not rerun it through old DotAgent; retain mappings/journals/artifacts/unknown outcomes and backward-readable schema or documented restore path

Implementation: Rollback freezes new admissions, preserves original accepted work/owner/operation/unknowns/artifacts/journals and never replays via DotAgent. Compatible restore path needs actual host rehearsal.

Sources: `docs/BE11-operations.md`, `src/server/runtime/legacy-schedule-migration.ts`, `scripts/operations/safe_state.py`

Tests: `tests/legacy-schedule-migration.test.ts`, `tests/test_operations.py`

Remaining gates: host_backup_boundary, cutover

### Check mapping

- **BE12-C01**: format/lint/typecheck/test/build; full stdio suite; production boundary/boot; Python operations; exact remote consumer/producer/schema pins and exact-commit CI. Evidence kind: local_evidence_recorded. Tests: `package.json`, `scripts/test-runtime-stdio.mjs`, `scripts/check-production-boundary.mjs`, `scripts/test-production-boot.mjs`, `.github/workflows/ci.yml`. Remaining: external_ci
- **BE12-C02**: web→research→page review/edit; specialist isolation; schedule→restart→notice; computer takeover/effect recovery; voice→compute→hangup; Slack→web review→delivery repair; migration→rollback. Evidence kind: local_paths_exist_external_journeys_not_qualified. Tests: `scripts/test-runtime-stdio.mjs`, `scripts/qa-runtime-browser.mjs`. Remaining: browser, research_fallback, computer_host, voice_live, slack_live, migration_source, host_backup_boundary, cutover

## Baseline control disposition

- **PARITY-01** Owner unlock, refresh, settings / App, api: implemented_or_explicitly_bounded_by_linked_phase; phases BE01; remaining overall browser/host acceptance
- **PARITY-02** Setup guide/status / WorkspaceDialog: implemented_or_explicitly_bounded_by_linked_phase; phases BE00, BE01; remaining overall browser/host acceptance
- **PARITY-03** Create/select recent chat / App, ThreadList: implemented_or_explicitly_bounded_by_linked_phase; phases BE02; remaining overall browser/host acceptance
- **PARITY-04** Names, specialist attribution, load more / ThreadList: implemented_or_explicitly_bounded_by_linked_phase; phases BE02; remaining overall browser/host acceptance
- **PARITY-05** Message composer, initial prompt, source URL / Chat: implemented_or_explicitly_bounded_by_linked_phase; phases BE03; remaining overall browser/host acceptance
- **PARITY-06** Live text, progress, tool cards, reconnect / Chat: implemented_or_explicitly_bounded_by_linked_phase; phases BE02, BE03; remaining overall browser/host acceptance
- **PARITY-07** Stop response / Chat: implemented_or_explicitly_bounded_by_linked_phase; phases BE03, BE04; remaining overall browser/host acceptance
- **PARITY-08** Markdown, page links, call placement / ChatTranscript: implemented_or_explicitly_bounded_by_linked_phase; phases BE02; remaining overall browser/host acceptance
- **PARITY-09** Save conversation as page / Chat: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-10** Task search/list/details/events/saved runs / App, TaskPresentation: retained_source_repaired_local_aggregate_passed; phases BE04; remaining overall browser/host acceptance
- **PARITY-11** Retry/resume/run again/pause/cancel / TaskActions: implemented_or_explicitly_bounded_by_linked_phase; phases BE04; remaining overall browser/host acceptance
- **PARITY-12** Global Pause / App: implemented_or_explicitly_bounded_by_linked_phase; phases BE04; remaining overall browser/host acceptance
- **PARITY-13** Page review approve/decline / PageReviewCard: implemented_or_explicitly_bounded_by_linked_phase; phases BE04, BE05; remaining overall browser/host acceptance
- **PARITY-14** Space creation/navigation/tree / SpaceNav, SpaceWorkspace: retained_source_repaired_local_aggregate_passed; phases BE05, BE06; remaining overall browser/host acceptance
- **PARITY-15** Library search/sort/grid/list / SpaceLibrary: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-16** Title, rich/source mode, formatting/slash commands / PageDocument, editor: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-17** Autosave, save status, keyboard Save / autosave: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-18** Move/New subpage/outline / DocumentMenu, PageOutline: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-19** Download Markdown/draft, Load latest, source conversation: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-20** Page-specific chat and specialist picker / PageConversation: implemented_or_explicitly_bounded_by_linked_phase; phases BE02; remaining overall browser/host acceptance
- **PARITY-21** Back/Forward, close/cancel, dirty navigation: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-22** Artifact preview/download / ResultPane: implemented_or_explicitly_bounded_by_linked_phase; phases BE05; remaining overall browser/host acceptance
- **PARITY-23** Specialist create/edit name/instructions/research/memory: implemented_or_explicitly_bounded_by_linked_phase; phases BE06; remaining overall browser/host acceptance
- **PARITY-24** Allowed Spaces/default destination / WorkspaceDialog: implemented_or_explicitly_bounded_by_linked_phase; phases BE06; remaining overall browser/host acceptance
- **PARITY-25** Memory list/add/edit/delete/export / App, WorkspaceDialog: implemented_or_explicitly_bounded_by_linked_phase; phases BE06; remaining overall browser/host acceptance
- **PARITY-26** Automatic Learning enrollment/delivery / WorkspaceDialog: implemented_or_explicitly_bounded_by_linked_phase; phases BE06; remaining overall browser/host acceptance
- **PARITY-27** Schedule creation/edit/interval/run now/pause/resume/cancel: implemented_or_explicitly_bounded_by_linked_phase; phases BE07; remaining overall browser/host acceptance
- **PARITY-28** Occurrence history and notifications: implemented_or_explicitly_bounded_by_linked_phase; phases BE07; remaining overall browser/host acceptance
- **PARITY-29** Computer start/stop and per-Dot permissions / ComputerPanel: implemented_or_explicitly_bounded_by_linked_phase; phases BE08; remaining overall browser/host acceptance
- **PARITY-30** Take/release/emergency stop: implemented_or_explicitly_bounded_by_linked_phase; phases BE08; remaining overall browser/host acceptance
- **PARITY-31** Browser/screenshots/inline cards / ComputerPanel, ComputerToolCard: implemented_or_explicitly_bounded_by_linked_phase; phases BE08; remaining overall browser/host acceptance
- **PARITY-32** Files/Terminal/Activity tabs: implemented_or_explicitly_bounded_by_linked_phase; phases BE08; remaining overall browser/host acceptance
- **PARITY-33** Research source URLs/excerpts/screenshots / ResultPane, Chat: retained_source_repaired_local_aggregate_passed; phases BE08; remaining research_fallback
- **PARITY-34** Start/end call, connecting/active/ending / useVoice, CallView: implemented_or_explicitly_bounded_by_linked_phase; phases BE09; remaining overall browser/host acceptance
- **PARITY-35** Microphone/speaker mute, captions, phase/duration/minimize: implemented_or_explicitly_bounded_by_linked_phase; phases BE09; remaining overall browser/host acceptance
- **PARITY-36** Voice compute and receipt sync/reconnect: implemented_or_explicitly_bounded_by_linked_phase; phases BE09; remaining overall browser/host acceptance
- **PARITY-37** Slack setup, origin, cross-surface review links: implemented_or_explicitly_bounded_by_linked_phase; phases BE10; remaining overall browser/host acceptance
- **PARITY-38** Migration, legacy history, rollback notices: implemented_or_explicitly_bounded_by_linked_phase; phases BE11; remaining overall browser/host acceptance
- **PARITY-39** Self-hosted startup/backup/restore/package: implemented_or_explicitly_bounded_by_linked_phase; phases BE11; remaining overall browser/host acceptance

## Acceptance condition

All required checks passed on final pins, or genuinely explicit owner-accepted scope exclusions, with no unresolved critical authority/data-loss defect. Mandatory host/export/backup/cutover gates are not owner exclusions.

No owner scope exclusions have been accepted. No cohort has been cut over. Accepted/unknown work retains its original runtime owner, operation, mappings and receipts during rollback; it is never replayed through a retired DotAgent.
