# Current frontend/backend qualification status

Final local qualification is recorded in [backend-release.md](backend-release.md):767 aggregate passes, all16 stdio cases exercised successfully after one fixture correction,175 producer-interface passes, and operational/production-only boot checks. Production readiness remains false; no external gate is waived.

The frontend is now paired with implemented self-hosted BE00–BE11 source. The production entrypoint uses owner-authenticated Dots routes and one pinned Ryoko stdio authority for canonical conversations, commands, controls, native page effects, identities/workflows, schedules and optional computer/voice/Slack adapters. BE11 adds inert imported history, operations/readiness, supervised shutdown and offline recovery tools. Legacy model loops, timers and managed Channels are not production fallbacks.

**Production readiness remains false.** Final assembled BE12 aggregate/stdio/operations results and exact remote commit evidence belong to the current `BuildJournal.md` checkpoint. This document does not invent those results. Source integration and prior isolated local checks do not accept target-host, browser or live-service operation.

## Current contract and evidence boundary

- Producer: `98b9eeb7d2afc02d0e0393fea285f010000a0378`
- TypeScript SHA-256: `19fdf11f4aa587d7bcdd58927c0cdbbdec463cfdeaa90003e0ac6284266539d2`
- OpenRPC SHA-256: `fa7b08c3edd56190daadeef533928685113fd70a2ae8959b2fb7b61aee5051b2`
- Consumer: the final checkpoint containing this update; exact commit/tree/root journal and remote equality must be recorded after publication
- Generated subsets: `src/shared/runtime/producer/provenance.json` and `src/shared/runtime/be06-producer/provenance.json`
- Actual local protocol tests use real Node/owner HTTP → pinned Python stdio, with loopback model/Slack services and synthetic media/computer drivers. They are not live-provider or real-host evidence
- CI workflow exists. Zero exact-commit Actions runs/statuses were observed for prior checkpoints; absence is unverified, never passed. Recheck the final commit

## Current retained, replaced and unavailable behavior

- Canonical chat/history/title search/pagination/rename/archive, stable command recovery, exact reviews, immutable results and page artifacts are integrated; request detachment never cancels accepted work
- Native Space creation and page/editor metadata remain owner-local. Space creation grants no producer project or Dot access. Historical task detail and capture reads are retained, read-only, authenticated and do not start a runtime. New canonical output comes from immutable runtime result/artifact routes
- Stable specialists, isolated built-in memory, reviewed evidence/workflow publication and version delivery/rollback are integrated. Primary personal-harness mutation, supersession, delete, ingestion and export are unsupported at this pin; no built-in fallback or erasure claim
- Schedule creation stays paused. Activation needs current producer scheduler ownership and bounded authority; imported jobs need permanent legacy retirement evidence
- Computers require a matching actual target-host qualification receipt; no endpoint/image flag or synthetic receipt activates hardware
- Optional realtime voice stays off until separately configured and qualified. Producer finite local STT/TTS is not realtime UI support; no model downloads, microphone or playback qualification occurred
- Optional signed-events Slack stays off until separately authorized and qualified. It only replies to the original admitted Slack thread; scheduled cross-channel output/arbitrary web-result sharing are not exposed
- Broader teams/multi-child synthesis and LAYA training/activation remain unavailable/off
- Inert imported history is not a canonical producer replay/import. Actual Intelligence export access/normalization/completeness and provider-specific old-link conversion remain open

## Mandatory acceptance still open

1. Real supported browser interaction/keyboard/visual/narrow-screen/accessibility and assembled cross-surface journeys. The earlier attempt passed 0 assertions and produced 0 screenshots; 21 scenarios did not run due Chromium socket EPERM and supported cloud-browser loopback ERR_BLOCKED_BY_CLIENT. No bypass was used
2. Target-host supervisor/image/browser/files/shell sandbox/egress, hardware takeover, volumes, TLS/proxy, secrets, process-tree writer census and selected provider behaviour
3. Actual microphone/playback/media-provider round trip, cost/latency/quota, and real Slack workspace installation/scopes/delivery
4. Actual authorized history export and normalized-source reconciliation; complete paired state/remote executor inventory; real encrypted backup/restore and key recovery; representative load/disk-pressure and compatible rollback rehearsal
5. Explicit owner/session cohort and deployment/cutover acceptance. No live admissions/routing switch was performed. Accepted or unknown work stays with its original owner and operation through rollback, never replayed through DotAgent

