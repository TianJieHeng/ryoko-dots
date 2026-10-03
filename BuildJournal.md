# Ryoko Dots Build Journal

Single shared frontend/backend checkpoint journal. Publication authorization covers source commits to `main`; it does not authorize deployment, migration, credential creation, channel activation, or LAYA activation.

## FE00 — Browser contract boundary and parity inventory — 2026-10-03

Status: frontend contract candidate implemented; **BE00 consumer/producer integration gate blocked**. No claim of live transport, retained full parity, or cutover readiness. Dots baseline `3172aec95d304112c5adc06286e3535bc54d9755`; producer published source `124931a916c8aa6beeaf60d08dd55ca5d20f6e3c`. FE00 alone does not replace the legacy execution path.

Changes:
- Added strict, versioned browser-safe consumer schemas for binding, independent capabilities, canonical conversation/history, transcript parts, command receipts and event identity. These DTOs describe proposed Dots routes, not shipped Hermes endpoints.
- Separated history sequences from runtime event cursors; scoped every protected projection by owner/gateway/agent/project/generation. Unknown fields, credentials and incompatible versions fail validation. Ready capabilities alone cannot bypass explicit qualification.
- Documented canonical ownership, proposed routes, independent cursors, retention disclosure, pending-write recovery and snapshot replacement in `docs/runtime/consumer-contract.md`.
- Recorded every existing control's authoritative read/command/receipt/unavailable mapping in `docs/runtime/parity-inventory.md` and producer-derived rejection/unconfigured evidence in `tests/fixtures/runtime/producer-baseline.json`.
- Corrected both plans to use the owner's exact root journal filename `BuildJournal.md`. Preserved the historical integration handoff.

Environment: Linux 6.18.44; Node v24.19.0; npm 11.9.0. Dependency bootstrap `npm ci --ignore-scripts --cache /tmp/ryoko-dots-npm-cache` passed (1017 packages). Initial default-cache install failed because `/home/agent/.npm` was unavailable; fixed by using the writable temporary cache. No dependency versions changed. Full clean-install/aggregate workflow reserved for FE12.

Checks:
- `npx --no-install vitest run tests/runtime-contract.test.ts`: PASS, 6 tests (qualification, schema/secret drift, identity generations, distinct cursors, rejected generic approvals, no-Intelligence DTO configuration).
- `npx --no-install tsc --noEmit`: PASS.
- `npx --no-install prettier --write src/shared/runtime/contracts.ts tests/runtime-contract.test.ts`: PASS.
- `node scripts/check-runtime-contract.mjs ../ryoko-agent`: PASS fixture integrity, local producer commit and generated/provenance hashes. Fixture captured from local producer `eb6b89fd554bb29cc295732a9b9cba9c3a50a489`; `git diff` against published `124931a916c8aa6beeaf60d08dd55ca5d20f6e3c` is empty for both generated files and all five pinned dispatcher/schema/test sources. Dispatcher fixture records zero execution dispatches. Dots transport, live integration and remote runtime remain NOT RUN.
- Generated producer TypeScript SHA256 `73f089aeca65cbc1e90c8a54da0f7d11c144fc160e8d8cc99e28043e9eef1839`; OpenRPC SHA256 `1d3151320c621de5b7032a4e5fb4ba170fe09fa5400fd762df832bca09622909`: match published plan pins.

Decision/remaining gates: BE00 authentication, service-to-human provenance, live read-only transport and restart reattachment remain unimplemented; strict frontend fixtures do not satisfy those exits. FE01 may safely implement unavailable/setup presentation and authentication-generation guards without inventing a backend. All backend-dependent phases must retain their blocked integration status.

Publication: this entry belongs to the FE00 checkpoint commit; exact resulting SHA and verified remote status are reported externally and in the next checkpoint to avoid a self-referential hash. No PR or deployment.

## FE01 — Truthful setup and authentication fences — 2026-10-03

Status: frontend setup/authentication slice implemented; **BE00/BE01 live binding and secure server-session gates remain blocked**. Previous FE00 publication verified on `main` at `867ea0a9e7a412863b6640deb3049b656fdebb6a`; remote tree exactly matched the local staged tree. GitHub push-run query returned zero runs for that SHA; no remote CI pass claimed.

Changes: new same-origin runtime setup reader validates the strict candidate contract and independently displays control plane, ownership binding, compatibility and every optional feature. Missing/unsupported routes remain unavailable rather than asking for Intelligence credentials. Chat readiness no longer depends on model keys or old `missing` arrays. Existing owner unlock remains; no runtime credential enters browser state. Authentication generation fences reject late responses; authentication changes clear workspace, transcript selection, captures, task detail and pending prompt. Per-selection request fences cover A→B→A, reconnect and unmount, and hide the previous selector's projection before effects run. New settings status lists provider states without conflating configuration with qualification.

