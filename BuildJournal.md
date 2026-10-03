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

## FE04 — Missions, exact reviews and independent recovery — 2026-10-03

Status: frontend mission/control/review slice implemented; **BE04 durable effects, exact-review payload and control semantics remain blocked**. Previous FE03 `c423954a9c8d546199de863541dca76c97a721e5` verified on main with identical tree/journal.

Changes: Activity now shows scoped mission state, output verification, delivery, event history and unresolved effects separately. Allowed controls distinguish resume, new run, delivery-only recovery, pause and cancellation; a new run warns it can repeat work. Existing SQLite tasks remain an explicitly read-only archive with their event/run history. Global Pause now requires the runtime control contract and shows admission/schedule/in-flight semantics rather than claiming active compute stopped. Exact review cards display escaped target/content, hashes, revision, expiry and binding; stale/foreign/expired/decided reviews cannot submit. Synchronous click lock, changed-review isolation and explicit inspect-only receipt recovery prevent blind review replay. The canonical action is approval.resolve, not unsupported generic command approval. Shared bounded resource readers and operation/digest clients preserve scoped read and recovery behavior.

Checks:

- `npx --no-install vitest run tests/runtime-actions.test.ts tests/runtime-review.test.tsx tests/controls.test.tsx tests/page-review.test.tsx tests/runner.test.ts tests/shutdown.test.ts`: PASS, 6 files / 21 tests, including inspect-only missing receipt, lost response, exact receipt binding, delivery-only intent, escaped review and expiry/generation gates.
- `npx --no-install tsc --noEmit`: PASS.
- Targeted ESLint for runtime client/shared modules, App and new tests: PASS. Changed files formatted; `git diff --check`: PASS.

Limits: only a qualified backend can supply full exact approval bytes, validate live grants and bind policy/effects. UI receipt acceptance is not execution or delivery. Old task execution controls are frozen, not migrated. Backend/policy/provider race and crash acceptance remain BE04/FE12 gates. Next FE05 retains editor parity and adds independently verified artifact retrieval/conflict recovery.

Publication: journal and FE04 implementation are the same main checkpoint, verified before next phase. No PR or deployment.

## FE05 — Editor fidelity and verified artifact bytes — 2026-10-03

Status: frontend editor/artifact slice implemented; **BE05 artifact registration, immutable store/version receipts and server permission gates blocked**. FE04 remote checkpoint `eaf507b29166d7828668c816ce7362da5ae48195` was verified with matching tree/journal.

Changes: existing Spaces tree, library, title/rich/source editor, slash/formatting, outline, autosave, move/subpage/download/Load latest/source links and keyboard Save remain intact. Autosave now recovers a lost-response save only when an authoritative read contains the exact desired bytes; different remote edits preserve the draft/conflict. This proves present page bytes, not a fabricated effect receipt. Page chat rechecks its page/specialist generation after asynchronous save and before conversation admission. Hash Back/Forward to a non-page view now respects dirty-draft protection. Save-to-page submits an operation over committed eligible transcript/destination rather than browser-authored history.

New Artifacts tab declares native-page vs registered runtime byte authority. Complete authorized content is bounded, same-origin streamed and verified against exact size, MIME and SHA256 before “verified” or download. Redirects, inaccessible/uncommitted files, mismatched bytes and authentication/scope changes invalidate retrieval. Preview is inert escaped source text; no generated HTML runs. Sharing/publication is explicitly separate.

Checks:

- Focused artifact/autosave/page-chat/pages/page-routes/page-service/Markdown/library/page-snapshots suites: PASS, 9 files / 45 tests. Includes 7 artifact tests plus lost-save exact-byte recovery, conflicting byte preservation and wrong-page pre-admission guard.
- `npx --no-install tsc --noEmit`: PASS.
- Targeted ESLint, changed-file formatting and `git diff --check`: PASS.

Limits: native manual edits still use the existing revision-checked Dots page authority. BE05 must register that store and qualify operation receipts/immutable versions, full grant rechecks and imported source links. UI tests are not real browser interruption or live artifact-store qualification; those remain FE12 gates. Next FE06 scopes specialists, memory and reviewed Learning.

Publication: this journal and source changes share FE05 checkpoint. No deployment, migration or sharing performed.

## FE06 — Scoped specialists, memory and reviewed Learning — 2026-10-03

Status: frontend agent/memory/skill lifecycle slice implemented; **BE06 stable identity, real memory and workflow backend gates blocked**. FE05 remote `b0f4a42ae448d701b0a98bc70c16ec9cd4ec1458` verified with matching source tree/journal.

Changes: global preference mutation is no longer exposed as active specialist memory. Memory view binds owner/agent/project to an explicit backend: primary Ryoko must use personal_harness, specialists must use built_in. Renaming/copying cannot select privilege; unavailable harness state never redirects writes. Read/edit/delete/export controls require the backend's declared capability. Specialist form preserves name, instructions, research/memory choice, allowed Spaces and default destination, but submits only through verified runtime bindings/revisions; default Space never grants ownership. Effective backend/identity revision is displayed and accepted work retains its prior capability snapshot. Legacy managed Learning enrollment controls are removed from active configuration, remaining frozen for migration.

Reviewed Learning now displays evidence, immutable draft/content digest, evaluation, lifecycle stage, publication/delivery destinations and rollback version. Actions are revision/digest-bound and runtime-advertised; approval requires evaluation, publication/delivery require their exact stage and destination, and rollback requires a distinct previous version. Protected resource reads discard actionable cached data on failure rather than presenting stale ready controls.

Checks:

- `npx --no-install vitest run tests/runtime-agents.test.ts tests/workspace.test.ts tests/learning.test.ts tests/learning-delivery.test.ts`: PASS, 4 files / 19 tests; 10 new tests cover privilege/backend invariants, explicit Space grants, harness outage, frozen workflow and reviewed lifecycle/rollback.
- `npx --no-install tsc --noEmit`: PASS.
- Targeted ESLint, changed-file formatting, `git diff --check`: PASS.

Limits: no memory harness, specialist namespace or workflow service was created/activated by frontend code. Legacy server global injection and managed Learning internals must be retired by backend migration; the new UI does not certify that server cutover. Cross-process privacy/revocation and actual workflow publication/rollback require BE06/FE12 evidence. Next FE07 adds durable schedules and independent notice delivery.

Publication: FE06 source and journal share the checkpoint. No credentials, migration, workflow publication or deployment performed.

## FE07 — Bounded schedules and independent notification delivery — 2026-10-03

Status: frontend schedule/notice slice implemented; **BE07 durable occurrence, import and delivery backend gates blocked**. FE06 previous remote `2f9c604e60b03bbf976fcb2828f7571ca96a842b` verified with exact tree/journal.

Changes: conversation schedule forms now state minutes, IANA timezone, missed-run/overlap policies, explicit requested authority boundary, UTC expiration and bounded occurrence count. Runtime-supplied next occurrences are formatted in the declared timezone; no browser timer calculates or executes recurrence. Activity shows exact revisions, edit/run-now/pause/resume/cancel, occurrence IDs, mission links/status and independent delivery. Imported/unreconciled schedules cannot activate; fresh expiry/budget guards run on activation. Scheduling cannot authorize publishing outputs. Held drafts return to exact reviews rather than rerunning work.

Notification held/queued/delivered/failed/unknown states remain distinct. Delivery repair references the notice alone, never its mission. Explicit displayed-text acknowledgment checks connected rendered text, UTF-8 byte length and SHA256, and sends humanRead=false; transport/rendering is not human-reading evidence.

Checks:

- `npx --no-install vitest run tests/runtime-schedules.test.ts tests/store.test.ts tests/runner.test.ts tests/controls.test.tsx tests/runtime-actions.test.ts`: PASS, 5 files / 21 tests, including six schedule/notice tests for DST/zone, exact bounds, stale authority, imports and unknown delivery.
- `npx --no-install tsc --noEmit`: PASS after removing unreachable legacy schedule-field comparison.
- Targeted ESLint, formatting and `git diff --check`: PASS.

Limits: server scheduler ownership, timezone recurrence rules, restart/overlap/missed-run execution, actual authority rechecks and notice outbox receipts remain BE07/FE12 obligations. No legacy schedule migrated or activated; no browser scheduler added. Next FE08 qualifies presentation/control boundaries for computers and research.

Publication: FE07 and this journal are one main checkpoint. No deployed schedule, external notification or channel activation performed.

## FE08 — Broker-scoped computers and research presentation — 2026-10-03

Status: frontend executor/broker slice implemented; **BE08 actual executor, takeover and broker-effect gates blocked**. FE07 remote `a2c0739c6fd6fa236dde63422a9cb1ea0027cc78` verified with matching tree/journal.

Changes: retained Browser/Files/Terminal/Activity tabs, per-Dot controls, permission fields, screenshots, start/stop, take/release and inline computer links. Browser control now reads strict authenticated executor identity/revision/status, accepts only fresh matching screenshots, expires old screenshots, polls screens only in the Browser tab, and fences late scope/tab responses. User actions use validated broker input and persisted operation identity; uncertain effects disable ordinary replay and offer original-effect inspection. Prepared/dispatched/unknown/reconciled/failed remain distinct. Take control/emergency stop use a separate control path and remain independent of the ordinary busy lock. No raw typed text, commands or file bytes are persisted in operation storage. Existing grounded source excerpts, sample/live distinction and read-only research defenses remain intact.

