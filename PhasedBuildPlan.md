# Phased build plan: Dots desktop and multiple agent runtimes

Status: proposed implementation plan; no phases implemented by this document.

Date: 2026-10-21.

## Outcome and scope

Turn the existing local Dots installation into a desktop application where the owner can use Ryoko, add other persistent Dots backed by supported agent runtimes, and address each Dot through a documented API. Preserve the browser interface, existing conversations, automatic connections, and native computer access.

**Subagent configuration is deferred at the owner's request.** Monitoring existing delegation is included as a later phase. Do not change Ryoko's delegation limits, enable new delegation modes, enroll specialists, or build subagent configuration screens as part of the initial delivery. Persistent Dots and temporary subagents are distinct concepts.

This plan supplements the existing build plans. It does not authorize removing existing runtime qualification, identity, budget, or approval guarantees. Follow repository AGENTS.md: all validation is local; never use CI.

## Verified starting point

- `run.sh` starts the installed user service and opens the browser. The backend serves the UI at `http://127.0.0.1:4310` and owns the Hermes stdio runtime. The computer supervisor is a separate user service.
- Ryoko uses the existing Hermes `ryoko` profile and its configured ChatGPT authentication. Private credentials remain outside the repository.
- Production routes live in `src/server/self-hosted-app.ts`. The older `workspace-routes.ts` and `dot-agent.ts` paths are legacy, not the foundation for this work.
- The application already exposes authenticated conversation creation, commands, history, events, and result inspection. Browser authentication is implemented in `src/server/owner-auth.ts`.
- Runtime bindings enforce one primary agent per owner. The specialist response schema in `src/shared/runtime/agents.ts` currently permits at most 100 entries. This is a response/schema constraint, not evidence of support for 100 simultaneously running agents.
- Runtime services are coupled to the Hermes transport and identity contract. A native Codex runtime adapter is not implemented.
- Chats retain their histories across messages. Explicit owner messages receive independent execution budgets; task retries retain their original identity and budget. Queue admission deadlines and execution deadlines are separate.
- Named specialist handoff status exists, but the UI does not provide a unified live tree of temporary subagent execution.

## Target concepts

| Concept          | Meaning                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Dot              | Persistent user-facing agent identity, with a stable ID, display settings, runtime binding, and explicitly granted access. |
| Runtime instance | Configured Hermes or other supported agent process/service with its own lifecycle and authentication reference.            |
| Conversation     | Durable thread belonging to one Dot and its runtime binding.                                                               |
| Run              | One accepted task within a conversation, with its own status and execution budget.                                         |
| Child run        | Delegated work linked to a parent run; not automatically a permanent Dot.                                                  |
| Default Dot      | The Dot selected initially by the interface; Ryoko remains the default. This is not a privilege level.                     |

The backend remains the authority for bindings, permissions, command identity, and task state. Desktop windows and API clients use the same application services. Runtime-specific capabilities are advertised explicitly instead of pretending every backend supports the same features.

## Phase 0 — Establish the baseline and migration boundaries

**Purpose:** make the existing installation a reliable reference before changing its architecture.

Implementation:

1. Inventory production routes, database schemas, runtime bindings, launch configuration, service units, and existing local validation scripts.
2. Record a small reproducible smoke flow: authenticate, open an existing chat, send a message, observe receipt and completion, reload history, and inspect computer availability.
3. Document the existing paired state backup/recovery procedure. Test restoration into an isolated location; do not copy live SQLite files casually or alter production history for tests.
4. Record the installed producer revision and generated contract hashes. Preserve source pin checks when subsequent phases change Hermes contracts.
5. Define versioned migration ownership and an upgrade journal. Record runtime changes and application schema changes separately.

Acceptance:

- The baseline smoke flow succeeds against the installed system.
- Existing conversations and the fresh-per-message budget behavior have regression coverage.
- A local backup can be restored without changing the live installation.

Deliverable: baseline evidence and a documented migration/rollback procedure.

## Phase 1 — Ship the desktop shell

**Depends on:** Phase 0.