These gates are not owner-accepted scope exclusions. Use [current setup](frontend-setup.md), [the control inventory](parity-inventory.md), phase adapter guides and [BE11 operations](../BE11-operations.md) for exact boundaries.

## Historical FE12-only receipt (superseded for current backend status)

The original receipt below is retained as historical evidence. Its statements that backend adapters were absent, its original producer pin, 244-test count and build hashes describe the FE12 frontend checkpoint only. They must not be applied to the current assembled BE00–BE11 backend. Its blocked browser evidence remains an open gate until a later actual browser receipt supersedes it.

# Historical FE12 frontend checkpoint and backend handoff

## Result

FE00–FE11 frontend implementation checkpoints and the FE12 local qualification/fix checkpoint are published on `main`, each with the exact root `BuildJournal.md`. This is a **frontend implementation handoff**, not a completed integrated release. The paired BE00–BE12 adapters and live acceptance gates remain unqualified. Do not deploy or cut over production traffic from this receipt.

The browser preserves chat/navigation, Spaces/editor, mission/review, specialist/memory/Learning, schedule/notification, computer/research, media/call, Slack/provenance and migration surfaces behind strict same-origin capabilities. It does not create an alternative planner, transcript database, scheduler, policy grant or memory backend. Unsupported features stay unavailable. The old server execution paths remain explicitly legacy until backend migration retires them.

## Source and environment

- Producer published reference: `124931a916c8aa6beeaf60d08dd55ca5d20f6e3c`
- Synthetic producer fixture capture: local `eb6b89fd554bb29cc295732a9b9cba9c3a50a489`; both generated schemas and five pinned dispatcher/schema/test sources are byte-identical to the published reference
- Generated TypeScript SHA256: `73f089aeca65cbc1e90c8a54da0f7d11c144fc160e8d8cc99e28043e9eef1839`
- OpenRPC SHA256: `1d3151320c621de5b7032a4e5fb4ba170fe09fa5400fd762df832bca09622909`
- Consumer source is the Git checkpoint containing this receipt; its exact published SHA/tree is verified separately after commit. Previous FE11 checkpoint: `ac8061458c1cd220071d320bad0d06e2165c69a3`
- Linux x64, Node v24.19.0, npm11.9.0; runtime-local display timezone America/New_York, evidence timestamps UTC. Schedule tests explicitly name their timezone

## Local verification

| Check                                            | Result                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Clean `npm ci` with writable temporary npm cache | Passed, 711 packages installed with lifecycle scripts enabled                  |
| `npm run check-format`                           | Passed                                                                         |
| `npm run lint` including scripts                 | Passed                                                                         |
| `npm run typecheck`                              | Passed                                                                         |
| `npm test`                                       | Passed, 50 files / 244 tests                                                   |
| `npm run build`                                  | Passed, browser bundle plus NodeNext server compilation                        |
| Pinned fixture/source hash check                 | Passed; live transport and producer replay explicitly not run                  |
| Exact remote main/tree/journal verification      | Performed after each published checkpoint; final SHA reported with completion  |
| Remote Actions/commit status                     | No run/status returned for the inspected checkpoint; no remote CI pass claimed |

Production build retains a nonfatal size warning for the approximately1.07MB minified main bundle (approximately330KB gzip). It is recorded, not hidden by raising the warning threshold. No live provider latency or cost was measured.

### Final fixes and regressions

