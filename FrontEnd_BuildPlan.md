# Ryoko Dots Frontend Build Plan

## Purpose and status

Build a fully self-hosted Ryoko Dots interface over the Ryoko-owned Hermes control plane. Replace CopilotKit Intelligence conversation storage, transport and managed-channel dependence while preserving the current user journeys. Optional model, media and other external providers remain configurable behind explicit runtime capabilities; self-hosting the control plane does not require every inference provider to run locally.

This is an implementation plan, not an implementation receipt. The companion `BackEnd_BuildPlan.md` defines BE00–BE12. FE identifiers here refer to **Dots consumer work**, not the older Hermes frontend phases. This plan supersedes `Integration_Handoff.md` where that document permits Intelligence to remain conversation-history authority. Leave that historical handoff unchanged.

Source baseline: Dots `b01ac1f6a903e5e56c119d960901353ac0a3d171`; published Ryoko producer `124931a916c8aa6beeaf60d08dd55ca5d20f6e3c`. Hermes FE14 names producer contract candidate `b323e73f7b2f6792c57341240e206a72e43e3192`; it supplies producer-only synthetic fixtures, not Dots compatibility. Record exact generated-file hashes and the selected producer/consumer commits at implementation start.

## Ownership and contract constraints

Hermes owns authenticated identity, agent/session/project/mission binding, execution, policy, memory routing, scheduling, effects and delivery truth. The Dots server owns only declared application metadata and authoritative page bytes where registered; the browser owns ephemeral presentation state and recoverable drafts. Never introduce a browser planner, local execution fallback, second transcript authority or secondary scheduler.

Current source boundaries matter:

- `App.tsx`, `Chat.tsx` and `ThreadList.tsx` directly depend on CopilotKit React state, runs and thread listing; `Platform`, `PageService` and `headless.ts` also depend on Intelligence. Replacing `DotAgent` alone cannot remove that dependency
- Hermes provides `runtime.capabilities`, `runtime.command`, `runtime.snapshot` and `runtime.events.since`. The current command schema contains submit/steer/cancel/approval, but runtime admission rejects approval commands; exact reviews use `runtime.approval.resolve`
- Durable runtime events expose redacted correlation/status data. They are not a complete token stream. `session.history`, `session.list`, `session.resume`, session events and live output need a BE02/BE03 adapter with separate reconciliation rules
- `session.create` creates a live session and normally persists its database row on first prompt unless seeded. `session.active_list` is process-local, not durable conversation listing. Compression/lineage identity must survive runtime-ID changes
- The authenticated `/api/ws` JSON-RPC path is a transport candidate. The existing HTTP `/v1/runs` surface is not automatically equivalent. Service-to-human ownership, restart reattachment and profile isolation require proof
- Proposed Dots HTTP routes, frontend stores and compatibility envelopes are **new consumer contracts**. Freeze them in BE00; do not present them as existing Hermes endpoints

Durable command receipt, completed execution, committed artifact, delivered bytes and human reading are different facts. Browser teardown detaches; explicit cancel requests execution cancellation. Unknown outcomes remain visible and inspectable. Reconnect and retry preserve command identity, immutable review content and scope generation. No token, provider credential, personal-memory payload or unrestricted tool output becomes browser state by default.

## Mandatory checkpoint protocol

Apply this protocol to **every FE00–FE12 phase**:

1. Confirm dependencies, pinned contracts and authorized scope before implementation. Keep a failed dependency blocked; do not simulate it with frontend authority
2. Implement the bounded phase and run its focused tests. Record exact commands, environment, source commits, fixtures, expected/observed outcomes and passed/failed/blocked/not-run distinctions
3. Update this repository’s single root `BuildJournal.md`, shared with backend phases (create it at implementation start) with changes, decisions, known limits and next gate; link evidence rather than creating competing journal trees
4. Review the diff and Git status, create the phase checkpoint commit when authorized, and publish only through the authorized normal Git workflow. Record exact commit and remote verification separately; local commits do not imply push or CI success
5. Give the user the checkpoint summary, evidence and remaining decisions, continue only within approved scope and pause for any new decision or authorization required. A test pass does not authorize new scope or deployment

## FE00 Freeze parity and wire fixtures

**Depends on:** BE00. **Targets:** `src/shared/types.ts`, `src/shared/page-review.ts`, `src/shared/computer-types.ts`, `src/shared/voice-receipt.ts`, test fixtures and contract documentation.