**Purpose:** open Dots as a desktop application while keeping agent execution independent of the window.

Implementation:

1. Run a small local Electron/Tauri feasibility check against the existing UI: authentication cookies, streaming, clipboard, downloads, microphone permission, external links, and Linux packaging. Select one shell and record the decision; do not maintain both implementations.
2. Add a desktop entry point, icon, application metadata, and a single-instance launcher. Reopening the application focuses the existing window.
3. Reuse the installed backend service. Start it if needed, wait for verified readiness, and show a readable startup/recovery screen while it boots. Verify that the listener is the expected Dots service before loading it.
4. Keep the web renderer isolated from arbitrary host execution. Expose only narrowly defined desktop operations through the shell bridge. Open external links in the system browser.
5. Preserve password-backed sign-in and the configured application origin. Do not embed credentials in the bundle, URL, renderer code, or launcher arguments.
6. Define window lifecycle: closing the window leaves backend tasks running; an explicit service-stop action explains its effect on active work. Desktop notifications are opt-in.
7. Update `run.sh` to launch the desktop application when installed, retain an explicit browser option, and preserve headless startup via `DOTS_NO_BROWSER=1`.
8. Produce a locally installable Linux artifact and desktop menu entry. Keep updates manual for the first release.

Acceptance:

- Launch from the application menu and `run.sh`; only one backend and one desktop instance start.
- Authenticate, chat, use the computer panel, close the window during a task, and reopen to the same task/history.
- Backend startup failure gives an actionable retry/logs screen rather than a blank window.
- Browser access still works.

Deliverable: installed desktop app plus documented browser and headless fallbacks.

## Phase 2 — Define a documented local API

**Depends on:** Phase 0; can follow the desktop delivery without changing its design.

**Purpose:** allow scripts and applications to use Dots without reproducing private UI implementation details.

Implementation:

1. Add a versioned `/api/v1` facade over the existing application services. Keep existing UI routes compatible during migration; do not build a second execution engine.
2. Define and publish an OpenAPI contract for the proposed routes below. Mark these as new routes until implemented.
3. Add dedicated, revocable API credentials with Dot and operation scopes. Keep normal interactive login password-based. Store only credential verification material server-side and reveal a newly generated secret once.
4. Preserve browser cookie/origin protections. API authentication must establish its own scoped principal and must not bypass runtime binding or approval checks.
5. Define idempotent submission semantics: an operation key binds to exact request content; retrying the same request returns the existing operation, while conflicting reuse is rejected.
6. Return durable acceptance separately from completion. Expose a status resource and resumable events with cursor semantics, pagination, retention behavior, and structured errors.
7. Add a small CLI/script example that creates a conversation, submits a message, waits for completion, and prints the assistant response. Read credentials from protected configuration rather than inline examples.

Proposed public surface:

| Route                                                  | Purpose                                             |
| ------------------------------------------------------ | --------------------------------------------------- |
| `GET /api/v1/dots`                                     | List permitted Dots and readiness/capabilities.     |
| `GET /api/v1/dots/{dotId}`                             | Inspect one permitted Dot.                          |
| `POST /api/v1/dots/{dotId}/conversations`              | Create a thread for that Dot.                       |
| `GET /api/v1/dots/{dotId}/conversations`               | Page through that Dot's threads.                    |
| `POST /api/v1/conversations/{conversationId}/messages` | Accept a new owner task with an idempotency key.    |
| `GET /api/v1/conversations/{conversationId}/messages`  | Read paginated conversation history.                |
| `GET /api/v1/runs/{runId}`                             | Inspect normalized state and results.               |
| `GET /api/v1/runs/{runId}/events`                      | Resume an event stream from a cursor.               |
| `POST /api/v1/runs/{runId}/cancel`                     | Request cancellation and report its actual outcome. |

Acceptance:

- A local script completes a full conversation without browser cookies.
- A credential restricted to one Dot cannot read or execute another Dot's work.
- Duplicate submission and interrupted event streaming recover without duplicate execution.
- Revocation prevents further access, including continued protected streaming according to the documented policy.
- API errors distinguish rejected, accepted, running, completed, failed, cancelled, and uncertain outcomes.