Checks:

- Combined focused run: runtime-computers/computer/computer-card/computer-deployment/research/transport/security — **44 PASS, 2 FAIL across 7 files**. Five new broker tests pass.
- Two existing `transport.test.ts` cases expected a controlled local200/redirect but observed HTTP502. Initial execution was auto-review denied for synthetic public.example; inspected test source proves mocked DNS pins127.0.0.1, local fixture server, static GET headers and no private body. One exact retry was allowed after that evidence; its two502 failures remain visible. No proxy/security bypass or production transport weakening occurred. Deterministic offline/host qualification remains FE12 work.
- `npx --no-install tsc --noEmit`: PASS; targeted ESLint/formatting/`git diff --check`: PASS.

Limits: frontend endpoint/control declarations do not prove an isolated live executor, stalled-agent out-of-band takeover, restart fencing or effect recovery. Live browser/shell acceptance remains blocked. Single-URL research is not general web search. Next FE09 preserves media UX behind explicit adapter qualification and durable call/compute identities.

Publication: FE08 source and this journal share the checkpoint, with the two failed focused cases disclosed. No live executor actions, deployment or activation performed.

## FE09 — Explicit realtime media and durable voice compute — 2026-10-03

Status: frontend media/call slice implemented; **BE09 real adapter/hardware/call persistence gates blocked**. FE08 remote `9c437d37f511783f68edc24623dff699b8a5ba7c` verified with matching tree/journal; its two transport fixture failures remain open for FE12.

Changes: retained call connecting/active/ending, caption/phase/duration, microphone/speaker mute and minimized CallView. Start is available only for a scope-matching qualified realtime_webrtc adapter with the declared supported signaling protocol; provider/mode are disclosed and finite local speech is clearly not realtime parity. Browser microphone consent remains explicit. Media admission and provider compute IDs persist before server submission; unknown admission blocks new calls and offers inspection/recovered media-only hangup. Repeated compute IDs inspect the same operation; changed request bytes conflict. Accepted compute is not spoken as completed output. Hangup/local device cleanup never cancels accepted missions; teardown detaches media and leaves server-owned lease/receipt recovery. Canonical call receipts preserve anchors and explicit unknown status. Media events/captions are bounded and scope change stops local capture.

Checks:

- `npx --no-install vitest run tests/runtime-voice.test.ts tests/runtime-voice-client.test.ts tests/voice.test.ts tests/transcript.test.tsx tests/headless-runtime.test.ts`: PASS, 5 files / 26 tests. New cases cover finite/unqualified/wrong-scope adapter denial, safe output status, unknown media inspection and compute dedup/conflicting bytes.
- `npx --no-install tsc --noEmit`: PASS; targeted ESLint/formatting/`git diff --check`: PASS.
- Frontend legacy `/voice` routes: no remaining matches; all new media control is under runtime adapters.

Limits: actual microphone/device/browser/provider behavior and disconnect/restart/hangup receipts are not live-qualified. The backend must implement media leases, durable provider event ownership, exact mission independence and canonical transcript/call persistence. No provider activated or hardware accessed. Device switching is explicitly end-and-restart until qualified. Next FE10 adds verified Slack provenance and cross-surface delivery repair.

Publication: FE09 implementation and journal share one main checkpoint. No live call, credential or deployment action performed.

### FE09 corrective checkpoint — 2026-10-03

Initial FE09 publication `559f6a41c211bb905c580b2ac951acd6a7c522bf` was verified on main, but the final caption bound edit (after the earlier successful typecheck) introduced TS18046 on `data.transcript`. The last-command wrapper allowed publication despite that compiler output; the preceding FE09 PASS claim applies to the earlier state and is corrected here. Replaced mutation of an unknown record field with a locally narrowed bounded string. Re-ran the exact focused voice suite, typecheck and targeted lint successfully before this corrective publication; no phase advancement occurred while the error remained.

## FE10 — Verified Slack provenance and delivery continuity — 2026-10-03

Status: frontend cross-surface slice implemented; **BE10 real self-hosted ingress/egress, actor mapping and external Slack gates blocked**. Corrected FE09 checkpoint `164864f1792e8be0a2f5a7b0bf55a30601e5ade4` verified on main with matching tree/journal.

Changes: setup displays self-hosted Slack state, verified team/human/channel allowlists, created-message-only/bot-ignore policy and event dedup declaration; no managed Channels connection UI remains. Conversation origins preserve provider event/thread identities and mark Slack verified only against exact qualified mappings. Display names and claimed owner IDs confer no trust. Safe Slack permalinks and same-origin mission/review links are validated. Review deep links navigate to the authenticated mission and focus the exact review where present in the current agent binding; inaccessible/mismatched bindings stay unavailable rather than remapped by the browser. Delivery records retain immutable output versions and mission success; only confirmed failed delivery offers delivery-only repair. Unknown acknowledgment offers inspection, not a send retry or mission replay.

Checks:

- `npx --no-install vitest run tests/runtime-channels.test.ts tests/slack-channel.test.ts tests/slack-channel-wiring.test.ts tests/dot-agent-channel.test.ts tests/runtime-scope.test.ts`: PASS, 5 files / 23 tests; 7 new tests cover foreign actor/team/channel, bot/changed-message policy, unsafe links, unknown acknowledgment and stable event identity.
- `npx --no-install tsc --noEmit`: PASS; targeted ESLint, formatting and `git diff --check`: PASS.

Limits: legacy server Slack/Channels internals are not replaced by frontend components; no external Slack qualification or service activation is claimed. Backend must bind verified provider ingress IDs, authenticate cross-agent links and persist an outbox/receipt path shared with web/voice. Private specialist memory is never part of these DTOs. Next FE11 adds migration/read-only ownership and frontend-only packaging while keeping backend cutover blocked.

Publication: FE10 source and journal are one main checkpoint. No Slack message, live channel binding, migration or deployment performed.

## FE11 — Read-only migration gates and frontend-only packaging — 2026-10-03

Status: frontend migration/packaging slice implemented; **BE11 full self-hosted server startup, import/restore/rollback gates blocked**. FE10 remote `1054a1756576f93dba5152db0dbec3dd1ec0cc8c` verified with exact tree/journal.

Changes: settings now exposes read-only sticky runtime owner and migration inventory for conversations/page links/reviews/calls/specialists/memory/Learning/schedules/artifacts/effects. Duplicate categories, unsafe old approval grants and uncertain schedule backfill are rejected; incomplete inventory or unpreserved accepted Ryoko work blocks cutover eligibility. No UI migration/deployment action is provided. Documentation and env template explicitly separate this frontend from the retained legacy server.

Added `dev:frontend`, `build:frontend`, `preview:frontend` and contract-check scripts. Standalone Node24 preview binds loopback, serves compiled assets with strict same-origin CSP, and returns explicit503 for every API without starting a database, planner, scheduler, channel, model or proxy. Legacy server browser CSP no longer imports a hosted Intelligence WebSocket origin. Its server-only execution dependencies remain pending backend retirement. Import plus npm transitive review found `@copilotkit/react-core` entirely unused; removing it removed308 packages and updated the lockfile. Other CopilotKit/Channels/TanStack packages remain because legacy server code still imports them. Script files are now included in formatting/lint workflows.

Checks:

- Focused frontend-package/migration/setup/security suites: PASS, 4 files / 29 tests, re-run after dependency removal.
- `npx --no-install tsc --noEmit`: PASS after removal.
- Targeted ESLint (including scripts), Node syntax check, formatting and `git diff --check`: PASS.
- Frontend packaging test served isolated loopback HTML, returned truthful API503, denied writes/missing files, and verified no hosted CSP origin. Compiled-bundle/full-install/build and browser checks remain FE12.

Limits: this is explicitly frontend-only packaging, not a functioning full self-hosted deployment. Existing `npm start`/combined `npm run dev` still start the legacy backend and are not the migration path. BE11 must replace/retire that owner, qualify no-hosted-network startup, imported IDs, backup/restore and rollback with accepted work. No provider credentials configured, migration performed or deployment started. Next FE12 runs the consolidated workflow, browser/fault checks and exact-source readiness report.

Publication: FE11 source, dependency changes and journal share one main checkpoint. Full-parity cutover remains blocked and requires separate approval after backend qualification.

## FE12 — Consolidated local qualification and explicit blocked acceptance — 2026-10-03

Status: **frontend implementation/checkpoint complete; integrated/visual/live acceptance BLOCKED**, not production-ready. FE11 `ac8061458c1cd220071d320bad0d06e2165c69a3` verified on main. Exact final consumer SHA/tree is verified after this checkpoint; pinned producer/source hashes remain the FE00 values.

Consolidated Node24 workflow:

- `npm ci` with `npm_config_cache=/tmp/ryoko-dots-npm-cache`: PASS, clean711-package install with scripts enabled.
- `npm run check-format`, `npm run lint`, `npm run typecheck`: PASS.
- `npm test`: PASS, **50 files / 244 tests**, zero failed/skipped reported.
- `npm run build`: PASS (browser bundle and NodeNext server compile). Explicit `.js` import extensions fixed after the full build uncovered them. Nonfatal main-bundle size warning retained (~1.07MB minified/~330KB gzip).
- `npm run check:runtime-contract -- ../ryoko-agent`: PASS fixture integrity and exact generated/provenance source hashes; replay/live transport/integration explicitly NOT RUN.
- Current checkpoint remote Actions/status reads returned no runs/statuses. This is not a remote CI pass. Final exact main/tree/journal verification follows publication separately.