- Preserved a newer draft/source when an earlier message receipt arrives; stored the complete source/text intent and recoverable pending identity across remount rather than accidentally creating a different command digest
- Disabled concurrent exact-review decisions and rejected not-dispatched operations without a false “sent” state
- Preserved pending computer effects, status and emergency controls across tab changes; fenced old-scope errors/file-read output
- Expired authentication clears protected projections once without an unauthorized-response retry loop; owner unlock input is cleared after use
- Added a settings-modal initial-focus fallback and narrow-screen wrapping for immutable identifiers; actual visual/browser validation remains blocked below
- Fixed NodeNext explicit `.js` extensions in new shared contracts, uncovered by the full server build
- Replaced the environment-sensitive synthetic public-host socket test with an explicit numeric-loopback integration fixture and a separate no-socket test for both Node24 DNS lookup callback shapes. Redirect/cancellation and production DNS guards are unchanged

## Actual browser gate: blocked, never claimed passed

The reproducible harness is `scripts/qa-runtime-browser.mjs`, with clearly synthetic `tests/fixtures/runtime/browser-workspace.json`. It includes setup unavailable, pagination/history, lost receipt plus source/remount, newer draft during delayed receipt, A→B scope, exact review, modal focus/Escape, dirty navigation, computer action/tab lifecycle, narrow layout and network allowlist scenarios.

No UI loaded on either available route:

1. Headless Chromium startup failed with local singleton `socket()` permission denied; the approved executor retry failed identically
2. The existing supported cloud browser rejected the loopback fixture navigation with `ERR_BLOCKED_BY_CLIENT`

The outcome is **0 browser assertions passed, 0 screenshots, 21 scenarios not run**. This is not a visual, keyboard or browser-interaction pass. No proxy/OS permission was changed, no tunnel used, and no external test service received data. Temporary QA servers were stopped. The `--serve-fixtures` mode is available for a separately authorized browser-capable environment; it remains a synthetic test, not real integration proof.

## Backend handoff and required acceptance

| Gate      | Required backend proof before readiness                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE00–BE01 | Authenticated service-to-human binding, secure session/CSRF/origin lifecycle, exact producer contract and generation ownership                              |
| BE02–BE03 | Canonical conversation persistence/lineage/history, durable command ingress, complete live transcript adapter, receipt recovery and restart/resubscribe     |
| BE04      | Exact review content/policy binding, mission/effect/cancellation truth, global pause semantics and independent output delivery                              |
| BE05      | One registered native-page authority, immutable artifact versions/receipts, grant rechecks, complete authorized bytes and concurrent edit recovery          |
| BE06      | Stable specialist identities; primary-only personal harness; isolated built-in specialist memory; reviewed immutable Learning publication/delivery/rollback |
| BE07      | One scheduler owner, timezone/DST/overlap/missed-run semantics, imported schedules paused, durable occurrence IDs and notice outbox                         |
| BE08      | Real isolated executor, out-of-band human takeover/emergency stop, fresh snapshot fencing and unknown-effect reconciliation; research safety retained       |
| BE09      | Actual realtime media/hardware/provider qualification, durable compute/call receipts, media lease cleanup independent of accepted work                      |
| BE10      | Real self-hosted Slack ingress/egress, verified team/human/channel mapping, provider event dedup and independent delivery recovery                          |
| BE11–BE12 | Legacy retirement, backup/restore/import/rollback drills, no-Intelligence full-server startup, exact-source browser and live end-to-end acceptance          |

Repeat web→research→page review/edit, specialist isolation, schedule→restart→notice, computer takeover/effect recovery, voice→compute→hangup, Slack→web review→delivery repair and migration→rollback against the real paired backend. Include disconnect before/after admission, process death, cursor expiry, stale review and revoked access. Synthetic fixtures cannot certify any of these live guarantees.

No deployment, credentials, migration, external channel action, live call/computer action or LAYA activation occurred. Full-parity cutover remains blocked; the next authorized engineering scope is the paired backend implementation, followed by the open host/provider/browser gates.
