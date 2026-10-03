# Computer target dispatch edge (BE08)

## Evidence and activation boundary

This is an implemented, opt-in target protocol, not a target-host acceptance report. The focused tests use deterministic drivers, mocked Playwright primitives, temporary SQLite state and explicitly numeric loopback HTTP. No Chromium, shell command, Docker supervisor/container, credential provisioning or external account was activated by those tests. Real browser/files/shell, sandbox/egress, persistent profile and volume ownership, hardware takeover and backup/restore acceptance remain required before production readiness.

`src/computer/index.ts` is the actual Node 24 target entry. `tsconfig.computer.json` compiles it to `dist/computer/computer/index.js`; `tsconfig.server.json` also includes the target in the ordinary application build. `deployment/computers/edge.Dockerfile` and `compose.computer-edge.yml` are build/configuration source only. Do not activate the overlay as part of a status read or startup check.

The pinned OpenBot supervisor remains at `b6932d31a8d6e7896c15139dfc27a6c6911deb27`, with its existing narrow lifecycle, namespace ownership checks and exclusive Docker-socket access. The existing HMAC child-token patch is unchanged. The new target replaces only the computer image in the optional overlay. It receives only the derived per-Dot token, not the master or supervisor credential. Existing workspace/profile volume names and the `/profiles/<dotId>` browser profile path are preserved. Legacy root-owned volumes require a separately authorized offline ownership/migration procedure before using the new UID 10001 target; the code never silently changes their ownership or deletes their contents.

## Protocol and authority

Every protocol POST is bounded and signed by a role-specific HMAC derived from the per-Dot token. The MAC binds endpoint, role, Dot, executor, expiry, complete body and expected target fingerprint. A role string alone grants nothing. The target has one fixed Dot/executor identity and a one-time, immutable owner/principal/profile/stable-agent binding. Agent effect requests additionally bind the complete producer effect/approval/operation/session/run/generation/policy identity and exact canonical input, proposal and action digests. Input normalization cannot silently alter approved bytes.

- `/edge/status` reads metadata and never provisions. A signed owner may inspect disabled, unbound target metadata for initial qualification; an agent cannot
- `/edge/change` records authenticated owner bind, permission and control CAS operations. Permissions default off; no old permission row is automatically granted at the target
- `/edge/execute` persists the exact request digest and identity before a driver call, atomically reserves the executor and checks target grant/control/snapshot fences at each irreversible primitive
- `/edge/observe` provides bounded observations; only a real snapshot capture clears the bot handback gate
- `/edge/screen` is a separately authenticated owner PNG read, with a 16.1 MB envelope bound, a target capture identity and real capture timestamp. It neither clears nor replaces the bot snapshot fence
- `/edge/inspect` and `/edge/change-inspect` read exact durable receipts. Neither retries or manufactures an action

All old direct `/exec`, `/files/*`, `/navigate`, `/human/*`, `/control/*` and WebSocket target paths are absent. In governed mode, `ComputerService` also rejects legacy agent and owner action, permission and lifecycle entry points. The BFF uses its broker/effect coordinator for agents and its independently authenticated owner operation ledger for direct controls.

The actual driver calls `guard()` synchronously immediately before Playwright click/fill/submit/key/wheel/navigation, file creation/truncation/write, or sandbox spawn. Async ref resolution and browser preparation happen before the last guard. Fill and submit receive separate checks: revocation after fill prevents submit and remains a potentially applied, unresolved operation. A BFF AbortSignal is supplementary; it is not the target fence or proof of rollback.

Owner human-coordinate actions require authenticated owner identity, human holder, matching grant/control revisions, enabled browser permission and the same single-writer reservation. They do not require a bot accessibility snapshot. Releasing human control always invalidates bot references; bot actions require a fresh real snapshot within 15 seconds. Navigations, window changes, browser close, completed actions, permissions, control changes and target restarts invalidate snapshot state.

## Durability, concurrency and reconciliation

The target journal is `/profiles/.dots-edge/edge.sqlite`, separate from the writable shell workspace, with SQLite WAL and `synchronous=FULL`. It records bindings, fences, exact request digests, original effect/owner identity, operation/effect/approval uniqueness, single-executor reservations and immutable terminal receipts. Raw commands, typed values and file bodies are not persisted as request evidence. Result bytes are bounded and known credentials and the reflected top-level command are redacted before persistence.

A process crash, timeout, post-dispatch exception, oversized/invalid result or lost response leaves the accepted operation unknown. An unresolved operation blocks subsequent agent and owner writes, even when a caller supplies a new operation ID. Restart does not reinterpret an admission without a dispatch marker as proof of nonapplication. A new target process invalidates the previous process's boot fence and all snapshots. Historical exact receipts remain inspectable.