Inventory every current control and map it to an authoritative read, command, receipt and unavailable state. Cover chat, source-link research, save-to-page, page-specific conversations, Spaces, specialist configuration, memory, tasks, schedules, computers, calls, Slack and Learning. Record existing limitations rather than upgrading claims.

Freeze browser-safe DTOs for conversation identity/history, transcript parts, mission/review status, revisions, delivery and setup. Separate session-event sequences from durable-runtime cursors. Agree stable message IDs, call anchors, command IDs, binding generations, pending writes and snapshot replacement. Specify retention and explicit history truncation.

Create producer-derived golden fixtures, including actual rejected operations and unconfigured features. An AG-UI presentation adapter may remain if proven independent of hosted Intelligence; retaining the SDK is an engineering choice, not permission to retain cloud authority.

**Focused gate:** schema drift, unknown fields/versions, redaction, unsupported operation and no-Intelligence configuration tests. Complete the mandatory checkpoint.

## FE01 Authenticate and show truthful setup

**Depends on:** FE00; BE01. **Targets:** `App.tsx`, `api.ts`, `WorkspaceDialog.tsx`, setup DTOs; server coordination in `platform-config.ts`, `runtime-scope.ts`, `app.ts`.

Replace “Intelligence configured” and model-key heuristics with server-issued status for control-plane reachability, ownership binding, compatible contracts and optional providers. Preserve the owner unlock flow without exposing runtime service credentials. Clear protected projections when authentication changes; scope caches to owner, gateway, agent, project and generation.

Render loading, disconnected, degraded, unsupported and permission-denied states distinctly. Research, computer, speech and Slack setup must remain independently legible. Prevent stale asynchronous responses from unlocking controls after sign-out, agent switches or transport replacement. A configured endpoint is not live qualification.

**Focused gate:** `setup.test.ts`, `security.test.ts`, `runtime-scope.test.ts`, `app.test.ts`; add expired-token, A→B→A switching, foreign session and reconnect-generation tests. Single-owner release remains explicit; neither an owner ID nor these checks certifies multi-user tenancy. Complete the mandatory checkpoint.

## FE02 Replace conversation history and navigation

**Depends on:** FE01; BE02. **Targets:** `App.tsx`, `ThreadList.tsx`, `ChatTranscript.tsx`, new conversation repository/projection hooks; `Platform` and `PageService` coordination.

Replace `CopilotKitProvider`, `useThreads` and hosted connection state with the new server-owned conversation API. Preserve create/select, names, specialist attribution, recent conversations and load-more. Paginate the authoritative list: the existing view renders local rows while only fetching more remote metadata, which is not sufficient pagination parity.

Rehydrate durable transcript history, reconcile stable message identities and display interruption/truncation honestly. Keep internal voice-receipt markers out of ordinary chat, retain call placement by anchor message ID, and preserve Markdown/page links. Optimistic rows reconcile to accepted records rather than duplicating them after refresh.

**Focused gate:** `transcript.test.tsx`, `workspace.test.ts`, page-service tests; add empty session persistence, pagination boundaries, rename/reload, compression lineage, archived/history behavior and process-restart recovery. Prove history works without Intelligence credentials or network calls. Complete the mandatory checkpoint.

## FE03 Replace live chat and command submission

**Depends on:** FE02; BE03. **Targets:** `Chat.tsx`, `page-context.ts`, `page-chat-requests.ts`, transcript tool rendering and new transport/projection modules.

Keep composer, initial prompt consumption, source URL input, progress, tool cards, auto-scroll and retry feedback. Submit intent with a persisted operation identity; never send client-authored assistant/tool history as authority. Preserve unsent text when admission fails or is uncertain. Reuse the original ID for inspecting/retrying the same intent; changed text creates new intent.

Reconcile live text and tool presentation against authoritative history. Apply durable status events monotonically; `snapshot_required` replaces only its matching projection before continuation. Stream interruption, subscription cleanup and the old 90-second wait cannot silently cancel accepted missions. Explicit Stop awaits cancellation evidence.

Preserve page-context readiness and generation guards so late setup cannot send on the wrong page or specialist.

**Focused gate:** `headless.test.ts`, `headless-runtime.test.ts`, `page-context.test.ts`, `page-chat-request.test.ts`, existing agent fixtures plus command dedup, gap, slow consumer, lost receipt, no-response and disconnect-after-admission cases. Complete the mandatory checkpoint.

## FE04 Project durable work and exact reviews

