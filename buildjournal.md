# Build journal

## 2026-11-08 — Portal scoped native approvals

Implemented explicit `read`/`decide` approval grants independent of chat write permission. Existing credentials receive no approval authority. Added scoped pending-request, decision and operation-receipt routes to the hub and private API edge. Decisions bind the exact native conversation, run and request version; current credentials are checked before dispatch. Durable intent precedes native effects, and a unique target fence blocks duplicate decisions even with a new operation ID after an uncertain outcome. The original owner-only routes remain private.

Validated locally: TypeScript check, 15 hub/API-edge tests and server build passed. Fixtures cover denied ordinary credentials, stale versions, exact-run binding, one-effect replay, altered-payload rejection, revoked credentials and acknowledgement-loss fencing. No CI. No real approval was decided.

Deployed on this Dots host after an online SQLite backup with integrity verification and confirmation of no active hub runs. Portal enrolled four runtimes with private scoped credentials outside Git. Claude, Codex and Kimi expose native approvals; Hermes does not. Agent Chat changes are maintained in its separate local clone and pushed for owner deployment on that device.

## 2026-11-08 — Native Agent Chat connections for build workers

Added an optional owner-configured worker MCP connector to Codex, Claude and Kimi
runtime manifests. Private conversation bindings are selected by immutable create
operation ID, never by a model-supplied command, URL or participant. Codex receives
configuration on thread start/resume, Claude through SDK query options, Kimi
through ACP session new/load. Existing approval modes remain unchanged. Added
runtime validation of ACP session/prompt responses rather than trusting unknown
SDK values. No new API credential authority or conversation parameters.

Validated: full TypeScript check, 19 focused hub/profile/CLI/Codex/connector tests,
server build, and changed-file lint. Actual installed Codex, Claude and Kimi all
completed native MCP initialize and tools/list in the bounded no-model smoke
script `scripts/check-worker-mcp.mjs`; discovery waits for asynchronous client
startup. This is transport qualification, not a new end-to-end model build.

Deployed the server build and owner manifest after confirming all nine existing
bridge deliveries were replied. Backups reside privately under Agent Chat's
worker-mcp-20261108-071745 directory. Restarted ryoko-dots and dots-bridge managed
services; both active. Codex/Hermes report disconnected until their lazy native
connections are used; Claude/Kimi report ready. Agent Chat's separate repository
contains the shared skill, scoped relay, six-profile installer, tests and phased
remaining-tool migration plan. No CI; no changes to host-recovery Hermes.

## 2026-11-08 — Native migration phase 4: qualified Hermes coordinator

Advanced both producer provenance records and runtime source pins to clean Hermes
08ebfadbfc3b48f70dc4cb22a1e22e9c2ea5b171, adding the opt-in owned MCP session header.
Generated protocol contract bytes remain unchanged. Enrolled a separate owner
Hermes runtime/profile for new build coordination; original host-recovery profile
and historical Dots runtime remain intact. The primary-only launch qualification
was preserved, not relaxed. New coordinator conversation successfully reached ready.

TypeScript, server build and 19 focused hub/profile/native-adapter tests passed.
Hermes' canonical test runner passed 40 policy/budget/mutation tests. No CI.

## Native migration phase 6 qualification — 2026-11-08

Authenticated discovery smoke passed in actual installed Codex, Claude and Kimi
clients. The script now requires an enrolled private binding rather than a dummy
capability. Pinned Hermes cfa0209fd2: discovers granted MCP servers inside an
admitted turn before tool snapshot refresh. Canonical Hermes budget tests: 12
passed. Server build passed; live six-slot model handoff remains in progress,
tracked in Agent Chat's build journal. Host recovery service remains separate.

Phase 6 live pilot found Codex MCP write consent arrives as a native single
Accept/Decline requestUserInput prompt, previously rejected as unsupported by
Dots. Added narrowly recognized binary prompts to the existing scoped approval
queue, retaining explicit one-action owner decisions and denial of other forms.
Four real subprocess adapter tests passed (accept/decline, foreign thread,
revoked guard and stale request). Targeted adapter TypeScript passed. The full
and server-project typechecks hit the bounded wrapper's 512 MB V8 heap limit;
limits were not increased. The earlier 19 focused adapter tests passed. Read
protocol reference: https://learn.chatgpt.com/docs/app-server, verified against
installed Codex 0.163.0 generated schemas. Pilot 5c4655f0 was explicitly cancelled
and drained before deployment; its first backend artifact exists but native
reporting failed, so it is not acceptance evidence. Fresh pilot follows.

Phase 6 protocol correction: an actual Codex 0.163.0 model probe (with both stable
and experimental capability settings) showed write consent uses
mcpServer/elicitation/request with codex_approval_kind=mcp_tool_call and an empty
object form. Added that exact form to the same approval queue. Replies grant only
one action, never the offered session/always persistence. All six adapter tests
and targeted TypeScript pass, including both protocol shapes, accept/decline,
foreign thread, revoked guard and stale response. Diagnostic probes explicitly
declined consent and produced no external message. No approval policy was disabled.

## 2026-11-08 — Native migration live acceptance complete

Build `52ab49df-37da-4005-ae55-565043b85fed` completed with all six distinct
worker profiles using native thread reads and final reports. Ryoko launched six
children and resumed its existing native conversation for report notifications.
All jobs and deliveries replied; coordinator acceptance and independent fixture
checks passed. Agent Chat documents the initial consent failure and explicit
recovery, with sanitized evidence in `docs/native-migration-acceptance.json`.
Bridge identity/wakeup ownership and individual approval controls remain intact.
The final adapter code is deployed at 2141d64. Broad typecheck memory limitations above remain applicable.
