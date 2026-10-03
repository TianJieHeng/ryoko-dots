# Ryoko Dots — Backend Build Plan

## Status, decision and baseline

**Planning only · 3 October 2026.** No phase is implemented or accepted by publishing this plan. The owner selected a fully self-hosted Ryoko-owned conversation/control plane and full eventual coverage of the existing Dots experience. Implement phases in order of dependency; full scope does not require simultaneous channel activation. Follow [FrontEnd_BuildPlan.md](FrontEnd_BuildPlan.md) alongside this plan.

This decision supersedes the option in [Integration_Handoff.md](Integration_Handoff.md) to retain CopilotKit Intelligence as durable history owner. Preserve that handoff as historical architecture/security context; do not silently treat its proposed operations as shipped APIs. Open-source UI/AG-UI libraries may remain where useful without Intelligence. Self-hosted control-plane ownership does **not** require removing optional external model, speech, search or SaaS providers; each remains explicitly configured and governed by Ryoko policy.

Source baseline:

- Dots application at `b01ac1f6a903e5e56c119d960901353ac0a3d171`; handoff at `7a864901ace37fd7acfb3fa43d145777809f9f30`; empty plan checkpoint `88ee710e1b7566927c221ab2b03098382736893f`
- Published Ryoko producer `124931a916c8aa6beeaf60d08dd55ca5d20f6e3c`; FE14 contract candidate `b323e73f7b2f6792c57341240e206a72e43e3192`
- Generated `apps/shared/src/gateway-contract.generated.ts` SHA256 `73f089aeca65cbc1e90c8a54da0f7d11c144fc160e8d8cc99e28043e9eef1839`; OpenRPC companion SHA256 `1d3151320c621de5b7032a4e5fb4ba170fe09fa5400fd762df832bca09622909`. Verified in the published producer; re-pin if it changes
- Authoritative producer references: [FE14 handoff](https://github.com/TianJieHeng/ryoko-agent/blob/124931a916c8aa6beeaf60d08dd55ca5d20f6e3c/docs/build/frontend-adapter-handoff.md), [generated wire](https://github.com/TianJieHeng/ryoko-agent/blob/124931a916c8aa6beeaf60d08dd55ca5d20f6e3c/apps/shared/src/gateway-contract.generated.ts), [runtime handlers](https://github.com/TianJieHeng/ryoko-agent/blob/124931a916c8aa6beeaf60d08dd55ca5d20f6e3c/tui_gateway/methods_runtime.py), [surface limits](https://github.com/TianJieHeng/ryoko-agent/blob/124931a916c8aa6beeaf60d08dd55ca5d20f6e3c/docs/build/frontend-release-scope.md)

Producer-only fixtures are not consumer compatibility evidence. Current Ryoko code has implementation and qualification limits; do not call Dots production-ready while required producer gates remain open.

## 1. Architecture and ownership

```text
Web / page chat / voice / Slack
  -> authenticated Dots ingress + durable surface mappings
  -> bounded Ryoko transport adapter (commands, projections, receipts)
  -> one Ryoko execution/session/policy/memory/schedule authority
  -> safe durable events + canonical transcript/artifact reads
  -> self-hosted Dots read projections and channel delivery adapters
```

| Concern | Authoritative owner | Dots responsibility |
|---|---|---|
| Principal/profile/agent/session identity, capabilities, grants | Authenticated Ryoko binding and policy | Authenticate owner/surface, persist verified mappings; reject client-selected authority |
| Planning, inference, tools, specialist execution, missions | Ryoko | Submit bounded commands; no TanStack/BuiltInAgent execution fallback |
| Transcript and accepted input | Ryoko-owned self-hosted conversation subsystem | Durable read projection/search/navigation; explicit canonical IDs and sync contract |
| Mission/effect/approval/delivery truth | Ryoko journals and broker | Display/forward exact receipts; do not derive completion from an HTTP 200 |
| Workspace/Space navigation, UI preferences | Dots SQLite | Local metadata with revisions, authenticated ownership and backup |
| Native page bytes | Initially retained Dots page store, registered as a Ryoko artifact store | Revision-checked executor under Ryoko effect identity; user edits remain explicit user operations |
| Other artifact bytes | Declared store per artifact | Versioned metadata, authorized streaming/download, no second canonical head |
| Scheduling/monitor occurrence ownership | Ryoko | Configuration/display and one-time legacy import only |
| Personal memory | Primary Ryoko external harness only | Scoped status/controls supported by actual contract, no credential exposure |
| Persistent specialist memory | Each specialist's isolated Ryoko built-in memory | Stable identities, scoped projections; sharing project artifacts does not share private memory |
| Voice media / Slack / computers | Configured authorized provider/executor | Surface-specific ingress, durable outbox/receipts and policy-bound execution |

Recommended initial deployment: single owner, Node 24 Dots gateway and separate Python Ryoko service on one trusted host/private network; SQLite WAL per service, scoped local artifact storage, TLS reverse proxy for remote access. Deployment host and provider choices are configurable. Docker/Compose is an existing packaging option, not a requirement: support a documented native Node/Python service-supervisor path (for example systemd on Linux) if that matches the selected host, with equivalent process isolation, private networking, secret handling, backups and readiness checks. Do not assume a Docker daemon is installed or choose the user's deployment host implicitly. Do not introduce PostgreSQL, queues or multi-user tenancy without measured need. Single-owner hardening is required; it is not multi-user certification.

## 2. Existing capability disposition

| Existing source/capability | Required outcome |
|---|---|
| `platform.ts`, `dot-agent.ts`, `headless.ts`, `tanstack-tools.ts`, `research.ts` | Replace Intelligence and inner model/tool orchestration with Ryoko adapter; keep useful safe projection/rendering, never leave another execution path |
| `App.tsx`, `Chat.tsx`, `ThreadList.tsx` and `platform.ts` thread create/history | Self-hosted canonical conversation create/list/history/search/rename/archive contract; preserve IDs/link redirects and ordered messages |
| `store.ts`, `runner.ts`, task API | Replace execution/schedules with Ryoko projections; retain legacy read-only history and explicit migration receipts |
| `workspace.ts`, workspace routes, Dot/Space grants | Preserve editable identities/default destination/authorized Spaces; add verified Ryoko mappings and revisions |
| `pages.ts`, page service/routes/tools and page-context binding | Preserve editor/autosave, review receipts, page conversations, snapshots, outlines and links; register one artifact authority |
| `learning.ts`, learning settings and published skills | Replace Intelligence-specific routing. Preserve explicit enrollment/delivery intent in migration records; only re-enable supported Ryoko-scoped evidence/skill contracts after privacy review |
| Global `memories` table and memory settings | Inventory; never inject into all agents. Explicit selected migration destination or read-only legacy archive |
| `voice.ts`, call receipt/compute route | Self-hosted call/control records with configured media provider; durable compute deduplication, independent media/work lifetimes |
| `slack-channel.ts`, managed Channels connection | Replace managed Intelligence channel dependency with a qualified self-hosted Slack adapter path |
| Computer service/store/routes/tools, browser service and deployment/computers | Preserve isolation/permissions/takeover/read-only browsing where configured; bind effects and unknown outcomes to Ryoko |
| Setup/settings/auth/shutdown/Compose | Replace vendor-required readiness with independent capability health; preserve fail-closed security and clean restart |

Deferred breadth must remain explicitly unavailable, not disappear silently: multi-user collaboration, broad team orchestration beyond qualified specialist contracts, unsupported personal-harness mutation, streaming speech without a qualified adapter, new file formats/media generation, and LAYA training/activation. Existing supported behavior must receive a retained, replaced or clearly disabled migration outcome.

## 3. Contract rules and producer coordination

### Existing transport is real; parity is unproven

Ryoko has an aiohttp API server (`gateway/platforms/api_server.py`) with `/v1/chat/completions`, `/v1/responses`, `/api/sessions`, `/v1/runs`, events, approval, steer and stop paths. It also has authenticated `/api/ws` in `hermes_cli/web_routers/chat_ws.py`, dispatching newline-delimited JSON-RPC through `tui_gateway/ws.py`, and stdio transport. The FE14 wire contract targets the latter runtime RPC family. Select and qualify one owning transport in BE00; do not invent a new server merely because Dots needs an adapter, or assume the HTTP run API has identical durable semantics.

`runtime.capabilities`, `runtime.snapshot`, `runtime.events.since`, `runtime.command` exist. In the inspected producer, runtime command operations are `submit`, `steer`, `cancel`; generic `approval` is rejected and exact durable approvals use `runtime.approval.resolve`. Discover availability and use generated types. Durable journal event replay is **not** a complete assistant-token/transcript replay API. Transport ownership is checked against the live session; same-account access does not automatically permit another session.

### Proposed Dots consumer contract (new work, not existing endpoints)

Freeze a versioned schema in `src/shared/runtime/` and contract fixtures in `tests/fixtures/runtime/`; these paths are proposed. A same-origin `/api/runtime/...` family may expose:

- Health/capabilities and authenticated binding status
- Conversations create/list/detail/rename/archive/history/search and resumable surface events
- Command submit/receipt lookup; mission/status/detail; exact approval detail/decision; cancellation and delivery recovery
- Artifacts metadata/content/expected-version edit; schedules; specialist status; scoped memory capability status
- Channel/executor/media health and control where negotiated

Each mutation carries a stable client operation ID, canonical intent digest, authorized binding and expected revision where applicable. Derive principal from authentication, never browser JSON. Server resolves live/durable session identity, profile, agent and runtime generation; browsers cannot supply a replacement principal, grants, credentials or transport lease. A conversation may contain multiple missions; names, Dot IDs, conversation IDs, sessions, run IDs and mission IDs are distinct.

Persist ingress operation identity before external submission. A lost response enters `outcome_unknown`; recover the original receipt/status before any retry. Identical retry preserves ID and bytes; conflicting bytes return a conflict. Use durable uniqueness constraints, not an in-memory map. Project event+cursor atomically, deduplicate by authoritative identity/sequence, reject foreign session/generation, detect gaps, and apply authoritative snapshot before replay when required. Bound message size, queues and replay pages; support cancellation of reads without cancelling work.

### Producer gaps to resolve in Ryoko, not fake in Dots

1. Qualify the exact server-to-server authentication, human/surface provenance, session creation/rebind and restart-resume path. Existing local authenticated gateway transport is not proof of external Dots service identity support
2. Establish canonical transcript persistence, stable message IDs, tool/message reconciliation and durable history query/export across compression, restart and scopes. If existing APIs cannot provide it, add a versioned producer contract before building a competing transcript owner
3. Confirm each proposed channel/artifact/executor operation has a real policy-bound producer implementation; add missing declarations/handlers/tests in `ryoko-agent` through coordinated work
4. Confirm durable acceptance/recovery and complete approval payload/display contract, not merely method presence. Check effect, artifact, delivery and schedule capabilities separately
5. Record published producer changes and regenerated schema hashes as dependencies. This Dots plan does not authorize pretending those changes already exist or bypassing producer release gates

## 4. Phase execution protocol (mandatory for every BE phase)

Each phase has four deliverables: implementation, focused regression tests, evidence, and a checkpoint. A phase is complete only after all four. Coordinate with its FE phase; contract stubs remain visibly test-only.

1. Read current source, `Integration_Handoff.md`, both plans and applicable repo instructions. Recheck producer version/capabilities and dirty worktrees; never overwrite unrelated work
2. At implementation start, create one root `BuildJournal.md` for **this repository**, shared by BE/FE work. Do not edit the agent repo's separate journal or create competing per-phase journals. Record phase objective, dependencies and baseline
3. Implement one reviewable slice; run listed focused tests plus affected type/lint checks. Record exact commands, passed/failed/not-run results, source hashes/commits, runtime/OS/toolchain, fixtures and cleanup, and open gates. Do not commit secrets, private histories, databases or raw sensitive logs
4. Inspect diff and commit with phase identifier. Under explicit implementation/publication authorization, push to the agreed branch and verify exact remote SHA and CI. This planning request authorizes publication of these plans only; it does not itself authorize later app implementation/deployment
5. Update the shared journal in the same checkpoint (record the resulting SHA in the next entry/receipt rather than creating a self-referential hash). Give the owner a concise outcome, remaining limits and next phase; require decisions/approval for changed scope, persistent credentials, new sharing or deployment actions where applicable
6. Stop dependent work on an unresolved authority/data-loss blocker. Continue independent safe phases only with explicit blocked status. No green phase based on mocks alone when its exit requires live/host evidence

## 5. Dependency-ordered backend phases

### BE00 — Pin contracts and prove read-only transport

**Depends on:** reviewed plans. **Targets:** new runtime adapter/contracts/fixtures; `platform-config.ts`; producer wire and `runtime-control.ts` as references. **Pairs:** FE00–FE01.

- Inventory every web/page/voice/Slack/headless/task ingress and existing test. Record current behavior and migration disposition, including learned skills and read-only browser fallback
- Import/generate only qualified schema types with provenance; never manually invent compatibility types. Record schema hashes and required operation capability matrix
- Create a read-only adapter against an isolated synthetic Ryoko home. Establish authenticated owner binding, capabilities, snapshot and ordered event replay; distinguish live transport ID from durable lineage
- Prove restart/resubscribe behavior before selecting WS vs HTTP. If service-to-human binding is unsupported, coordinate the producer change; no shared master credential in a browser or client-chosen identity

**Checks/exit:** valid/invalid schema, incompatible version, unavailable runtime, same-account other-session denial, A→B→A stale response, cursor expiry/gap/duplicate/foreign generation, slow consumer, connection loss. Record exact producer+consumer commits. OD00 is passed only by executed consumer proof, not by importing TypeScript.

### BE01 — Self-hosted authentication and scoped bindings

**Depends on:** BE00. **Targets:** `app.ts`, `index.ts`, `runtime-scope.ts`, `workspace.ts`, workspace routes, config, `SECURITY.md`. **Pairs:** FE01.

- Retain single-owner boundary initially. Replace browser-held broad service credentials with a server-managed authenticated session design; recommended HttpOnly/Secure/SameSite cookies plus CSRF protection, with explicitly scoped API credentials for machine ingress
- Keep loopback defaults, exact origin/host checks, body limits, timing-safe credential verification, TLS requirements and rate limits. Define logout/session expiry/revocation, proxy trust, WebSocket ticket origin validation and log redaction
- Persist unique owner/profile/agent/conversation/runtime mappings with revisions. Verify Dot/Space grants on all reads, writes, event subscriptions and downloads. Ensure renaming an agent never changes its privilege class
- Store secrets server-side in deployment secret facilities; define rotation and restart behavior. Credential creation/permission changes require their separate authorization

**Checks/exit:** cross-origin/CSRF, host spoofing, expired/revoked auth, unauthorized object IDs, forged profile/agent fields, subscription scope leakage, archive/delete access and remote bind without secure setup. Existing `security.test.ts` and `runtime-scope.test.ts` regressions remain covered.

### BE02 — Replace Intelligence conversation ownership

**Depends on:** BE00–01 and canonical producer transcript proof. **Targets:** `platform.ts`, `page-service.ts`, `headless.ts`, workspace storage/routes; new conversation projection/outbox modules. **Pairs:** FE02–FE03.

- Build Ryoko-owned conversation lifecycle with stable IDs, ordered canonical messages, source/channel provenance, pagination, search, rename/archive and retained history. Dots stores indexes/projections and surface links, not independent inference truth
- Specify accepted input vs pending draft vs canonical committed message; reconcile user/assistant/tool messages after reconnect without duplication. Persist command-to-message/run/mission mappings and immutable message revisions where edits are supported
- Preserve page-conversation reservation/recovery and one page-plus-specialist binding under concurrent creation, including unknown create outcomes. Preserve call anchor message IDs and hidden internal voice-receipt semantics in history migration
- Remove creation/history/readiness dependency on `INTELLIGENCE_API_KEY`; remove Intelligence-based generated thread names or replace through an explicitly supported Ryoko operation with deterministic fallback title
- Replace `Platform.history`, `createConversation`, headless `IntelligenceAgent`, thread resume and page conversation creation. Provide export/restore and bounded history retention. Do not synthesize missing old history
- Keep optional AG-UI/CopilotKit rendering only after proving it can operate without managed Intelligence; select a local provider/adapter otherwise

**Checks/exit:** no Intelligence key/network required; create/send/reload/search/archive; pagination/order; duplicate ingestion; interrupted stream then final-message reconciliation; runtime/store restart; compression lineage; page-context and Slack/voice receipts remain correctly linked. Existing headless/page-service/workspace tests ported.

### BE03 — Single command adapter and lifecycle

**Depends on:** BE01–02. **Targets:** `dot-agent.ts`, `platform.ts`, `headless.ts`, `tanstack-tools.ts`, `research.ts`, new transport/ingress modules. **Pairs:** FE03–FE04.

- Replace `BuiltInAgent`, TanStack `chat`, model adapter, local tool execution and global-memory prompt injection with an AG-UI-compatible projection adapter or documented equivalent
- Route every accepted web/page/headless/channel input through the same authenticated command admission. Persist operation ID+digest and recover receipt on unknown submission outcome
- Map safe text/tool state without forwarding private prompts, raw traces, memory contents or credentials. Keep transcript streaming separate from mission-event projection; finalized transcript is canonical
- Retire inherited 90-second execution deadlines as mission lifetime. Request timeout/unsubscribe detaches; explicit cancel sends a durable command and awaits evidence. Never fall back to old DotAgent on provider failure
- Enforce capability gating and bounded queue/admission backpressure; reconnect does not resubmit input

**Checks/exit:** one input → one canonical command under repeated clicks/retries/process crash; byte-conflict rejection; no local model/tool path in Ryoko mode; long job survives refresh; cancel distinct from detach; unsupported operations fail closed. Replace `tanstack-agent`, `dot-agent-channel`, headless-runtime tests with equivalent boundary tests.

### BE04 — Missions, exact approvals, effects and delivery

**Depends on:** BE03 and qualified producer methods. **Targets:** task routes/store projections, page review route seam, new approval/mission/delivery services. **Pairs:** FE04–FE05.

- Expose mission state, checkpoints, next action, blockers, required outputs and unresolved effects from Ryoko snapshots. Keep accepted/executing/verified/artifact-committed/delivery-confirmed independent
- Use exact approval detail and `runtime.approval.resolve` according to generated schema. Bind decision to actor, session/generation, approval ID/revision, digest, target/content/version, expiry and live grants. Generic runtime command `approval` is not a supported shortcut
- Page review receipt remains a page-save receipt; it is not generic execution authority. Decisions must not perform a local write and then independently trigger a second Ryoko write
- Define global Pause as a runtime-authorized control with explicit new-admission, scheduled-occurrence and in-flight-work behavior; show requested versus acknowledged state and never silently drop accepted work. Revocation fences the next effect even if the browser is offline
- Persist delivery intent/receipt correlation. Retry delivery of immutable output without rerunning inference/effects. Unknown remote outcomes stay inspectable and require reconciliation
- Cancellation records requested/local stop/provider acknowledgment/uncertain in-flight effects separately; never imply rollback or trigger compensation without authority

**Checks/exit:** double approval, response lost, deny/expiry/revocation, changed bytes/recipient/version, simultaneous tabs, stale generation, effect timeout after dispatch, partial artifact, failed/unknown delivery and cancelled mission with unresolved effect. Journal exact receipt evidence.

### BE05 — Spaces, pages and artifact store adapter

**Depends on:** BE02–04. **Targets:** `pages.ts`, `page-service.ts`, `page-routes.ts`, `page-tools.ts`, `workspace.ts`; artifact registry/streaming adapter. **Pairs:** FE05.

- Keep Space list/default destination vs authorized Space grants distinct. Preserve page creation/edit/rename/archive, snapshots, page chat binding, autosave conflict handling and existing native editor semantics
- Register native page bytes as one declared artifact store. Retain immutable versions/digests and expected-revision compare-and-swap; map canonical head and source lineage. Define transaction/outbox recovery when Dots commits bytes but Ryoko receipt is delayed
- Agent page mutations execute only under one validated Ryoko effect/approval identity; manual owner edits remain revision-checked operations. Do not expose unrestricted legacy page tools to an independent loop
- Stream authorized downloads with MIME/size bounds, safe filenames and digest verification; sanitize rendered Markdown/HTML and block unsafe links/path traversal/SSRF. Preserve source captures/screenshots under scoped retention
- Map page review recovery `(threadId, toolCallId)` to canonical operation IDs without losing old receipts. Version conflicts offer explicit recovery, never last-write-wins overwrite

**Checks/exit:** concurrent autosave/review, new page double-submit, saved receipt lost, parent/Space grant revoked, stale page context, interrupted artifact download, digest mismatch, malicious page text, cross-Space access, backup restore and old links. Port pages/page-routes/page-service/library/page-context tests.

### BE06 — Agent identities, memory boundaries and skills

**Depends on:** BE01–04. **Targets:** workspace Dot settings, global memory routes, `learning.ts`, old learned-skill plumbing; Ryoko specialist/memory contracts. **Pairs:** FE06.

- Map configurable Dot display identities to stable Ryoko primary/specialist IDs; validate role/profile binding on server. Persistent specialists use isolated built-in namespaces; delegation passes explicit authorized task/project context only
- Disable legacy global preference injection. Inventory old memories and route only through an explicitly reviewed supported destination; never fan them out to all agents or silently fall back from personal harness to local memory
- Show primary harness as unconfigured/unavailable when actual contract is missing. Implement mutation/export/delete only where real harness capability and authorization exist; built-in controls do not certify personal-harness erasure
- Replace Intelligence learning containers with a self-hosted scoped evidence and reviewed skill/workflow lifecycle. Implement evidence selection/provenance, immutable draft versions, deterministic evaluation receipts, explicit accept/decline, publication, version-pinned skill delivery and rollback through actual Ryoko contracts; coordinate missing producer operations before claiming parity. Preserve frozen conversation enrollment and opt-in state as migration evidence; no automatic enrollment of personal memory or private transcripts. Merely hiding Learning is acceptable during staged rollout, not full-scope completion
- Named specialist handoff/status is included. Broader teams/budgets/synthesis remain unavailable until producer contract and qualification exist

**Checks/exit:** primary→specialist and specialist↔specialist leakage, rename/copy privilege escalation, project sharing without memory sharing, revoked scope, harness outage, supported correction/delete receipts, frozen enrollment and skill version rollback. Port learning tests rather than silently deleting coverage.

### BE07 — Schedules, monitors and background tasks

**Depends on:** BE03–04. **Targets:** `runner.ts`, `store.ts`, `/api/tasks` mutations, `index.ts` startup; migration tools. **Pairs:** FE07.

- Retire Dots' local execution timer/leases for migrated jobs; exactly one Ryoko scheduler owns each imported schedule and occurrence
- Map prompt, timezone, recurrence, pause/cancel/run-now, bounded standing authorization, overlap/missed-run policy and next eligible run to real runtime contracts. One-time jobs and task history remain inspectable
- Import with stable legacy schedule+occurrence IDs and durable receipts. Stop legacy new admissions, reconcile active claims, then switch ownership without overlapping execution
- Separate schedule pause from running mission cancellation; server restart/offline intervals cannot manufacture catch-up actions beyond configured policy

**Checks/exit:** DST/timezone boundaries, duplicate import, simultaneous old/new runner, restart during occurrence admission, missed run, pause vs cancel, run-now deduplication and output delivery failure. Replace runner/store task tests with projection+migration+scheduler contract tests.

### BE08 — Computer and browser executor integration

**Depends on:** BE04–06. **Targets:** computer service/store/routes/tools, browser `security.ts`/`transport.ts`, `deployment/computers`, Compose overlays. **Pairs:** FE08.

- Preserve per-Dot container/credential isolation, enabled/browser/files/shell permissions, human takeover and fresh snapshot requirement before resumed control
- Register one actual computer executor behind Ryoko policy/effect dispatch. Agent-origin actions must not bypass broker through old routes. Owner direct actions are explicitly authenticated, recorded and scoped
- Add unknown/reconciliation-required outcome to audit model where transport failure may follow execution; attach effect/operation/agent/session IDs and redacted evidence. Retry shell/browser writes only after idempotency/reconciliation proof
- Keep canonical-public-page reader restrictions, redirect/private network protections and optional fallback capability when computers are not configured. Enforce isolation against SSRF/DNS rebinding/container escape and redact reflected secrets
- Qualify advertised browser/files/shell capabilities against real supervisor and target host. Missing executor is unavailable, never a simulated success

**Checks/exit:** takeover races, permissions revoked mid-action, stale snapshot, wrong container/bot, secret reflection, bounded response, lost write response, restart/persistent files, sandbox and network controls. Port computer, deployment, transport and research security tests; real executor smoke remains a separate required gate.

### BE09 — Voice and call-to-compute lifecycle

**Depends on:** BE02–04, BE06; BE08 only for computer delegation. **Targets:** `voice.ts`, voice routes, call store, media adapter configuration. **Pairs:** FE09.

- Own call records/transcripts/receipts locally; remove Intelligence sync and `Platform.turn` dependency. Choose qualified local STT/TTS or explicit optional provider adapter without changing control-plane authority
- Persist compute tool-call/operation deduplication across restart; bind call/speaker/session and permitted delegation scope. Untrusted transcript never becomes approval authority
- Keep microphone capture, speech playback stop, discard audio, hangup, compute detach and mission cancellation separate. Clearly mark call-scoped work; durable accepted missions continue unless explicitly cancelled
- Use short-lived scoped media credentials where supported, bounded duration/cost/concurrency and explicit provider error states; never silently route to another provider. Do not activate or download models as a side effect of setup
- Replace call-summary sync with canonical call receipt and separately admitted summary where required. Handle late transcript and out-of-order events without duplicate messages

**Checks/exit:** microphone denied, missing local model/provider, dropped call, duplicate compute call, restart, hangup during long mission, transcript arrives late, pending receipt, budget exhaustion and unknown synthesis outcome. Port `voice.test.ts`; qualify actual browser microphone/playback and selected provider. Nonstreaming producer speech is not streaming speech support.

### BE10 — Self-hosted Slack ingress and delivery

**Depends on:** BE01–04, BE06; BE07 for scheduled Slack delivery. **Targets:** `slack-channel.ts`, `platform.ts`, config/setup, channel mapping/outbox modules. **Pairs:** FE10.

- Replace Intelligence-managed Slack dependency using an actual supported Ryoko Slack adapter or a thin self-hosted signed-events/Socket Mode adapter; choose one authoritative ingress and sender per installation, never run both in parallel
- Validate Slack event signature/timestamp/replay or authenticated Socket Mode envelope; verify workspace/channel/user/thread mappings and allowlists. Bot events, edits and unsupported event families get explicit handling rules
- Deduplicate provider event IDs before command admission; map Slack threads to canonical conversations and preserve message provenance/order. Apply shared per-session ownership across web/voice/Slack, not merely per-channel serial execution
- Deliver from durable immutable outbox records with rate-limit/backoff, actual provider receipt and unknown-outcome recovery. Channel reply scope never grants unrelated sharing
- Link unsupported approvals to the authenticated exact-action review surface; reactions/free text are not generic approval tokens. Preserve links/citations and safe artifact authorization

**Checks/exit:** wrong team/user, spoofed/replayed events, duplicate retry, bot loop, concurrent surfaces, unthreaded/threaded reply mapping, revoked channel access, throttling, send accepted/response lost, private artifact link access and disconnected adapter. Port Slack wiring/channel tests; connected workspace end-to-end verification is mandatory before enabling.

### BE11 — Migration, deployment, privacy and operations

**Depends on:** BE02–10 for full cutover; dry-run tools can start earlier. **Targets:** `Dockerfile`, Compose files, `index.ts`, shutdown/config, `.env.example`, README/setup/security docs; new migration/health/backup tools. **Pairs:** FE01, FE11.

- Produce dry-run inventory of SQLite, Intelligence history/export access, page versions, thread/task/call mappings, global preferences, learning settings and computer identities. Export historical Intelligence records only with available authorized access; record missing/partial exports, never claim SQLite backup contains old conversations
- Import into self-hosted canonical/projection stores with stable IDs, provenance, counts/digests, recoverable batches and quarantine conflicts. Never replay historic tool calls/approvals/effects. Keep legacy archives readable and rollback-safe
- Remove runtime reliance on Intelligence keys/URLs/SDK methods/managed Channels and unneeded packages after parity tests. Retain appropriate OSS notices and optional provider settings. Add startup capability/schema diagnostics and readiness independent per surface
- Back up and restore Ryoko state, Dots metadata, page/artifact bytes and mapping/outbox records at a documented consistent boundary. Encrypt/protect backups; specify retention, export/delete propagation, tombstones and limits of third-party erasure
- Add structured redacted logs/metrics for command admission, adapter lag, replay gaps, stuck approval/effect/delivery, channel health, storage pressure and queue saturation. IDs are correlation, not secrets. No raw personal memory or audio in routine telemetry
- Harden non-root images/private ports, secret mounts, resource limits, TLS/proxy configuration, migrations, health/readiness, graceful stop/drain and restart. Fresh install must work without an Intelligence account

**Checks/exit:** restore rehearsal, partial import resume, source history unavailable, old links, task overlap guard, auth rotation/revocation, disk full/corrupt projection, runtime unavailable, process kill, slow provider and redaction. Document exact host/provider qualification and recovery time/data-loss targets measured by test, not invented guarantees.

### BE12 — Consolidated qualification and controlled cutover

**Depends on:** all BE phases and corresponding FE acceptance; required producer release gates. **Targets:** full suite, integration harness, runbooks and shared journal. **Pairs:** FE12.

- Run focused phase tests again against final assembled commits, then repository aggregate format/lint/typecheck/test/build and complete cross-service journeys. Pin exact producer+consumer/schema/config versions
- Compare pre-migration capability inventory to final disposition; no unexplained missing chat/history/Space/review/task/voice/Slack/computer/learning behavior. Unsupported/deferred breadth is visibly disabled with an honest reason
- Complete fault/security/load/restore/privacy and real supported surface tests below. Label synthetic, browser, native/host and live-provider evidence separately. A mock cannot certify actual voice, Slack, computer or public deployment
- Cut over one declared owner/session cohort with old admissions frozen and a verified single runtime/scheduler. Observe command, artifact, delivery and resource evidence; expand only after explicit acceptance
- Rollback freezes new admissions and restores client routing/config safely. Already accepted Ryoko work retains ownership until resolved. Do not rerun it through old DotAgent; retain mappings/journals/artifacts/unknown outcomes and backward-readable schema or documented restore path

**Exit:** exact receipts, all required checks passed or explicit owner-accepted scope exclusions; no unresolved critical authority/data-loss defects. Production readiness remains false if mandatory producer, external-service, backup/restore or target-host gates are missing. Plan completion is not deployment authorization.

## 6. Consolidated verification matrix

| Area | Minimum evidence |
|---|---|
| Contract/identity | Exact schema pins; incompatible version; forged actor; wrong session/profile/agent; stale transport generation; revoked grants |
| Conversation/replay | Create/send/reload/search/archive; message order; stream interruption; crash recovery; history pagination; compression lineage; cursor expiry/gap/duplicate |
| Commands/effects | Stable ID retries; conflicting intent; crash at before/after admission/dispatch/receipt boundaries; no second loop; unresolved remote write preserved |
| Approval/cancel/delivery | Exact bytes/version/target; expiry/revocation; duplicate decision; hangup/unsubscribe not cancel; cancellation not rollback; delivery retry not mission retry |
| Artifact/page | Autosave conflict; review recovery; canonical head/digest; partial bytes; cross-Space denial; malicious rendered content; restore |
| Isolation | Primary harness inaccessible to specialists; specialists isolated; project sharing bounded; learning evidence not personal memory; secrets redacted |
| Background/channels | One scheduler; DST/missed-run/overlap; voice compute idempotency; Slack verified mapping+dedupe; computer takeover+unknown outcome |
| Self-hosting/ops | Fresh boot with no Intelligence credentials/egress; full backup+restore; migration dry run+resume; graceful drain; dependency outage; load/backpressure; target-host TLS/auth |

Repository aggregate commands: `npm run check-format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Update scripts as architecture requires; preserve coverage rather than deleting failing legacy tests to get green. Add API/contract and browser end-to-end harnesses with pinned dependencies and documented execution. Run relevant Ryoko producer tests whenever its contract changes in its own repository.

Record actual CI state for the final commit. A pending/no-check result is not a passed suite. Every acceptance receipt identifies expected/observed outcome, exact commits/hashes, environment, fixture/live status, timing/resource observations, failure and residual risk.

## 7. Completion and next implementation decision

Full implementation means the self-hosted control plane serves the existing product surfaces through one qualified Ryoko authority, with safe migration and operational recovery. It does not mean every optional provider is installed, every channel is automatically connected, LAYA is enabled or unsupported multi-user/team breadth is silently promised.

Recommended first working milestone after read-only proof: authenticated web chat + canonical history/replay + missions/approvals + Spaces, with isolated specialists and the remaining channels brought online in dependency order. The frontend plan supplies the user-facing acceptance criteria for each backend contract. Before starting implementation, confirm the selected execution environment and publication/deployment authority; then begin BE00/FE00 and follow the checkpoint protocol.