Final regression fixes: immutable submitted draft generation now protects newer text/source; complete draft/source and pending command identity survive lost receipt/remount. A second exact review cannot falsely report sent while another operation holds the lock. Computer tab changes preserve pending effects/status/emergency controls; binding changes fence late errors/file reads. Expired auth clears projections once without a401 loop. Settings now has a non-input initial-focus fallback, and long review IDs wrap on narrow panes (source fixes, not browser-proven layout).

The FE08 two transport failures were resolved without changing production networking or bypassing security: the real socket fixture uses explicit127.0.0.1, and the Node24 lookup callback's all/single shapes are asserted in a separate no-socket unit test. Redirect and cancellation tests remain. The initial full test run was denied on the old synthetic-host request; it stopped and was not hidden. All final tests run against the revised deterministic fixture.

Browser qualification is blocked on both permitted routes: Chromium local singleton `socket()` EPERM (including approved retry), and existing cloud browser loopback navigation ERR_BLOCKED_BY_CLIENT. **No UI loaded, zero screenshots, zero browser assertions passed, 21 scenarios NOT RUN.** The reproducible synthetic harness/fixture is committed; it includes lost receipt/source remount, newer draft, exact review, modal/dirty navigation, computer tab/effect and narrow-screen scenarios. No OS/proxy permission changed, tunnel or external QA service used. Temporary QA servers/processes were stopped.

`docs/runtime/frontend-release.md` and `tests/fixtures/runtime/frontend-release-evidence.json` summarize exact source pins, build asset hashes, local outcomes and the BE00–BE12 handoff. Browser/provider/hardware/real backend fault-injection, backup/restore/migration/rollback and full no-hosted-server startup remain unqualified. Frontend-only preview is not a migrated production package. No deployment/cutover requested while these gates remain open; separate backend implementation and then explicit deployment approval are required.

Publication: all FE12 fixes, reproducible evidence and this root journal are one main checkpoint. No PR, backend activation, credentials, external delivery, live media/executor use, migration or LAYA activation.

## BE00 — Pinned read-only backend foundation — 2026-10-03

Status: foundation checkpoint implemented; **integrated BE00/OD00 acceptance remains blocked** on production transport/owner binding and canonical producer prerequisites. This is not a passed live integration or completed backend release. Previous published Dots/FE12 checkpoint: `ee5450e188e9a0dcffecee4a20b30e4b44dc7be9`. No sibling repository edits, credential generation, deployment, provider execution, or channel activation occurred.

Changes:

- Extracted exact generated TypeScript/OpenRPC transitive schemas for capabilities, snapshot and durable replay from published producer `124931a916c8aa6beeaf60d08dd55ca5d20f6e3c`, with provenance and drift-rejecting regeneration. Promoted already-installed Ajv 6.15.0 to runtime dependency; no dependency version changed.
- Added bounded read-only newline RPC consumer with request/response validation, private-notification discard, queue/byte/time limits, redacted failures and no execution/cancellation/retry route.
- Added SQLite WAL read projection with separate live/durable IDs, persistent binding generation, atomic snapshot/event/cursor writes, duplicate/gap/foreign-session/lease checks, 1,000-event cache bound and restart tests.
- Implemented `/api/runtime/setup` behind the current owner boundary. It explicitly reports all unqualified features unavailable; no service key or reachable endpoint can make them ready.
- Added real producer dispatcher/identity/store synthetic pipe probe and documented the transport decision, limits and cross-repository prerequisites in `docs/runtime/backend-contract.md`. Existing parity inventory remains the full ingress/disposition reference.

Environment: Linux x64, Node v24.19.0, npm 11.9.0, temporary Python 3.12.14 environment. Previously recorded producer Python symlink pointed to an unavailable path; created a temporary test venv and installed ordinary test dependencies from the configured registry. Initial replay failed for missing `ruamel.yaml`; installed the missing dependencies and reran successfully. Temporary fixture homes/databases are deleted by each harness; no real owner profile or provider credential was used.

Checks:

- `npx --no-install vitest run tests/backend-runtime.test.ts tests/runtime-contract.test.ts tests/app.test.ts`: PASS, 3 files / 21 tests.
- `npx --no-install tsc --noEmit`: PASS.
- Focused ESLint on changed runtime/app/tests/scripts: PASS.
- Focused Prettier and `git diff --check`: PASS. Regeneration twice produced identical schema/type SHA256 `a219698a657e1f12b8227fe3d375667f9263855c0962f0275c7d7c5b38c2b62f` / `501ef7ee4190f0802c8eeb6f225e1c3d3fa8d3ab756a960d85059bc8eb57c3a7`.
- `node scripts/check-runtime-contract.mjs --producer-root ../ryoko-agent --replay --python /tmp/dots-backend-python/bin/python`: PASS local source pins and isolated real dispatcher replay. Producer local source `eb6b89fd554bb29cc295732a9b9cba9c3a50a489`; published pinned sources unchanged.
- `node --import tsx scripts/probe-runtime-readonly.mjs /tmp/dots-backend-python/bin/python ../ryoko-agent`: PASS actual Dots pipe consumer → real synthetic producer dispatcher for capabilities/snapshot/replay, foreign live-session denial and expired cursor snapshot replacement; zero provider dispatches. Fixture bridge is not the production entrypoint/authentication proof.
- Production stdio/WS binding, full process restart/resubscribe, live provider, browser and target-host gates: NOT RUN / UNQUALIFIED. Full consolidated suite is reserved for BE12.

Blocker/next: inspected producer generic session attachment warns but does not enforce foreign login ownership; create idempotency is process-memory/300-second only; no read-only command receipt lookup exists, and command replay can queue historical unclaimed work. Owner confirmation is pending for narrowly scoped producer conversation/receipt fixes. Continue independent BE01 Dots session/auth storage work with blocked integrated status; do not enable dependent writes until authority and durable canonical history are proven. Remote commit/tree/journal and exact-commit CI are checked after publication; no pending/absent CI is called a pass.

## BE01 — Single-owner sessions and scoped binding registry — 2026-10-03

Status: Dots authentication and registry implementation checkpoint complete; **producer binding and end-to-end integration remain unqualified** until the BE00/BE02 producer adapter proves them. Previous published checkpoint `a82b1583fbb8861a5f44e1a4cfdf01801a6f4c15` (BE00 foundation), remote tree/journal verified. Owner separately approved the bounded producer conversation/receipt and seven full-plan integration prerequisite areas; this entry publishes only the independent Dots authentication slice.

Changes:

- Production `createApp` requires SQLite-backed `OwnerAuth`, with no unauthenticated mode or bearer bypass. Existing bootstrap owner token is exchanged for HttpOnly/SameSite cookies (Secure and `__Host-` over HTTPS), in-memory CSRF, absolute/idle expiry, logout/all-session revocation and restart-safe rotation fencing. No deployment credential was generated.
- Enforced exact configured Host/port/origin, JSON and body limits, persisted rate limits, no trusted forwarded headers, native TLS for external listeners or explicit loopback-only TLS proxy mode. Missing owner configuration fails closed. Added authenticated request fence for streamed chunks/effects and post-read revocation validation.
- Replaced browser token storage with serialized cookie bootstrap/login/logout, immediate protected-state clearing, generation-fenced requests and removal of old sessionStorage owner tokens. Owner secrets are never retained in browser storage; CSRF remains in memory. Updated the synthetic browser harness for this real protocol.
- Added server-only owner/principal/profile/agent/project/conversation registry, uniqueness/CAS revisions, immutable privilege classes, grant/revoke/archive checks and independent live transport versus stable authority revisions. Dot renaming cannot select privilege. Registry mutations are not browser APIs, and no mapping is installed merely from configuration.
- Ported existing app/page/runtime boundary tests to real cookie login; added auth, delayed-revocation, rotation/restart, mapping and client race regressions. Documented limits and TLS/session setup in `SECURITY.md` and `.env.example`.

Environment: same Linux x64 / Node v24.19.0 / npm 11.9.0. All session/database/credential values in tests are synthetic temporary fixtures. No deployment, real credential, provider, external channel or live computer was activated.

Checks:

- `npx --no-install vitest run tests/owner-auth.test.ts tests/runtime-bindings.test.ts tests/app.test.ts tests/page-routes.test.ts tests/workspace.test.ts tests/runtime-scope.test.ts tests/security.test.ts tests/client-auth.test.ts tests/runtime-connection.test.ts tests/runtime-commands.test.ts tests/runtime-artifacts.test.ts`: PASS, 11 files / 87 tests.
- `npx --no-install tsc --noEmit`: PASS.
- Targeted ESLint/Prettier for changed server/client/tests/browser harness and `git diff --check`: PASS.
- `npm run build`: PASS; existing nonfatal main bundle size warning remains approximately 1.077 MB minified. Full aggregate test suite remains scheduled for BE12.
- One regression initially exposed a real delayed-read revocation defect: Hono finalized responses required replacement of `c.res`. Fixed the response and removed sensitive content headers, then reran the focused gate successfully.
- Actual Chromium/browser gate: BLOCKED by the already recorded sandbox startup restriction; 0 UI assertions passed. Harness updates are test code, not a browser visual/accessibility pass. Target-host TLS and real proxy qualification: NOT RUN.