Checks (Node 24 environment as FE00):
- `npx --no-install vitest run tests/runtime-connection.test.ts tests/setup.test.ts tests/security.test.ts tests/runtime-scope.test.ts tests/app.test.ts`: PASS, 5 files / 33 tests. New tests cover stale auth response, A→B→A/reconnect fencing and distinct failed setup states.
- `npx --no-install tsc --noEmit`: PASS.
- `npx --no-install eslint src/client/runtime src/client/api.ts src/client/App.tsx src/client/WorkspaceDialog.tsx tests/runtime-connection.test.ts`: PASS.
- Changed files formatted; `git diff --check`: PASS. Consolidated tests and real browser/provider qualification remain FE12 work.

Limits: the legacy server still owns old `/state` and `/workspace` metadata and owner-token authentication. No self-hosted setup route was fabricated; absent BE01 returns a visible unavailable state. This does not certify cookie/CSRF lifecycle, multi-user tenancy or real authenticated runtime ownership. Next FE02 replaces the hosted thread provider and introduces canonical history/navigation, still gated by BE02.

Publication: journal included in this FE01 checkpoint; verify exact remote SHA/tree before advancing. No PR, deployment or credential change.

## FE02 — Canonical conversation navigation and history — 2026-10-03

Status: frontend replacement implemented; **BE02 canonical persistence/transport/restart gate blocked**. Prior FE01 verified on remote `main` at `a252965feaecf5686fb8b18c6fc52a5689e6f8ce`, with identical local/remote tree and journal.

Changes: removed all frontend CopilotKit imports/providers/hooks. Conversation navigation now uses strict same-origin scoped list/history candidates, actual cursor pages and stable-ID/revision reconciliation. Thread titles/specialist attribution remain; canonical history renders retained Markdown/page links and stable call anchors with explicit truncation/interruption. Stale/foreign scope is rejected. Pure event projection separates pagination from live runtime cursors, detects gaps and requires matching snapshot reset. Create/page-conversation operations persist an ID before submission; a repeat click after uncertain admission inspects that original operation instead of creating another. No client-authored assistant history is sent. Composer remains visible with unsent text; live submit is deliberately disabled until FE03. Artifact/voice buttons visibly await their paired adapters.

Checks:
- `npx --no-install vitest run tests/runtime-projection.test.ts tests/transcript.test.tsx tests/workspace.test.ts tests/page-service.test.ts`: PASS, 4 files / 19 tests; 6 new projection tests cover duplicate/revision, pagination, foreign scope, gaps and snapshots.
- `npx --no-install tsc --noEmit`: PASS.
- Targeted ESLint for changed client files/runtime modules/projection tests: PASS. Formatting and `git diff --check`: PASS.
- `grep -R '@copilotkit' -n src/client`: no matches. Server packages/imports deliberately retained for later backend work; this is not a no-Intelligence server startup claim.

Limits: empty-session durable persistence, rename/archive server writes, canonical compression lineage, process restart and old-history import require BE02. The new browser reads cannot make those server guarantees. No mock success or competing transcript database was added. Next FE03 enables recoverable intent submission and bounded live reconciliation against these contracts.

Publication: this journal entry travels in the FE02 commit; exact remote verification follows before FE03. No PR or deployment.

## FE03 — Durable intent submission and live reconciliation — 2026-10-03

Status: frontend command/recovery adapter implemented; **BE03 durable admission and complete transcript/live transport gates blocked**. FE02 prior remote checkpoint verified at `7940605915634e15439cfd20bde4ac9489aef740` with exact matching tree/journal.

Changes: composer submits only validated user intent, source URL and a pre-persisted operation ID/SHA256 digest. Same intent reuses identity and explicitly inspects its original receipt; changed text creates independent identity without overwriting uncertain work. Storage failure prevents submission. Receipts must match owner/gateway/agent/project/generation, operation ID and digest. Unconfirmed/rejected admission preserves text; acceptance clears it without claiming execution/delivery. Cancellation has its own durable identity and requested/acknowledged/unknown presentation. Source links, inline safe tool summaries and canonical page-context readiness are retained. Bounded live polling applies monotonic scoped events, detects gaps, reloads canonical history and detaches on unmount without cancellation. Async admission is fenced on scope change/unmount, including between digest preparation and send. No inherited 90-second mission timeout or local execution fallback.

Checks:
- `npx --no-install vitest run tests/runtime-commands.test.ts tests/runtime-projection.test.ts tests/page-context.test.ts tests/page-chat-request.test.ts tests/headless.test.ts tests/headless-runtime.test.ts`: PASS, 6 files / 24 tests; 7 new command tests cover identity reuse, changed input, storage failure, scope isolation, wrong receipts and unknown admission without retry.
- `npx --no-install tsc --noEmit`: PASS after React ref initialization fixes.
- Targeted ESLint and formatting for Chat, command/live modules and command tests: PASS; `git diff --check`: PASS.

Limits: polling is a consumer candidate, not evidence that redacted durable Hermes events contain token output. Real BE03 live transcript adaptation, slow consumer/restart/lost-receipt recovery and service ownership remain unqualified. Page-context data must be explicitly present in authoritative history before send. Browser pending storage is a recovery aid, not the server's durable command registry. Next FE04 replaces task authority with mission/review projections.

Publication: FE03 source and this journal are one checkpoint. No backend deployment, provider activation or PR.