**Depends on:** FE03; BE04. **Targets:** `TaskActions.tsx`, `TaskPresentation.tsx`, `App.tsx`, `PageReviewCard.tsx`, `page-review-decision.ts`, `ResultPane.tsx`.

Replace SQLite task statuses with mission projections without collapsing ready-to-review, partial completion, waiting, failed delivery or unresolved effects into “completed.” Preserve task search, details, event history and saved runs. Controls explicitly distinguish resume, new run, delivery retry, pause and cancellation; “Retry task” must not blindly repeat external work.

Render exact pending approvals with action target, content/revision digest, expiry and scope. Submit the canonical review operation, then recover its receipt before retrying. Historical tool results and page-save receipts remain evidence, not reusable grants. Changed content, transport generation or revoked authority invalidates the decision.

Make global Pause semantics explicit with BE04; show requested versus acknowledged state and accepted work that continues.

**Focused gate:** `controls.test.tsx`, `page-review.test.tsx`, `runner.test.ts`, `shutdown.test.ts`; add expired/conflicting review, duplicate click, lost decision receipt, uncertain cancellation and independent delivery recovery. Complete the mandatory checkpoint.

## FE05 Preserve Spaces pages and verified artifacts

**Depends on:** FE04; BE05. **Targets:** `SpaceWorkspace.tsx`, `SpaceNav.tsx`, `SpaceLibrary.tsx`, `PageDocument.tsx`, `PageOutline.tsx`, `PageConversation.tsx`, `editor/*`, page snapshots/navigation/review helpers.

Retain hierarchical pages, library search/sort/grid/list, title editing, rich/source modes, supported formatting, slash commands, outline, autosave, save status and dirty-draft navigation protection. Include Move page, New subpage, Download Markdown/draft, Load latest, Open source conversation and keyboard Save. Preserve unsupported-Markdown source fallback; never silently strip HTML, images, front matter or extended syntax on conversion. Save-to-page uses persisted eligible transcript text and the correct authorized destination.

Declare one page-byte authority and map immutable versions to artifact references. Use expected revisions, recover committed saves after lost responses, and display conflicts while retaining user edits. Preserve one concurrent-safe conversation per page/specialist, permission rechecks and page-context links.

Verify complete bytes, digest, MIME/size and authorized retrieval before “ready.” Preview sandboxing, publication approval and audience grants remain independent.

**Focused gate:** pages/page-routes/page-service, autosave, Markdown, library, page-snapshots and review suites; add stale user/model edit, duplicate commit, inaccessible artifact, wrong-page late response and Back/Forward interruption. Complete the mandatory checkpoint.

## FE06 Scope specialists memory and Learning

**Depends on:** FE05; BE06. **Targets:** `WorkspaceDialog.tsx`, `App.tsx`, specialist selectors, `WorkspaceState`/`Dot`/`Memory` DTOs; `workspace.ts`, `learning.ts` coordination.

Preserve create/edit specialist name, instructions, research permission, memory choice, allowed Spaces and default save destination. Resolve stable specialist IDs and explicitly granted projects server-side. Default destination is not ownership. Show effective capability changes without rewriting already accepted work.

Replace the global memory list with explicit owner/agent/backend views. Ryoko alone uses the external personal harness; specialists use isolated built-in memory. Mutation/export/delete controls appear only where the actual backend supports them. Harness outage cannot redirect writes to another store.

Replace Intelligence Learning enrollment and delivery UI with Ryoko-owned reviewed workflow/skill lifecycle: evidence, immutable draft, evaluation, approval, publication, delivery and rollback. Keep migrated enrollment frozen until separately reconciled; simply disabling Learning does not satisfy final parity.

**Focused gate:** workspace, learning and learning-delivery suites; cross-specialist leakage, grant revocation, unavailable harness mutation, copied specialist and reviewed workflow version rollback. Complete the mandatory checkpoint.

## FE07 Present schedules and notification delivery

**Depends on:** FE04 and FE06; BE07. **Targets:** schedule forms in `WorkspaceDialog.tsx`/`App.tsx`, `TaskActions.tsx`, `TaskPresentation.tsx` and notification presentation.

Preserve conversation-based schedule creation, interval display, edit, run-now, pause/resume/cancel and occurrence history. Replace ambiguous seconds-only forms with explicit timezone, next occurrence, missed-run/overlap policy and bounded authority. Show imported schedules as paused or awaiting reconciliation until migration succeeds.

Use exact schedule revisions and occurrence IDs. Keep schedule activation separate from authorization to produce or publish outputs. Review retained scheduled drafts without rerunning them. Notification/delivery retry cannot create another occurrence or repeat the mission.