Remaining/next: `/api/runtime/setup` remains false/null until the verified producer adapter exists. The old SDK scope checker is temporarily retained only as migration code; legacy headless bearer self-calls are no longer accepted, and later phases must retire execution paths rather than restoring a bypass. Next publish the approved producer canonical conversation/read-only receipt prerequisites and implement BE02 self-hosted history/create/reload adapter, then BE03 single command ownership. Remote SHA/tree/journal and exact-commit CI checked after publication; absent CI is not a pass.

## BE02 — Canonical self-hosted conversations and history — 2026-10-03

Status: canonical conversation-storage implementation and isolated consumer integration checkpoint complete. Command execution/live events remain explicitly gated for BE03; this is not a full release, deployment or live-provider qualification. Previous published Dots phase `c7a7e7d8b77c5af2ad603cd5583af50aacd8d15f` (BE01). Producer prerequisites published separately at `2322ee12cceaa376e6eed9a93b4bbf4018c51d53`, then title repair `44eec9a9650414aef3e95ef6bf78eebedbb92265`; exact remote trees/journals verified.

Changes:

- Production now starts a self-hosted BFF, owner sessions and workspace storage, with no Intelligence history/creation dependency, legacy execution timer, local model loop or managed channel startup. Legacy modules remain non-imported migration/test seams, never a failure fallback.
- Added a bounded server-owned stdio launcher with strict method/schema allowlists, exact clean Git/source/schema pins, sanitized child environment, fixed no-shell Git checks and producer identity verification. Owner/runtime credentials are not browser inputs. Null live handles correctly represent conversations that have not built an agent.
- Added durable operation/intent admission before create/rename/archive; read-only original receipt recovery; conflict detection; metadata CAS; canonical list/title search/history/export and stable page-plus-Dot reservations under concurrent requests. Unknown outcomes are retained and inspected rather than replayed by GET.
- Wired authenticated canonical routes to the existing frontend. History preserves stable message IDs, oldest-first UTF-8 chunks and source offsets; duplicate chunks deduplicate, conflicting/gapped chunks fail, and partial/sanitized/omitted content is visible. Browser accumulation is bounded rather than silently dropping earlier text. Auth and object grants are rechecked after reads and before export chunks.
- Preserved native Space/Dot/page navigation and manual revision-checked edits. Updated README/setup/config documentation and added an explicit real-stdio qualification command.

Actual integration exposed two producer defects: repeated default titles and compressed-lineage renames returned409 due to a legacy globally unique session alias. The separately published canonical display-title repair fixes both without inventing Dots-only titles or changing wire schemas. Final consumer tests repeat the originally failing cases against the repaired published source.

Final pins: producer `44eec9a9650414aef3e95ef6bf78eebedbb92265`; generated TypeScript SHA256 `d29c02608340ab65cb5b5f7b1b66bb8bb253a5c27bf89bab0ee4c4a193740f64`; OpenRPC SHA256 `c81c3c53e0bee325d172617551adb2350f463a4383a744b67fe29347c339ee29`. Node24.19.0 / Python3.12.14, isolated temporary profile/SQLite state; no provider construction or model calls.

Checks:

