# FE12 frontend checkpoint and backend handoff

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
