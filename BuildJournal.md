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