Display held, queued, delivered, failed and unknown notices accurately. Acknowledge complete validated bytes and actual rendered text as required; never label a transport receipt as human-read evidence.

**Focused gate:** store/runner/controls suites and new schedule fixtures: DST, timezone, restart, double activation, concurrent edit, revoked grant, missed occurrence, overlap and output-review recovery. Complete the mandatory checkpoint.

## FE08 Retain computer and research surfaces

**Depends on:** FE04–FE06; BE08. **Targets:** `ComputerPanel.tsx`, `ComputerToolCard.tsx`, `ResultPane.tsx`, `Chat.tsx`, shared computer types.

Preserve per-Dot computer start/stop, permission controls, take/release, Browser/Files/Terminal/Activity tabs, screenshots and inline tool cards. Display actual executor identity, freshness, capability and takeover status. Human control and emergency stop must survive a stalled agent; resumption requires fresh state.

Route agent and user-initiated consequential actions through the approved broker paths. Show prepared/dispatched/unknown/reconciled outcomes and receipt correlations. A fetch exception cannot certify non-execution. Avoid background screenshot storms and preserve lifecycle guards on Dot changes and hidden tabs.

Retain grounded research sources, excerpts, screenshots and sample/live distinction. Preserve read-only browser DNS/redirect/size protections; do not claim open-ended search from the existing single-URL workflow.

**Focused gate:** computer, computer-card, computer-deployment, research, transport and security suites; takeover race, stale screenshot, executor restart, permission revocation and lost effect response. Live browser/shell acceptance remains separate. Complete the mandatory checkpoint.

## FE09 Preserve calls with explicit media capabilities

**Depends on:** FE03–FE04; BE09. **Targets:** `useVoice.ts`, `CallView.tsx`, `ChatTranscript.tsx`, shared call/receipt types and `Chat.tsx`.

Preserve call start/end, connecting/active/ending states, captions, speaking/thinking indicators, duration, microphone and speaker mute, minimized display and transcript receipt placement. Select only configured, disclosed media adapters. Keep browser microphone consent, cleanup, audio capture and credentials boundaries explicit.

The current Hermes local Whisper/Piper adapter is finite and nonstreaming; it does not prove parity with Dots Realtime calls. BE09 must qualify an appropriate real-time provider adapter or clearly expose the alternate interaction mode. Full-capability cutover stays blocked if existing call behavior is silently removed.

Deduplicate compute requests durably; distinguish hangup, speech stop, discarded capture and mission cancel. Preserve accepted work and call receipts through reconnect, browser exit and server restart. Unknown media debt is inspect-only, not automatic replay.

**Focused gate:** voice/transcript/headless suites; denied microphone, reconnect, repeated hangup, mute, late compute completion, receipt sync failure and device switching. Qualify actual audio hardware/provider separately. Complete the mandatory checkpoint.

## FE10 Unify Slack and cross-surface continuity

**Depends on:** FE03–FE06; BE10. **Targets:** setup/status controls, conversation provenance, delivery/review links; `slack-channel.ts`, `Platform` and headless coordination.

Replace managed Channels/Intelligence transport with the authorized self-hosted ingress/egress adapter. Preserve team/human-user allowlists, created-message filtering, thread continuity, paused notices and safe error redaction. Never trust display names or a claimed owner ID. Stable verified provider event IDs feed admission deduplication.

Show cross-surface origin and mission state without importing private specialist memory. Slack retries and simultaneous web/voice actions obey the same ownership policy. Use authenticated web review links where Slack cannot securely show exact content. Delivery failures retain the successful work and offer a delivery-only repair.

**Focused gate:** `slack-channel.test.ts`, `slack-channel-wiring.test.ts`, `dot-agent-channel.test.ts`, runtime-scope tests; duplicate events, bot/foreign actor, revoked channel mapping, changed-message handling and lost send acknowledgment. Local channel binding is not external Slack qualification. Complete the mandatory checkpoint.

## FE11 Migrate safely and package self-hosting

**Depends on:** FE00–FE10; BE11. **Targets:** setup, migration/read-only notices, all transport providers; `.env.example`, README/setup docs, Compose/Docker coordination.

Show migration inventory and disposition for conversations, page links, reviews, call receipts, specialist bindings, legacy memory, Learning and schedules. Preserve old history read-only where import fidelity is incomplete. Never translate an old approval into fresh permission or silently backfill an uncertain schedule.