Deliverable: versioned API, schema, authentication management, and working local examples.

## Phase 3 — Introduce runtime-independent application services

**Depends on:** Phases 0 and 2.

**Purpose:** support different agent implementations without spreading backend-specific protocol logic through the UI and API.

Implementation:

1. Define an adapter interface for runtime readiness, conversation creation/resumption, message submission, history, events, cancellation, approvals, and optional capabilities.
2. Normalize application-level identity and run states. Retain original runtime IDs and raw diagnostic evidence privately; do not force runtime-specific state into inaccurate common labels.
3. Wrap the existing Hermes implementation behind the adapter first. Keep its producer source pin, identity verification, immutable command receipts, and budget behavior intact.
4. Move services that currently depend directly on a singleton `ConversationTransport` to a runtime registry selected through verified Dot bindings.
5. Specify optional capabilities such as computer access, durable children, memory, scheduling, and live steering. Unsupported operations return a clear capability error and corresponding UI controls remain unavailable.
6. Scope process locks, callbacks, credentials, event cursors, and caches by runtime instance. One failed runtime must not poison another runtime's state.
7. Add contract fixtures for reconnects, delayed completion, cancellation races, uncertain submission, and unsupported features.

Acceptance:

- Ryoko passes the existing chat and computer flows through the adapter with no history migration loss.
- Every command is routed from a verified Dot/conversation binding, not a browser-supplied runtime path.
- Restart or failure of one simulated runtime does not redirect or corrupt another runtime's work.

Deliverable: qualified Hermes adapter and shared runtime registry.

## Phase 4 — Manage multiple persistent Dots

**Depends on:** Phase 3.

**Purpose:** add independent persistent agents while retaining Ryoko as the default.

Implementation:

1. Add a Dot registry with stable ID, name, runtime kind/instance, runtime agent identity, readiness, capability summary, explicit project grants, and archival status.
2. Separate default selection from runtime authority. Preserve Hermes primary/specialist semantics inside Hermes; do not remove the current primary uniqueness constraint without migrating the authority model and proving equivalent isolation.
3. Migrate existing Ryoko and conversation bindings transactionally. Preserve IDs, histories, permissions, pending operations, and ownership. Do not silently rebind an existing conversation to a different runtime.
4. Add creation/enrollment, rename, default selection, readiness inspection, and archive flows. Enroll an existing profile through a checked backend flow rather than treating arbitrary browser JSON as trusted configuration.
5. Support additional qualified Hermes runtime instances with distinct profile/state directories where independence is intended. Do not concurrently launch separate owners of the same state directory.
6. Add paginated catalogs throughout producer, backend, and client contracts. The current 100-entry specialist response bound must not cause silent truncation or an unsupported claim of unlimited agents.
7. Add resource controls: maximum active runtimes, queued work, concurrent runs, lazy startup, and idle cleanup that never discards active work. Keep registered-Dot capacity separate from simultaneous execution capacity.
8. Expose each Dot through the Phase 2 API and document how to find its ID and create its conversations.

Acceptance:

- Two independently configured Hermes Dots can each create and resume conversations through the UI and API.
- Ryoko remains the default after restart and migration.
- Cross-Dot history, memory, project access, and command IDs do not leak or collide.
- A synthetic catalog exceeding 100 entries pages correctly; separate load testing determines a supported concurrency target.
- Archiving a Dot preserves history and has explicit behavior for active work.

Deliverable: usable multi-Dot UI/API and documented practical capacity limits based on measurements.

## Phase 5 — Add a native Codex Dot

**Depends on:** Phases 3 and 4.

**Purpose:** run the actual Codex agent as a peer backend, rather than label a Hermes model selection as Codex.

Implementation:

