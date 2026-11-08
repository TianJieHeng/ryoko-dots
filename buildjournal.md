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