- `RYOKO_TEST_PYTHON=/tmp/dots-backend-python/bin/python RYOKO_TEST_CHECKOUT=/workspace/scratch/42f2baf55663/ryoko-agent npm run test:runtime-stdio`: PASS, 4/4 actual Node-to-producer tests, including duplicate titles, compression rename, 400KB Unicode pagination, hidden/system/tool exclusion, page races, CAS, archive/restore/export denial, and owned SIGKILL/restart/original-receipt recovery.
- `npm test`: PASS, 59 files / 309 tests; two external-stdio prerequisite tests skipped in the default command and passed separately above. Skips are not counted as integration passes by default CI.
- `npm run check-format`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`: PASS. Two generated-file unused-disable warnings and the existing approximately1.08MB browser bundle warning remain nonfatal and visible.
- New source-drift checks reject another commit, staged/unstaged implementation changes with unchanged schemas, and hidden index flags. Shuffled identity JSON keys are accepted by field comparison; changed identity is denied.
- Browser/visual, actual target-host and live-provider gates: NOT RUN. Source/interpreter/host trust is documented, not called cryptographic host attestation.

Next/limits: BE03 must deliberately qualify normal producer configuration/provider use, reconnect, one command admission owner, receipt/message linkage, and live history tail reconciliation. BE02's passive JSON-profile/no-dotenv restrictions are staged safeguards, not permanent product exclusions. Safe transcript export excludes private runtime/tool data and is not full backup/import. Later approved producer capabilities remain separately integrated; no unsupported control is advertised ready merely because conversation storage works. Remote commit/tree/root journal and exact-commit CI are verified after publication.

## BE03 — One durable command owner and canonical recovery — 2026-10-03

Status: implementation checkpoint with isolated real SDK/stdio qualification; not live-provider, browser, target-host or production acceptance. Previous published Dots phase `201e029b95fbcdcde0fd01ede467bee66e3b32b0` (BE02). Approved producer prerequisites now pinned at `9c39b3cbc7d23c65782e0f73f8c8102d07955e2e`; generated TypeScript SHA256 `418386827d1d1a12e8c20c1b8e7d3081a6f317aea270da52262cec5f52fc12ca`, OpenRPC `1bf4ab3a304834538db5e379a06ce7e3b37acd53c8e0b193808d10a4fd5b447a`.

Changes:

- Added one SQLite-backed command admission ledger with immutable operation/digest/context/authority records and a shared namespace preventing conversation/command operation collisions. Lost responses recover only through canonical receipt inspection; conflicting input is rejected, and no GET/reconnect resubmits input.
- Explicit conversation connection negotiates the producer execution adapter. Server-owned startup/reconnect resumes only eligible accepted work; claimed uncertain work remains inspectable. Browser detach, request abort and auth expiry never cancel a mission. Explicit cancellation targets the exact run and revision and reports request acceptance separately from provider acknowledgment or external effects.
- Replaced frontend input ownership with durable pending commands, canonical committed input/message linkage, bounded live-history tail reconciliation and distinct accepted/executing/completed states. Per-operation inspection backoff prevents unavailable records from starving active runs. Original draft/source identity survives remount and lost responses.
- Qualified safe YAML and narrowly scoped provider configuration. The strict producer reads profile-scoped secrets, so the owner-provisioned profile `.env` must exactly match reviewed server configuration; Dots verifies it and never writes credentials. Interactive first-run profile updates are explicitly disabled in reviewed command fixtures. Arbitrary dotenv/global configuration remains rejected. Diagnostics/private live notifications never become browser output; unsupported producer requests fail closed.

Evidence: Linux x64, Node24.19.0 / Python3.12.14, temporary isolated profiles/SQLite databases, real producer entrypoint and actual SDK HTTP serialization to a loopback-only mock. No real provider, user secret, deployment, channel message, executor or LAYA activation. Initial integration attempts correctly failed on missing profile credential scope and automatic first-run config mutation; fixed configuration qualification without weakening producer identity/secret guards. A final fixture assertion was corrected to recognize the SDK's read-only loopback model-metadata probes (all returned404), while asserting exactly four model POSTs.

Checks and final qualification results are recorded below before this checkpoint is published. Browser/visual QA remains blocked by the previously documented Chromium/socket and cloud-browser loopback restrictions; zero browser assertions passed. Full consolidated repository and deployment/migration qualification remain BE12. BE04 next wires exact approval, mission/effect/delivery projections and global runtime pause without claiming unavailable controls complete.

Final BE03 checks:

- `RYOKO_TEST_PYTHON=/tmp/dots-backend-python/bin/python RYOKO_TEST_CHECKOUT=/workspace/scratch/42f2baf55663/ryoko-agent-dots-integration RYOKO_TEST_LONG_RUN=1 npm run test:runtime-stdio`: PASS, 2 files / 8 tests,106.56seconds. Includes95-second held request, one canonical input under duplicate submission, conflicts, history links, explicit exact run controls, queued cancellation without provider invocation, restart and read-only uncertain receipt recovery.
- Focused ten-file command/history/provider-scope suite: PASS,49 tests;3 prerequisite-dependent stdio tests skipped in this command and all passed in the separate actual-stdio command above.
- `npx tsc --noEmit`, changed-source ESLint, changed-file Prettier and `git diff --check`: PASS. Journal formatting was corrected before publication.
- `npm run build`: PASS; existing nonfatal approximately1.09MB browser bundle warning remains.

Publication: BE03 implementation, focused regressions, documentation and this root journal share one direct-main checkpoint. Exact remote SHA/tree/journal and CI are verified separately after publication. Missing/pending CI is not called a pass. No PR or deployment was made.

## BE04 — Exact controls, reviews, missions and immutable delivery — 2026-10-03

Status: implementation and isolated real stdio qualification checkpoint; browser/live-provider/target-host acceptance remains unqualified. Previous remote BE03 `10588f1c1280ba918e4b6c5a9210791dd36ef023`, tree `cc1cfaa6692291f28c053a7f4b626a1ab2483ee6` and root journal verified. Retained local BE03 checkpoint `d6b221d495a1358efc7adc1fcf20cdb61f684716` has the identical tree. Producer remains pinned `9c39b3cbc7d23c65782e0f73f8c8102d07955e2e`; exact TypeScript/OpenRPC hashes unchanged, generated consumer subset expanded only for actual methods.

Changes:

- Added a durable control operation namespace and exact conversation-bound owner/profile pause, mission controls, approval detail/decision, unresolved effect and immutable delivery inspection. All controls use the full scoped path/intent digest, stable operation identity, verified actor/live binding and post-read grant fences. Recovery never dispatches again. Unknown unkeyed mission/delivery mutations remain inspectable rather than assumed successful.
- Exact review decisions require a current persisted presentation fingerprint, matching approval digest/content/target/recipient/versions/expiry and current grants. Producer immutable reviews have no mutable revision field; documented browser revision0 sentinel is not invented authority. Only `runtime.approval.resolve` is used; no generic command approval or independent local effect occurs.
- Owner/profile pause preserves accepted work, blocks new admission/scheduled dispatch, and fences subsequent effect boundaries while explicitly reporting already dispatched work may finish. Run cancellation, mission cancellation, provider acknowledgment, rollback and effect reconciliation remain separate.
- Added bounded result-availability forwarding only, whole-object chunk/digest verification, opaque browser receipt admission and explicit text/artifact component acknowledgment. No private prompt/token notifications or producer attempt tokens are forwarded. ACK response loss recovers by original status only across restart. Explicit immutable-output retry obeys producer attempt/backoff/budget and never reruns inference/effects.
- Wired Activity to a selected, explicitly connected conversation and exact server envelopes; missions/checkpoints/next steps/blockers/reviews/effects/delivery retain their independent facts. Fixed two staged frontend gates discovered during integration: canonical Chat was hidden before the very connection it needed, and unavailable global control was treated as acknowledged pause. Conversation availability now permits rendering/creation; runtime admission remains server-authoritative.

Actual integration: Linux x64 Node24.19.0/Python3.12.14, isolated temporary homes/SQLite and loopback SDK fixture. Real BFF→Python control tests prove preconnect read denial, persistent pause across restart, paused input with0 provider calls, exact resume and1 provider call, bounded empty projections, and forged/foreign denials. A pending exact café-content review is seeded through the official producer store under the actual active run/lease; deny commits, injected response loss yields unknown, original-operation GET recovers accepted, and duplicate never resolves a second time.

Real immutable delivery tests prove >65KB chunk reconstruction, actual result notification, matching immutable retry after persisted backoff, independent text/artifact receipts, artifact ACK committed with lost response, full BFF/producer restart and original status-only recovery to delivered. Exactly1 model request and no repeated ACK or inference. These are local synthetic-service integrations, not external provider/channel delivery or human-read evidence. No actual executor, Slack, voice, credential provisioning, migration, LAYA or deployment activation.

Final gate results follow before publication. Browser/visual remains blocked by the previously recorded sandbox/browser restrictions; no browser assertions passed. Next BE05 integrates the native page/artifact executor under the same exact producer effect authority. No unqualified surface is called production-ready.

Final BE04 checks:

- `RYOKO_TEST_PYTHON=/tmp/dots-backend-python/bin/python RYOKO_TEST_CHECKOUT=/workspace/scratch/42f2baf55663/ryoko-agent-dots-integration npm run test:runtime-stdio`: PASS,4 files/10 tests,20.32seconds. BE03’s separate95-second hold remains passed evidence; this consolidated quick command covers all four actual stdio families without repeating that optional delay.
- Focused nine-file controls, delivery, result UI, initial Chat readiness and command-recovery regression gate: PASS,89 tests,2.55seconds.
- `npx tsc --noEmit`, changed-source ESLint, changed-file Prettier, `git diff --check`, and `npm run build`: PASS. Existing nonfatal bundle-size warning remains. One intermediate UI test used the old unavailable-delivery wording while the qualified result UI was being integrated; updated the assertion and reran successfully.

Publication: BE04 source, frontend wiring, typed generated subset, regressions, adapter documentation and this root journal are one direct-main checkpoint. Exact remote commit/tree/journal and exact-commit CI are verified after publication; absent CI is not a pass. No PR, migration/cutover or deployment requested.

## BE05 — Native page and artifact effect integration — 2026-10-03

Status: implementation and isolated native effect/stdio qualification complete; browser/live-provider/target-host acceptance remains unqualified. Previous remote BE04 `c5a86242708659baa20bbff2d9968fa6c38a6776`, tree `9f4cfb56a70463500542984484f542af14312fcd`, root journal blob `88ce3d37e1be660f41610f4e3632bffe516351f3` verified. Producer remains pinned `9c39b3cbc7d23c65782e0f73f8c8102d07955e2e`. Objective: one native page byte authority with immutable versions, exact broker effect/approval dispatch, CAS/manual edit preservation, scoped verified artifacts and inspection-only lost-response recovery. Native callbacks must derive actual current peer/run/lease/project/grant evidence; browser JSON is never authority. No real provider, credentials, executor, external channel or deployment activation.

Changes:

- Native page store now retains immutable version bytes/digests for manual and agent writes, with atomic page-head CAS, snapshot, lineage and original effect receipt. Exact producer canonical JSON (including ASCII Unicode escapes) is preserved; approved bytes are never trimmed or silently converted. Owner archive/restore remains revision-checked and retains history.
- Added schema-pinned bounded page read/dispatch/inspect/approval callbacks to the owned stdio peer. Registration validates actual producer project ownership/grants against reviewed server mappings before advertising native page tools. Actual command-claimed/effect evidence proves run/lease identity; no guessed generation or client-selected authority.
- Exact native human review uses its original waiting producer tool; no second generic resolution or independent local write. Withdrawn native review identity persists, and the UI preserves producer status while disabling dead/withdrawn decisions. Callback withdrawal is matched by exact request ID/session/method and blocks delayed pre-dispatch work; already committed bytes remain inspectable, never rolled back or replayed.
- Added required Dot-scoped immutable artifact list/download, byte/digest verification and safe native JSON preview. Added archive UI with autosave-before-CAS and late-view fences; archived source conversations block new inputs/native writes while reads and cancellation remain available. Activity can explicitly inspect original native effect receipts without replay.
- First verified project mapping can advance authority; the frontend independently refreshes selected-Dot setup and accepts only that exact higher same-identity scope. Foreign/decreasing/contradictory scope remains denied. Reconnect supersedes old native context, lease evidence refresh is serialized, auth is fenced outside uncertainty catches, and recovery uses exact effect IDs/actual original run scope instead of the first200 unrelated effects. Context/cache bounds are explicit and preserve selected-page routing.

Evidence: same Linux x64, Node24.19.0/Python3.12.14 and exact producer9c39b3c source hashes as BE04. Isolated temporary profiles, policy-granted project fixtures and loopback SDK only. Actual Node→Python test covers fresh unmapped project bootstrap, exact manual prepare, native commit with a deliberately lost callback response, later owner CAS edit, full BFF+producer restart and original receipt recovery, real model tool discovery/read/propose, exact human approval callback, one native model save, immutable digest download and archive/cancel boundaries. No real credentials/provider/executor/channel, production migration or deployment activated.

Review exposed real defects before publication: stale reconnect context, concurrent lease-evidence refresh, oldest200-effect recovery truncation, swallowed post-prepare auth revocation, archived-source write gaps and ignored producer request withdrawal. Each was fixed and regression-covered. A real producer fixture also confirmed withdrawn native waiters could otherwise fall through generic approval; the new classification prevents that without forging producer decisions.

Final checks:

- `RYOKO_TEST_PYTHON=/tmp/dots-backend-python/bin/python RYOKO_TEST_CHECKOUT=/workspace/scratch/42f2baf55663/ryoko-agent-dots-integration npm run test:runtime-stdio`: PASS,5 files/11 tests,22.88seconds; covers all previous command/control/delivery paths plus the native page path.
- Focused15-file native callback/store/runtime, artifact/archive/connection/review UI and existing page/editor regression gate: PASS,88 tests,3.65seconds.
- `npx tsc --noEmit`, changed-source ESLint, `npm run build`, `git diff --check`: PASS. Changed-file Prettier required normalizing the newly generated notification array; generator now formats its provenance JSON consistently, and the final formatting check passes. Existing nonfatal browser bundle warning remains.

Publication: BE05 source, typed subset, frontend, regressions, documentation and this shared root journal are one direct-main checkpoint; remote SHA/tree/journal and exact-commit CI verified separately after publication. Missing CI is not a pass. Browser assertions remain0 due the documented environment restriction; live-host/provider qualification and complete cross-surface release acceptance remain BE12. Next BE06 integrates stable specialist identities, isolated memory and reviewed skill lifecycle. No PR or cutover.

## BE06 — Stable identities, isolated memory and reviewed workflows — 2026-10-03

Status: integration in progress; no BE06 release acceptance claimed. Previous remote BE05 `ce681cc009ce2a39f4a5bf889f6e5b7703acc7f2`, exact tree `99ba2e2e59ea4824f53026f9eb5cca66e825e217` and journal blob `d683e961b15b7f1067c3428c4197c35e8c3d1aac` verified. Objective: actual managed specialist identity/session binding, isolated built-in specialist memory, primary personal-harness-only status, explicit evidence/workflow/evaluation/review/publication and pinned skill delivery/rollback. No personal-harness fallback, global memory injection, automatic legacy enrollment or LAYA activation. An actual workflow manifest review exposed a benign base64-JSON/JWT false positive in the pinned producer; publication remains fail-closed pending its narrowly scoped reviewed fix and new source pin.


Implemented BE06:

- Stable producer primary/specialist mappings, verified frozen session identity and explicit named handoff/status; display rename cannot grant authority. Copies get distinct memory namespaces and no inherited live project ACL. Configured project mappings are intersected with actual producer grants and page context is rechecked before command dispatch.
- Primary personal-MCP status stays literal; unsupported mutation/export/delete never falls back to built-in memory. Specialists have exact namespace-bound CAS correction/tombstones and digest-verified revision-bound export. Owner-global legacy memory and frozen conversation enrollment are read-only primary inventory, not silently enrolled data. Changed/deleted legacy bodies are unavailable instead of fabricated.
- Scoped evidence, immutable workflow/style versions, deterministic evaluation, exact accept/decline, full project-scoped output-byte review, publication and named specialist version delivery/rollback use real producer contracts. Existing sessions remain frozen; delivery affects future sessions. Explicit reviewed decline cancels only its original artifact-control preparation, preserving the actual cancellation receipt and preventing later publication; it does not fabricate a producer approval-denied status.
- Frontend uses authenticated conversation-scoped identity routes, retained original-operation recovery, exact review bindings and explicit project selection. Broader team orchestration and primary-harness mutation remain unavailable where the producer does not supply them.

Producer prerequisite: published `3453afefce2b21947390fac0e03d9eaa67f326e9`, tree `ed2801696dd28e144e8325073ffeb81f764e5ca3`, lowercase producer journal blob `74bc3849c476f67a21df9e2f2309dda90cdcce68`, verified on main. The reviewed change scans validated decoded workflow JSON rather than mistaking its base64 wrapper for a JWT; decoded content, action and binding metadata remain secret-scanned. Genuine secret and malformed encoding/digest/MIME cases remain denied. Producer focused canonical gate:24 passed; generated contract hashes unchanged. The original local checkpoint is preserved. GitHub exposed no runs/statuses, which is not a CI pass.

An isolated repo-prescribed PM environment now provides supported Python3.14.7, with frozen declared dev/test dependencies and a10-test canonical smoke. The existing3.12 evidence remains accurately labeled. Final BE06 consumer/actual-runtime checks follow before publication. No real credential, personal harness, external provider, migration, deployment or LAYA activation.

The clean supported environment exposed a consumer dependency defect: isolated profile validation imported undeclared PyYAML. The validator now uses the producer-declared ruamel.yaml safe loader while retaining Python isolated mode and strict profile/owner validation. Actual workflow decline also proved that artifact-control reviews cannot use active-runtime-run approval resolution; decline now records the reviewed intent and cancels the exact original artifact-control command through its real contract, with no fabricated approval status.


Final BE06 checks:

- Supported Python3.14.7, Linux x64 Node24.19.0, clean published producer3453afef: actual Node→Python isolated smoke PASS,36.09seconds. Distinct records stay isolated between two specialists in both directions; unrelated specialist/global legacy bytes never enter named-child model input. Copy/revocation, real named handoff, exact-byte output and manifest publication, cancelled-preparation publication refusal, frozen upgrade/rollback and correction/delete/export pass. Traffic stays on loopback synthetic SDK; no live service claim.
- Paired actual-runtime/identity service gate:30 tests PASS. Final assembled client/UI/service/binding gate:60 tests PASS. An intermediate assertion retained the old decline label after the truthful cancellation correction; only the expected label changed and the full four-file focused gate was rerun successfully.
- Final TypeScript, changed-source ESLint, changed-file Prettier, production build and diff checks PASS. Existing nonfatal bundle-size warning remains. The runtime-stdio runner now includes identities instead of a duplicate page entry.
- Browser assertions remain0 under the documented environment restriction. Live personal harness/provider, hardware executor, external Slack/voice, migration/host deployment and consolidated release acceptance remain separate gates. Supported owner-memory capabilities that the producer lacks are explicitly unavailable, never represented as completed erasure or fallback.

Publication: BE06 source, frontend, exact typed subset/provenance, tests, guide and this root journal form one direct-main checkpoint. Remote SHA/tree/journal and exact-commit CI are verified after publication; absent CI is not a pass. Next BE07 connects the real single-authority scheduler and trusted legacy retirement adapter.

## BE07 — Single-authority schedules and trusted legacy retirement — 2026-10-03

Status: integration in progress; no BE07 release acceptance claimed. Previous Dots remote BE06 `a82096697d3e4d8ccf351c334a54d4daa2f59b5b`, tree `3492987d0705948df80d0b611e28b434e52e8052`, root journal blob `1e3c011a1c68734de7a131d05ff0c16a56a90746` verified. Scope: real producer periodic admission, explicit recurrence/timezone/DST and bounded standing authority, paused immutable schedule creation, exact revision controls, raw occurrence/delivery evidence, trusted durable legacy freeze/retirement and inspect-only uncertainty recovery. No real schedule activation or migration, external delivery, credentials or deployment.

The producer prerequisite reuses its existing admission-maintenance loop, cron tick and per-profile lock; it introduces no Dots execution timer. The explicit stdio scheduler config defaults off. Readiness reports fresh actual maintenance and successful locked ticks rather than trusting a config flag. The ordinary Ryoko cron ticker also covers existing profile cron jobs, so enabling it requires reviewing those jobs; qualification only enables isolated fixtures. Candidate lifecycle/generated-contract/execution gate passed14 tests on supported Python3.14.7. Full Dots HTTP→stdio periodic proof in isolated staging passed71.77seconds:2 completed occurrences, exactly2 loopback provider calls, budget exhausted, actual transport restart between due times, duplicate-create/recovery and cross-conversation isolation. Final published-pin and assembled source checks follow.

Producer prerequisite published and verified on main: `98b9eeb7d2afc02d0e0393fea285f010000a0378`, tree `d471976038ff8e072d37d8540e2a2ef0e5847a32`, lowercase producer journal blob `f81e1af996b6095f0ad3f65cd981a92ea621a0c9`. It preserves the BE06 exact review fix. Generated TypeScript SHA-256 `19fdf11f4aa587d7bcdd58927c0cdbbdec463cfdeaa90003e0ac6284266539d2`; OpenRPC `fa7b08c3edd56190daadeef533928685113fd70a2ae8959b2fb7b61aee5051b2`. Exact blobs/tree verified; original local history preserved. No GitHub Actions runs or commit statuses were configured; absent CI is not a pass.

Implemented BE07:

- Authenticated conversation-scoped schedule adapter rechecks actual canonical session, producer agent/project grants, local scope revision and transport epoch. Browser input cannot invent owner/project/session authority. Create is paused; edit requires pause and produces a new immutable definition. Exact revision pause/resume/cancel/run-now share the durable operation registry and recover original receipts without re-admission.
- UI supports interval, one-time and explicit local calendar recurrence with timezone/DST fold/skip. It shows real scheduler health, remaining checks, raw occurrence/command/delivery states and bounded/truncated history. It distinguishes stopping future admissions from cancelling accepted work; result delivery retry remains delivery-only. Reloaded unknown intent stays inspect-only and blocks changed replacement intent.
- Trusted server-only legacy preparation requires explicit timezone, bounded standing authorization, source mapping and acknowledgement of changed completion-relative versus fixed-anchor interval semantics. Permanent SQL admission fences cover existing Store connections/prepared statements, replacement/move attempts and recovery. Accepted old work may finish naturally; lease expiry or promise cancellation cannot prove an ambiguous effect stopped.
- Legacy source IDs, occurrence IDs and immutable freeze/retirement receipts remain durable and inspectable across restart. Retirement requires original outcomes and proven worker quiescence; unresolved history blocks cutover. More than100 exact historical mappings is refused rather than truncated. No public import/cutover endpoint, automatic migration, new Dots timer or fabricated foreign verification was introduced.

Focused prepublication evidence:51 current-source migration/schedule/store/runner/app/workspace tests passed with full TypeScript and focused lint/format; frontend staged recurrence/evidence/recovery gate37 tests passed. Final assembled/published-pin results follow before publication.

Final BE07 checks:

- Actual assembled owner-authenticated HTTP→published98b9eeb stdio→real periodic cron/lock→queue→loopback model fixture:PASS,1 test,71.43seconds (73.37seconds total), supported Python3.14.7. Two completed occurrences/exact budget debit, transport restart between due times, original immutable output digest and final text retained after restart with no model replay, duplicate-create recovery, browser import refusal, foreign conversation isolation and observed readiness all pass.
- Six assembled schedule/frontend suites:51 tests PASS. Separate migration/Store/runner/app/workspace gate:51 tests PASS. Counts overlap and are not presented as a sum. Earlier producer focused14 and staged frontend37 remain separate attributed evidence.
- Final TypeScript, changed-source ESLint, changed-file Prettier, production build and diff checks:PASS. Existing nonfatal bundle-size warning remains. Actual periodic test is included in the stdio consolidation runner.

Publication: BE07 adapter, frontend, trusted migration fence, exact producer schema/pin, tests, guide and this shared journal form one direct-main checkpoint. Exact remote SHA/tree/journal and commit CI are verified after publication. No real schedule, migration, channel/provider or deployment activation; browser/target-host qualification remains explicitly pending. Next BE08 wires effect authority through the actual computer execution edge.

## BE08 — Brokered computer and browser execution edge — 2026-10-03

Status: integration in progress; no BE08 hardware or release acceptance claimed. Previous Dots remote BE07 `f6c45374d1fc1eca023218f2fb7ce3d307ee2a56`, tree `9cf75daba74b7887e0ac22eeb73aed9c99123fea`, root journal blob `850e69776c51bb7adadd80ebf36cc7a8b1e4018e` verified. Producer remains published `98b9eeb7d2afc02d0e0393fea285f010000a0378`. Scope: exact broker registration/effect/approval authority through an actual target execution boundary, durable uncertainty/reservations, separate authenticated owner actions, per-Dot credential/container isolation, human takeover/fresh snapshot and truthful per-capability readiness.

Inspection of pinned OpenBot target found only computer-token authentication on direct browser/files/shell routes, without operation-bound durable receipts or dispatch-time grant/control guards. A BFF wrapper cannot close that gap. BE08 therefore adds an in-repo target protocol/executor and opt-in computer image overlay while retaining the pinned supervisor's per-Dot container/volume lifecycle. Every capability remains disabled/unqualified until explicit target-host checks; source implementation and synthetic protocol tests do not certify Docker, browser, shell sandbox or egress. No hardware provisioning, real browser/shell action, credential change or deployment is performed.

Implemented BE08:

- A durable signed target protocol now records immutable operation/effect identity, bounded redacted receipt bytes and single-writer reservations. Permission/control/snapshot fences are checked at actual Playwright, file and isolated-shell primitive boundaries. Unknown outcomes survive target/BFF restarts and block replacement writes; owner actions have separate authenticated identity and never fabricate producer effects.
- Native computer registration and prepare/execute/reconcile use actual producer schemas, immutable per-action policy grants and observed run/lease generation. Page and computer callbacks share one finite router and original held approval waiter; a computer effect cannot fall through to the page executor or generic duplicate approval resolution.
- Authenticated executor discovery uses the actual immutable executor ID rather than assuming it equals a Dot ID. Owner controls, snapshots/screens, audit, manual exact review and original-operation recovery are wired. Fresh observed target identity is required before setup advertises capability, avoiding a hidden readiness/discovery cycle. Revoke/takeover fence immediately; handback requires a fresh real snapshot. Supervisor lifecycle uncertainty stays unknown where no operation-bound supervisor receipt exists.
- Host qualification binds protocol, owner Dot/executor, individually reviewed actions, immutable target build/configuration digests and evidence kind. Target status and every signed request must match that identity; unrelated or upgraded target builds cannot reuse old acceptance. Production rejects synthetic evidence. No production receipt is created, and absent qualification keeps real capabilities unavailable.
- Target network requests retain public-address validation, per-request DNS pinning, redirect rejection, bounded bodies and header filtering. Real shell implementation requires bubblewrap namespaces with no fallback, cleared environment and writable workspace only; this source design is not a verified containment or egress claim. Existing supervisor-only Docker access, per-Dot HMAC credentials and persistent isolation remain. New opt-in image/Compose specimens are not deployed.

Integration caught a setup feature-key mismatch (`computers` versus the contract's singular `computer`) that falsely reported disconnection; corrected and covered by the actual path. Clean supported-Python fixtures now consistently use the producer-declared hermes_yaml wrapper instead of undeclared PyYAML. Exact Unicode computer inputs are reviewed through the complete action projection and verified unchanged at the target.

Current evidence: BFF/core/page-router/frontend focused six-file gate110 tests passed (core28, coordinator32, page17, router11, frontend22). Actual Python3.14.7→signed loopback target test passed11.28seconds, including exact reviewed Unicode write, injected target-response loss, fresh edge-client/BFF/Python restart, original receipt recovery, connected foreign-conversation404, one dispatch and zero model calls. This uses a deterministic in-memory file driver and explicitly synthetic target identity; it is not real hardware execution. Final assembled target/native gates follow before publication.

Final BE08 checks:

- Final paired actual native page/computer stdio gate:PASS,2 files/2 tests,17.48seconds, supported Python3.14.7 and exact producer98b9eeb. This protects existing human page approval/native save/recovery while proving signed computer target commitment, response loss, fresh client/BFF/Python restart and inspect-only recovery. Synthetic target identity/driver only.
- Final target/computer/security/transport/research gate:65 tests across9 suites PASS, plus target TypeScript, focused lint/format. BFF/page-router/frontend gate110 remains separately attributed; counts are not summed because coverage overlaps.
- Final parent TypeScript, changed-source ESLint, changed-file Prettier, production build and diff checks PASS. Intermediate fixture-only issues (missing isolated provider/per-action policy config, new target fingerprint envelope and exact frontend outcome/scoped404 expectations) were corrected without weakening runtime guards. An ESLint const warning in the new fixture was corrected. The consolidated stdio runner now includes computers.

Publication: BE08 target protocol/executor, broker adapter, frontend, pin subset, focused tests, optional image/Compose sources, guides and this root journal form one direct-main checkpoint. Exact remote SHA/tree/journal and commit CI are verified after publication. No operator qualification receipt, actual computer/browser/shell action, container provisioning, volume migration or deployment was performed. Mandatory real-host, browser, supervisor, sandbox/egress, durable-volume and backup gates remain false; production readiness is not claimed. Next BE09 integrates the durable voice/call-to-compute path.

## BE09 — Durable voice and call-to-compute lifecycle — 2026-10-03

Status: integration in progress; no BE09 live voice or release acceptance claimed. Previous Dots remote BE08 `7a24b5d82eaef74faadafca102473285ef834c32`, tree `99ac6c33ee883bbeee0dcf550d0d8f59f232199c`, root journal blob `bdc87c18e9aa6c602475b4bb3f33747f383cdd49` verified. Producer remains98b9eeb. Scope: durable owner/call/speaker/session identity, bounded media/compute admission, canonical Ryoko command handoff, immutable result delivery, separate hangup/detach/cancellation and honest unconfigured media/provider status. Media providers must not become a second task/tool owner. No real microphone/playback, credentials, model downloads, external provider or deployment activation.

Staged baseline has84 focused passes and2 opt-in stdio skips, with actual consumer HTTP/loopback media fixtures, type/lint/format checks. These are staged/synthetic evidence, not final assembled or live voice acceptance. Final integration preserves BE08 options, authenticated status/authority and native routing; published-pin actual compute qualification follows.

CI reporting clarification: Dots contains `.github/workflows/ci.yml`. GitHub's exact-commit API observations returned zero Actions runs and zero commit statuses; earlier wording that CI was not configured was too strong. No external CI result has been verified for these checkpoints. Local exact-tree checks remain the separately recorded evidence; missing runs/statuses are not passes.

Implemented BE09:

- Durable call, owner/speaker/session, transcript and compute identity; bounded media-time/compute reservations commit before provider/command admission. Canonical command UUIDs are reserved once and global operation IDs cannot cross families. Duplicate, changed or uncertain input inspects original evidence instead of dispatching again.
- Optional realtime media remains a conversation/audio shell with only the scoped compute bridge. Ryoko owns all task/tool admission, policy, reviews and completion. Provider conversational captions are labeled separately from verified immutable Ryoko results; no hangup summary or fallback model task is generated.
- Frontend requires explicit runtime connection before media admission. Call status, generic original-operation recovery, current owner/grant/call fences and bounded transcript events are wired. Hangup/detach, media stop and command/mission cancellation remain separate. Canonical pause ends media without cancelling accepted work; resume never starts a call.
- HTTP requests drain before voice receipt stores close, and voice shutdown drains mutations/known media before canonical transport. Unknown provider hangup/reservation remains retained for operator reconciliation. Whole process-tree/host deadline and backup consistency are still BE11/12 gates, not inferred from this ordering improvement.
- No realtime configuration is supplied; key/model alone is insufficient qualification. Existing finite local STT/TTS contracts remain explicitly unavailable in this realtime UI, with no downloads or fabricated streaming support. No personal harness, external voice service, microphone or speaker was activated.

Actual published-pin voice compute proof:Python3.14.7 and producer98b9eeb, real Node→Python command path with loopback model and synthetic media only,PASS13.55seconds. Exactly1 canonical command and1 model execution survived duplicate POST, recreated app routing, owner pause while provider was in flight, hangup, resume, completion and full BFF/Python restart. Committed result bytes/digest stayed identical; detached speech remained null, with no mission cancellation or delivery ACK. This is compute/protocol evidence, not actual audio/provider qualification.

Final BE09 checks:

- Actual published-pin stdio compute fixture:PASS,1 test,13.55seconds total (10.84seconds test), exactly1 command dispatch/1 loopback model request and0 mission cancellations/0 delivery ACKs. Synthetic media only.
- Final integrated voice plus BE08 adapter regression:98 tests across9 files PASS, no skips. Earlier staged84/2 skips and initial38 checks are separate historical evidence, not summed.
- Final TypeScript, changed-source ESLint, changed-file Prettier, production build and diff checks PASS. Formatting the new stdio fixture resolved an intermediate format-only warning; the final targeted check passed. Existing nonfatal bundle-size warning remains. Consolidated runtime runner now includes the voice stdio proof.

Publication: BE09 durable voice/media boundary, frontend provenance/connect gate, startup/routes, tests, guide and this shared journal form one direct-main checkpoint. Exact remote SHA/tree/journal and observed commit CI are verified after publication. Live microphone/playback/provider, latency/cost/quotas, unknown-media operator reconciliation, process-tree shutdown and host backup/cutover remain unqualified. Next BE10 replaces managed Slack ingress/delivery with the scoped self-hosted adapter.

## BE10 — Self-hosted Slack ingress and immutable delivery — 2026-10-03

Status: integration in progress; no BE10 live Slack or release acceptance claimed. Previous Dots remote BE09 `ef7e679e00bf208dd17cb5eac20f997149e4d045`, tree `dd30c40774eddc6c30aab1ab0317a21eb65be9c1`, root journal blob `b441d016a2e9641ec6a5b6ff4a6421b2a8ebab52` verified. Producer remains98b9eeb. Scope: signature-verified bounded ingress, explicit owner/actor/channel standing reply authority, durable inbox/thread/outbox identities, one canonical Ryoko command per accepted input and exact immutable reply reconciliation. Signed events alone must not grant access to private context. No real workspace installation, credential setup, external Slack message or deployment.

Staged baseline has54 focused passes and a separate59-pass/8-stdio-skip selection with type/lint/format/build checks. Final assembly and real published-producer/loopback Slack proof follow; staged fake producer responses are not counted as actual producer qualification.

Implemented BE10:

- One self-hosted signed-events ingress replaces the managed channel route. Exact team/app/channel/human pair authorization, signature age/digest, owner identity and bounded payloads gate admission; bots/edits/reactions do not become commands. Thread/event identities and inbox/outbox state survive restart and dedupe across web/channel paths.
- Separately reviewed, expiring actor/channel standing authority explicitly covers primary-context original-command replies to the original thread, bound to exact runtime identity/project scope. Technical allowlists or HMAC alone do not authorize private-context disclosure. Before admission, result read and send, actual enrolled primary/project grants and current server policy are rechecked. Policy changes/removal fence existing work rather than silently repurpose private history.
- Replies come only from verified immutable canonical results. Original destination, bot author, ordered immutable block markers/text and exact Slack timestamp prove delivery. Accepted-send response loss stays unknown until bounded authenticated inspection finds the original message; absence is never permission to resend. Only explicit429 rejection permits bounded paced retry. No replayed inference, fabricated mission ID or premature producer delivery ACK.
- Frontend channel status/provenance and nullable mission identity match producer facts; receipt inspection is an authenticated POST with original operation identity. Artifacts remain owner-authenticated result links rather than public uploads. Runtime defaults off, competing managed/socket/producer ingress is rejected, and no credentials/installations/messages are activated.
- Startup/connect and stop are ordered so a shutdown race cannot leave a new sender active after its ledger closes. Broader process-tree, quota, actual workspace permissions and operational gates remain explicit.

Actual published-pin channel proof:Node→Python3.14.7/producer98b9eeb→loopback model→durable outbox→loopback Slack,PASS12.49seconds. Accepted send deliberately loses its response; full producer/channel restart, duplicate signed event and authenticated exact bot-marker reconciliation retain exactly1 command,1 model call,1 Slack POST and1 inspect, with0 producer delivery ACKs. This is actual local protocol integration with synthetic credentials/services, not a real Slack workspace qualification.

Final BE10 checks:

- Actual published-producer stdio/loopback channel fixture:PASS,1 test,12.49seconds, exact command/model/send/inspect counts above. Final current-checkout focused suite:57 tests across5 files PASS. Staged54 and broader59/8 skips remain historical attributed evidence, not summed.
- Final parent TypeScript, changed-source ESLint, changed-file Prettier, production build and diff checks PASS. Existing nonfatal bundle-size warning remains. Consolidated stdio runner now includes Slack.
- Startup/shutdown, inspection drain and local-pause races are covered. Authority-history changes after the first durable input remain fail-closed pending separately reviewed migration. Live app membership/scopes, actual rate limits, provider behavior and external delivery are not certified by the synthetic service.

Publication: BE10 signed ingress, durable inbox/outbox/bridge, frontend, configuration specimens, tests, guide and this root journal form one direct-main checkpoint. Exact remote SHA/tree/journal and observed CI are verified after publication. No external message, credential provisioning, channel installation or deployment occurred. Next BE11 integrates legacy archives, operational readiness, consistent offline recovery and production-only packaging.

## BE11 — Migration archives, operational boundaries and recovery — 2026-10-03

Status: integration in progress; no real migration, deployment or full-host recovery acceptance claimed. Previous Dots remote BE10 `bd8c7f4d354f36e267575bdeaa6dcad169156a83`, tree `7c80608e195cbca9a9a9d8fc4a166b233d6915a3`, root journal blob `78ec97b52ce710b7357011ca73095daf50212a2e` verified. Producer remains98b9eeb. Scope: read-only legacy inventory/imported archives, provenance/original links and tombstones, independent readiness/redacted diagnostics, safe drain/process/store ordering, consistent offline paired recovery and production-only self-hosted packaging.

Staging exposed real shutdown/maintenance defects: expired shutdown deadlines could close SQLite while adapter work remained, and a lifetime wrapper blocked on child wait before escalation. Corrections track native callback drain, prevent recovery reconnect while stopping, avoid closing shared stores on forced exit, and retain the state gate through actual owned Python descendants. Synthetic TERM-ignoring and wrapper/Node SIGKILL fixtures prove known children retain exclusion; they do not establish a full host census or cover escaped/independent/remote executor writers.

A first offline dependency install lacked one cached tarball; a bounded normal official-registry `npm ci --omit=dev` then succeeded in isolated staging with159 packages. Final compiled production-only boot and assembled operational checks follow. No package/network/security setting or running deployment was altered outside the isolated build/test workspace.

Implemented BE11:

- Owner-pinned dry-run inventory and resumable inert history/archive import preserve original IDs, source digest/count evidence, quarantined conflicts and tombstones. Authenticated plain-text archive UI resolves stored source-qualified original IDs, never hashes guessed links or replays historical tools/approvals. Real Intelligence export access/conversion is still unavailable and is not implied by SQLite backup.
- Restored retained local metadata/read routes: strict owner-authenticated Space creation, scoped read-only capture disposition and legacy task detail/history. Four focused regressions cover these gaps and denial/no-execution boundaries; legacy task mutations remain retired.
- Readiness observes independently verified recent scheduler, identity/memory/learning, computer and voice/channel evidence; stale/unobserved facts stay unavailable. Bounded metrics and diagnostics omit personal content, audio and raw provider errors. Health reads do not launch providers or provision executors.
- Runtime shutdown drains HTTP/media/recovery/native callback work before closing shared stores; forced timeout exits without falsely declaring stores safe to close. New admissions/recovery reconnect are fenced while stopping. A supervised Linux lifetime gate escalates/reaps known children and explicitly forwards its descriptor to owned Python. Synthetic tests prove exclusion after wrapper+Node death while Python lives. Escaping/independent workers and remote target volumes still require actual host proof.
- Standard npm start/dev and production entrypoint require the same inherited maintenance gate before opening SQLite. Vite HMR remains; backend development uses explicit supervised restart rather than a watcher that could drop the gate. Default non-root native/Compose sources use the gated self-hosted/TLS path; no real service was deployed.
- Offline paired declared Dots/Ryoko databases/artifact resources use digest manifests, immutable provenance, consistent WAL snapshots, atomic no-replace restore and path/symlink/hardlink/active-writer/corruption/storage refusal. Explicitly reviewed co-located computer state is separate; remote volumes are never implicitly covered. Encryption supports an existing age setup, but no age executable/key-recovery or real user-data restore was qualified.
- Retired managed execution packages moved to development-only while preserving legacy source/tests. The67-module production import boundary passes. A clean isolated official-registry install (`npm ci --omit=dev --ignore-scripts --no-audit --no-fund`,159 packages) and compiled static-frontend/server boot passed with synthetic owner, no Intelligence/model/Slack keys, authenticated readiness and clean SIGTERM. Ungated entrypoint is refused before SQLite creation. This does not certify a built deployment image or dependency lifecycle scripts.

Final focused operational evidence:33 Python tests and27 TypeScript tests PASS (including4 retained-route checks); changed-file lint/format, TypeScript, server compile and production-boundary checks pass. Parent final production build and exact checkpoint checks follow. Tiny synthetic restore timing is fixture evidence only, never a recovery-time/data-loss SLA.

Final BE11 checks:

-33 Python and27 focused TypeScript tests PASS, including retained local routes, archive provenance/quarantine, active-writer gates, corruption/storage failures, known process descendants and shutdown ordering. These are isolated synthetic resources, not user migration or restoration.
- Clean production-only dependency installation and final gated frontend/server smoke PASS, including authenticated readiness, absence of managed credentials, orderly stop and ungated-start refusal. Full target images, TLS termination, age/key recovery and remote writer coverage remain unrun.
- Parent final TypeScript, changed-source ESLint, changed-file Prettier, production build,67-module production boundary and diff checks PASS. Existing nonfatal bundle warning remains. Exact lockfile was rebuilt and its separately uploaded blob verified before tree assembly.

Publication: BE11 operations, inert archives/UI, preserved read-only legacy routes, recovery tools, process gates, production dependency/package lock, deployment specimens, tests, guides and this root journal form one direct-main checkpoint. Exact remote SHA/tree/journal and observed CI are verified after publication. No real export, migration, encrypted user-data restore, credential setup or deployment occurred. BE12 now runs final assembled aggregates/protocol journeys and records the release disposition; mandatory live host/provider/export/cutover acceptance remains pending, not silently waived.