A successful target receipt survives response loss. The BFF retains only a verification reference containing request digest and original identity, then reconciles through read-only target receipt inspection. A later screenshot, new operation ID, service restart or desired-state observation cannot prove that an unknown browser/shell write succeeded or failed. Unknowns have no automatic retry or manual-success escape hatch.

The legacy `ComputerStore` audit adds explicit `unknown` plus operation/effect/agent/session metadata and never deletes unknown rows during terminal-tail pruning. Legacy transport exceptions after a possible write send are now unknown, rather than failed. Legacy pending audit rows observed after store construction are conservatively retained as unknown.

`ComputerService.governedLifecycle` exposes only authenticated owner start/stop through the pinned supervisor, with a final-send guard and positive response validation. Its caller must persist the owner intent and local fence before dispatch. The upstream supervisor has no operation-bound durable receipt, so response loss stays unknown and must not be retried. A later stopped/running status is not proof of the original lifecycle operation.

## Qualification is bound to the running target

Production qualification is an explicit, bounded operator-reviewed JSON record. No record is generated by this implementation. Missing evidence leaves actions unavailable. The record includes `protocol`, `dotId`, `executorId`, `receiptSha256`, `actions`, `buildSha256`, `configurationSha256` and `evidence: "target-host"`. The report hash is an operator-reviewed reference, not automatically a hardware test result.

The target measures its compiled JavaScript, dependency lock, actual Node and Chromium executables, OS package/version records, sandbox executable, kernel/runtime identity and fixed browser/shell security configuration. The observed build/configuration hashes must match the qualification record in the BFF and the target. The target looks for an explicitly configured `COMPUTER_QUALIFICATION_FILE`, or the optional pre-existing `/profiles/.dots-edge/qualification.json`. It does not create or populate one. Production loading rejects `evidence: "synthetic"`; fixtures use that label explicitly.

`NativeComputerHttpEdge.refresh` requires an exact matching target response before qualification is observed. Transport loss clears liveness but may retain the last observed matching qualification for explicit owner restart; a new fingerprint invalidates qualification. Every subsequent signed target action includes the expected fingerprint, closing the discovery-to-upgrade race. A configured endpoint, a syntactically valid hash, or an image tag alone never means the executor is available.

## Network, shell and file boundaries

The canonical public-page reader remains separate and usable under its existing fallback capability when interactive computers are unavailable. Interactive request routing shares its public-only URL/address validation, checks every DNS answer, pins the connect lookup to the validated address, forbids embedded credentials/nonstandard ports and blocks redirects before a destination is contacted. Browser requests reject forged Host/proxy transport headers and suppress redirect/Alt-Svc response headers. Service workers, downloads and WebSockets are disabled; individual response bytes and route concurrency are bounded. Browser cookies remain inside that target's persistent profile.

The address audit added explicit refusal of deprecated `192.88.99.0/24` and documentation `3fff::/20`, based on the [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/) registries. Existing private, loopback, link-local, multicast, mapped and transition-network refusals remain. No test relaxes the production validator: loopback tests replace it only inside their fixture module.

Files use relative paths, directory-descriptor anchoring and `O_NOFOLLOW`; symlinks, traversal, nonregular files and multiply linked files are rejected. The shell is an explicit `/usr/bin/bwrap` invocation with separate mount/PID/network namespaces, cleared environment, read-only `/usr`, a new `/proc` and only the intended writable workspace. There is no unsandboxed fallback and no shell network access. The shell implementation cannot be advertised until its host namespaces, process cleanup, mount/credential isolation and filesystem behavior are actually qualified.

These code controls are not proof of kernel containment or network egress enforcement. Chromium background traffic, WebRTC, host DNS/routing, container runtime profiles, shared library/image provenance, browser persistent state, disk-full behavior, host snapshot age/races, and backup/restore need the separate real-host gate. Keep every unqualified capability disabled.

## Focused verification

Run:

- `npx vitest run tests/computer-edge-protocol.test.ts tests/computer-governed.test.ts tests/computer-target-driver.test.ts tests/computer-public-transport.test.ts tests/computer.test.ts tests/computer-deployment.test.js tests/security.test.ts tests/transport.test.ts tests/research.test.ts`
- `npx tsc -p tsconfig.computer.json --noEmit`
- Focused ESLint/Prettier on the changed target, protocol, transport, service/store and test files

The separate BFF integration suite owns Node → real Ryoko producer → deterministic target protocol evidence. Repository aggregate checks, final pinned producer/consumer hashes and publication belong to the phase coordinator. None of these synthetic or loopback checks substitutes for a real Docker/Chromium/shell/target-host smoke or authorizes deployment.
