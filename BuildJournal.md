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