1. Inspect the locally installed Codex interface and consult current official documentation before selecting its supported integration transport. Record the exact supported version and protocol; do not assume Hermes and Codex share session or event contracts.
2. Implement the runtime adapter against that supported interface. Map persistent threads, execution turns, streaming output, tool activity, approvals, errors, and cancellation into the common application model.
3. Add a backend-specific enrollment/authentication flow using supported credential storage. Do not copy Hermes OAuth material or assume a shared login file grants equivalent access.
4. Qualify context resumption and restart recovery. If the backend cannot safely recover an uncertain execution, expose that uncertainty rather than replaying it.
5. Expose only verified capabilities. Codex computer access, memory, scheduling, or subagent introspection must remain unavailable until implemented and tested for that backend.
6. Add a Codex Dot through the registry while leaving Ryoko and its default setting intact.

Acceptance:

- A real Codex-backed Dot completes a conversation from both desktop and API.
- A second message resumes the intended thread after interface restart.
- Hermes and Codex can operate concurrently without mixing credentials, histories, tool permissions, or events.
- Approval, cancellation, authentication expiry, and backend failure produce accurate user-facing states.

Deliverable: installed, independently qualified Codex adapter and enrollment documentation.

## Phase 6 — Monitor existing subagent work

**Depends on:** Phases 3 and 4. Codex child visibility depends on Phase 5 capability support.

**Scope boundary:** read and present existing delegation; configure subagents later. Do not change the current delegation policy or create a specialist team as a prerequisite for delivery.

Implementation:

1. Inventory the runtime's existing child lifecycle records, durable IDs, progress events, results, and parent relationships. Identify which data survives a restart and which is transient.
2. Define a monitoring model containing parent run, child run, runtime identity, task summary, timestamps, status, last observed activity, and available usage/budget measurements. Mark unavailable information explicitly.
3. Add durable monitoring projections and a resumable event feed. Deduplicate events and reconcile after reconnect. Distinguish stale observation from proven task failure.
4. Add a per-conversation task tree and an overview of active work across Dots. Let the owner inspect a child's task, authorized activity, result, and error without putting raw protocol receipts into chat.
5. Show queued, working, waiting for approval, completed, failed, cancelled, and unknown/stale states only where supported by evidence. Keep detailed diagnostics collapsed.
6. Respect existing visibility boundaries: parent linkage does not automatically grant access to a specialist's private memory or unrelated transcripts.
7. Expose read-only child summaries through `GET /api/v1/runs/{runId}/children` with pagination. Hide unsupported inspection capabilities for runtimes that do not supply them.
8. Defer child-specific steering/cancellation UI unless the runtime already supplies a qualified control path; parent-run cancellation semantics must state whether child work also stops.

Acceptance:

- Local fixtures demonstrate concurrent children, failure, delayed result, reconnect, and orphaned/unknown state without duplicate task rows.
- Existing authorized delegation, when present, is visible with accurate parent linkage and results.
- A parent completing does not make unfinished children appear completed.
- No delegation configuration, limits, or enrollment changes are required to ship monitoring.

Deliverable: read-only subagent monitoring in the UI and API. Subagent setup and orchestration controls remain a separate future project.

## Phase 7 — Optional access from other devices

**Depends on:** Phase 2, plus Phase 4 for multi-Dot remote access.

**Purpose:** deliberately extend the local API to another trusted device. Local desktop delivery does not depend on this phase.

Implementation:

1. Choose the intended deployment boundary: local machine only, private network/VPN, or a separately reviewed public deployment. Keep loopback as the default.
2. Add explicit listener/origin configuration, encrypted transport where needed, scoped credentials, request limits, and connection limits. Do not simply expose the current owner service on all interfaces.
3. Document authentication, certificate handling, event streaming through proxies, revocation, and reconnect behavior.
4. Ensure remote API access does not implicitly enable remote desktop takeover or grant additional filesystem/computer authority.

Acceptance:

- An authorized second device can target a permitted Dot and resume events after disconnection.
- An unauthorized client cannot enumerate Dots, read history, or submit commands.
- Returning to local-only mode closes the remote listener without losing work or history.

Deliverable: an optional documented remote-access deployment, enabled only when desired.

## Phase 8 — Package, migrate, and validate the complete release

**Depends on:** Phases 1–6; include Phase 7 only if selected.

