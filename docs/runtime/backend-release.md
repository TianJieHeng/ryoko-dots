# Backend release receipt — 2026-10-03

BE00–BE11 implementation is published. BE12 local consolidated qualification is complete, while production acceptance and controlled cutover remain blocked by the gates below. Nothing was deployed or migrated, and no real provider, Slack workspace or computer was activated.

## Exact source

- Producer: `98b9eeb7d2afc02d0e0393fea285f010000a0378`, tree `d471976038ff8e072d37d8540e2a2ef0e5847a32`
- Full producer TypeScript SHA-256: `19fdf11f4aa587d7bcdd58927c0cdbbdec463cfdeaa90003e0ac6284266539d2`
- Full producer OpenRPC SHA-256: `fa7b08c3edd56190daadeef533928685113fd70a2ae8959b2fb7b61aee5051b2`
- Tested production consumer: BE11 `0cb5f0e5d76f8e429054f3d9eb721d04de84e45e`, tree `bb0cee9e6cfce665aa0d67e099ccd20b0a400dd6`
- This BE12 checkpoint changes release evidence, CI validation steps and one controls fixture, not production behavior. Its exact remote commit/tree/root journal are verified after publication rather than embedded self-referentially
- Environment: Linux x64, Node24.19.0, Python3.14.7; real protocol tests use isolated state and loopback synthetic services

## Checks

| Check                                           | Observed result                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Repository format, ESLint, TypeScript, build    | Passed                                                                                                                                |
| Repository tests                                | 767 passed,11 conditional skips,19.27seconds                                                                                          |
| Runtime contract and production import boundary | Passed;67 local production modules, no retired managed execution imports                                                              |
| Complete actual stdio consolidation             | 15 passed/1 fixture failure,10 files/16 cases,75.95seconds                                                                            |
| Corrected control fixture                       | Passed,13.50seconds; all16 stdio cases now exercised successfully across the run and targeted correction                              |
| Relevant producer regression                    | 175 passed,22 files,166seconds through the canonical per-file runner                                                                  |
| Operations tests                                | 33 Python tests and27 focused TypeScript tests passed; overlaps aggregate coverage                                                    |
| Production-only package install/boot            | 159 packages; compiled frontend/server, authenticated readiness, gated startup, clean SIGTERM; no managed/provider keys               |
| Browser                                         | 0 assertions/screenshots; documented restrictions prevented execution                                                                 |
| External CI                                     | Workflow exists; no exact-commit Actions run or status reported for prior checkpoints. Final commit is rechecked; absence is not pass |

The control fixture had used the retired local Dot editor after the managed identity deliberately lost ungranted Space access. It now uses the actual managed projection API for a display-only rename. The strict Space validation was preserved; no production code was weakened. Only that failed protocol file was rerun.

The aggregate’s conditional cases are separately exercised by the actual stdio command. BE03’s additional95-second held-request check passed in its own phase and was not repeated in the quick final consolidation. Local test counts overlap and are not a distinct total.

The production install used `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` with the exact lock. It proves the default compiled app can boot without development/Intelligence dependencies, not that dependency lifecycle scripts, a container image or TLS deployment were qualified.

## What is implemented

One owner-authenticated Ryoko authority now serves canonical chat/history/commands, exact controls and reviews, immutable result delivery, Spaces/pages/artifacts, stable specialists and isolated memory, reviewed workflows and pinned skill delivery, real single-owner scheduling, and optional brokered computer, voice and Slack adapters. Legacy archives are inert and readable; operations include independent readiness, redacted diagnostics, supervised lifetime gates and offline declared-state recovery.

New Space, scoped local capture and retained legacy task-detail routes were restored during acceptance review. Legacy execution was not restored. Existing accepted or unknown work never gains a new operation ID during inspection, rollback or delivery repair.

See [the full acceptance map](backend-acceptance.md) and [machine-readable evidence](backend-acceptance.json) for all65 requirements,37 check groups,39 baseline controls, exact phase commits and validation-log digests.

## Gates before production acceptance

1. Supported authenticated browser journeys, including page/editor/review navigation and the research→page path
2. Actual target image/supervisor, browser and shell containment/egress, takeover and persistent-volume qualification
3. Real voice microphone/playback/provider/cost/quotas and real Slack installation/membership/scopes/delivery qualification
4. Actual selected model and primary personal-harness health; unavailable primary mutation/export/delete contracts remain unsupported with no built-in fallback
5. Authorized historical export normalization/completeness and old-provider link mapping
6. Full host/remote-target writer and state census, real encrypted age/key recovery, user-data restore rehearsal and measured load/RTO/RPO
7. Native/Compose TLS, secrets, auth rotation and service-manager acceptance
8. An explicitly declared owner/session cohort and approved cutover/rollback observation window

No exclusions for these gates have been accepted. Broader teams, finite-local-speech-as-realtime and LAYA remain unavailable/off rather than fabricated. Optional channels default off. Synthetic host fingerprints cannot qualify production targets.

## Reproduce local qualification

Use the exact reviewed producer and a supported isolated Python3.14 environment. The repository commands are:

```sh
npm run check-format
npm run lint
npm run typecheck
npm test
npm run build
npm run check:runtime-contract
npm run check:production-boundary
npm run test:operations
RYOKO_TEST_PYTHON=/path/to/python3.14 \
RYOKO_TEST_CHECKOUT=/path/to/pinned/ryoko-agent npm run test:runtime-stdio
```

The producer selection and exact checksums are recorded in `backend-acceptance.json`; use that repository’s `scripts/run_tests.sh`, not bare pytest. Read [setup](frontend-setup.md) and [operations/recovery](../BE11-operations.md) before starting a real state owner. Standard startup requires the same private maintenance gate used for offline recovery.