Expose server-controlled sticky `runtime_owner` and recoverable migration status. Rollback stops new admissions; accepted Hermes work stays Hermes-owned. Preserve pending writes, immutable artifact versions and unresolved effects when reverting presentation code.

Package a deployment that starts, reconnects and restores without Intelligence credentials, URLs or managed Channels. Remove unused frontend/runtime packages only after import and transitive-dependency review. Replace the hosted WebSocket CSP origin in `index.ts` with the explicitly configured self-hosted transport; preserve same-origin and whole-route checks. External provider choices remain explicit optional configuration.

**Focused gate:** clean install, no-Intelligence-network startup, restore/import fixtures, double migration, rollback after accepted command, old-link compatibility and unsupported configuration tests. No migration, credential creation or deployment follows from this plan alone. Complete the mandatory checkpoint.

## FE12 Qualify end to end and request cutover

**Depends on:** FE00–FE11; BE12. Run consolidated acceptance against the exact producer/consumer pair. Preserve feature evidence even when an optional provider is absent: mark it unqualified and keep full-parity cutover blocked until qualified or explicitly descoped by the user.

Run the repository's Node 24 workflow: `npm ci`, `npm run check-format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Add generated-schema freshness, cross-repository compatibility and fault-injection suites. Focused passes do not replace these final checks; failures, skips and not-run platforms remain visible.

Exercise web chat→research→page review/edit, specialist isolation, schedule→restart→notification, computer takeover/effect recovery, voice→compute→hangup, Slack→web review→delivery recovery, and migration→rollback. Repeat with disconnect before/after admission, process death, cursor expiry, stale approval and revoked access.

Inspect actual browser layouts, keyboard/focus, screen-reader labels, narrow screens, long content, repeated actions, cancel/dismiss, unsaved navigation and Back/Forward. Record provider behavior, review/cleanup effort, latency and cost. Verify authorized remote commits and CI separately. Request explicit deployment/cutover approval after the mandatory checkpoint; never infer it from test success.

## Readiness matrix and release evidence

| Area | Observed starting point | Required release evidence |
| --- | --- | --- |
| Conversations | Intelligence owns durable threads | Ryoko-owned list/history/live reconciliation and restart, without Intelligence |
| Runtime | Producer-only FE14 and redacted journal APIs | Exact consumer contract receipts; service/human ownership and replay proof |
| Pages | Rich/source editor, CAS saves, review receipts | Equivalent UX, single byte authority, immutable artifacts and conflict recovery |
| Memory/Learning | Global preferences and managed Learning | Scoped backends; supported personal-harness actions; reviewed self-hosted workflow lifecycle |
| Schedules | Local runner and interval leases | One imported owner, durable occurrences, explicit grants and independent delivery |
| Computers | OpenBot UI and isolation exist | Broker/effect correlation, takeover, real configured executor qualification |
| Voice | Realtime calls demonstrated historically | Qualified retained call capability; local nonstreaming mode labelled separately |
| Slack | Existing SDK path; live verification incomplete | Self-hosted real ingress/egress, allowlists, dedup and delivery evidence |
| Deployment | Single-owner application | Backup/restore/rollback drill, no hosted-control-plane requirement; no multi-user claim |
| Quality | Existing fixture tests; producer host/native/browser gates open | Exact-source aggregate checks plus real browser/provider/hardware evidence |

Each release receipt records source SHAs, schema hashes, fixtures, environment, expected/observed results, authority checks, artifacts, execution/delivery state, unresolved failures and cleanup. Screenshots establish layout only. Historical demonstrations and producer test counts cannot certify this integration. Native Electron, multi-user hosting, broad team coordination and LAYA promotion remain outside any implied Dots qualification.

## Source references

Consumer paths above are relative to the pinned [Dots source](https://github.com/TianJieHeng/ryoko-dots/tree/b01ac1f6a903e5e56c119d960901353ac0a3d171). Producer claims come from the inspected Hermes checkout's `apps/shared/src/gateway-contract.generated.ts`, `gateway-contract.openrpc.json`, `tui_gateway/methods_runtime.py`, and `hermes_cli/web_routers/chat_ws.py`. Consult `docs/build/frontend-adapter-handoff.md`, `frontend-release-scope.md`, `backend-current-scope.md` and `release-manifest.json` together: their local receipts preserve host-blocked, native, browser, live-provider and separate-consumer gates. Refresh these pins at implementation; do not turn historical candidate hashes into present qualification.