Implementation:

1. Produce a reproducible local build and installer with documented runtime prerequisites and pinned dependencies.
2. Test upgrades against a restored copy of existing state before upgrading the installed service. Use the supported paired-state recovery procedure for rollback; do not roll application binaries back against incompatible migrated data.
3. Run the end-to-end matrix below, then install the completed build and repeat the essential smoke checks.
4. Update startup, desktop lifecycle, API, Dot enrollment, backend capability, and troubleshooting documentation.
5. Record tested capacity and known limitations. Avoid advertising unlimited Dots or universal backend capabilities.

| Scenario             | Required evidence                                                      |
| -------------------- | ---------------------------------------------------------------------- |
| Desktop close/reopen | Active task survives and history reloads.                              |
| Existing Ryoko chat  | Old history remains; new messages receive fresh task budgets.          |
| Multiple Dots        | Correct UI/API routing and permission isolation.                       |
| Native Codex         | Real backend response, thread resumption, accurate capabilities.       |
| Submission retry     | One durable task for one idempotent request.                           |
| Restart/reconnect    | No invented completion or automatic duplicate execution.               |
| Monitoring           | Child state and parent relationships survive recovery where supported. |
| Computer access      | Existing qualified Ryoko computer flow still works.                    |
| Authentication       | Password login, scoped API access, and revocation behave correctly.    |
| Migration/rollback   | Restored state and runtime bindings remain consistent.                 |

All checks run locally. Use the repository's documented test runners; Hermes tests use its prescribed runner. Run focused behavioral tests, typechecking, lint, production builds, adapter contract tests, and real application smoke checks appropriate to each change. Wait for the complete production build before restarting services. No CI workflows, external test pipelines, or remote dispatches.

## Delivery order and deferred decisions

Recommended delivery sequence: baseline → desktop → local API → adapter boundary → multiple Dots → native Codex → monitoring → final packaging. Remote access is optional and can follow the local API when explicitly needed.

Decisions to resolve during the corresponding implementation phase:

- Desktop shell: select Electron or Tauri after the local compatibility check.
- API/event transport: publish exact schemas, authentication scopes, and resume guarantees before clients depend on them.
- Capacity: choose runtime concurrency defaults from measured workstation/provider limits.
- Codex: select a supported protocol based on the installed version and current official documentation.
- Remote access: leave disabled unless requested.

Deferred beyond this plan's initial delivery: subagent configuration, delegation-policy changes, specialist team enrollment, automatic cross-backend delegation, team scheduling/synthesis, and autonomous agent provisioning.

## Implementation record — 2026-10-21

Phases 0–6 are implemented in this checkout: Electron desktop, three supplied
visual themes, local v1 API, runtime registry, multi-Dot workspace, optional native
Codex, and read-only delegated-work monitoring. Ryoko remains the default agent.
Phase 7 is documented as an optional SSH tunnel; remote access is not enabled.
Phase 8 includes the installed desktop launcher, local Linux shell package,
paired database backups, local tests and live workstation checks. See
`BuildJournal.md` for results and `docs/desktop/README.md` for use and installation.

Delivery boundaries and validation limits:

- The packaged Electron shell requires the installed backend and runtimes; it is
  not a standalone installer for a new machine.
- Independent Hermes profiles use the owner-maintained runtime manifest. Add Dot
  currently enrolls approved Codex templates; it does not provision new Hermes
  identities or copy provider credentials.
- API events use cursor polling. OpenAPI discovery is provided, but exact response
  field definitions also depend on the shared TypeScript contracts.
- The registry is bounded to 500 entries, with four unfinished hub runs maximum
  and one per conversation. These are conservative software limits, not measured
  provider/workstation capacity claims.
- Local validation covers Ryoko plus native Codex. No second-device remote test,
  high-concurrency capacity benchmark, or standalone-machine installation is
  claimed. Backup integrity and isolated restore checks do not constitute a
  complete production rollback drill.
- Monitoring exposes durable parent-linked evidence where the backend supports
  it. No subagent configuration, team enrollment, or delegation policy changed.
