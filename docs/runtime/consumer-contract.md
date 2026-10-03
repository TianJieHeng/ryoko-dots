# Dots browser contract candidate v1

Status: **consumer proposal, not a qualified backend API**. `src/shared/runtime/contracts.ts` is the executable browser allowlist. None of the route names below proves a corresponding Hermes handler or Dots server route exists. BE00 must establish ownership, adapters and compatibility; FE12 must qualify the exact producer/consumer pair. Until then the UI must fail closed and keep optional features individually unavailable.

## Authority and transport

The browser talks only to the authenticated, same-origin Dots gateway. It never connects directly to Hermes, Intelligence, a memory harness or an executor with a service credential. Dots derives owner, profile, agent/project grants, durable session and runtime generation from authentication and verified records. Browser Dot IDs are selectors, never grants. A server-issued scope tuple consists of owner, gateway identity, stable agent identity, optional project identity and generation. Display names never substitute for these values.

The existing owner unlock token is an application token, not a runtime credential. BE01 must replace or qualify its session lifecycle, cookie/CSRF protection, expiration and revocation. A frontend token store is not proof of secure authentication. Every authenticated projection is cleared on identity change; an outstanding request from an older authentication or binding generation cannot restore protected state.

All responses carry `version: ryoko-dots/1`. Strict schemas reject unexpected fields recursively instead of copying unrestricted producer objects. Server projection/redaction remains required: a string labelled `summary` is not a license to include secrets, internal reasoning, memory payloads or full unrestricted tool output. Every response must be bounded before JSON parsing at the gateway; browser schema limits are defense in depth, not a substitute for network response limits.

## Proposed routes and operations

| Family                                                                                          | Read contract                                                                                                          | Mutation contract                                                                           | Failure/unknown behavior                                                            |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/api/runtime/setup`                                                                            | Scope, control plane, ownership binding, compatibility, feature capabilities and explicit qualification                | None                                                                                        | Missing route = backend adapter unsupported, not “add an Intelligence key”          |
| `/api/runtime/conversations`                                                                    | Canonical cursor-paginated list; lineage ID, title/revision, origin, archive status                                    | Create, rename, archive with operation identity and expected revision where applicable      | Preserve draft/selection; never fabricate a saved row                               |
| `/api/runtime/conversations/:id/history`                                                        | Canonical stable messages, message revisions, session-event sequence, retention/truncation, independent runtime cursor | None; client-authored assistant/tool history is prohibited                                  | Clear foreign-scope content; retain explicit interruption/history-limited notice    |
| `/api/runtime/conversations/:id/commands`                                                       | Receipt lookup by stable operation ID                                                                                  | Submit/steer/cancel intent, not an execution plan                                           | Lost response = outcome unknown; inspect the original receipt before retry          |
| `/api/runtime/conversations/:id/events`                                                         | Bounded ordered surface events after the applicable cursor                                                             | None                                                                                        | Gap, expired cursor or `snapshot_required` invalidates only the matching projection |
| `/api/runtime/missions`                                                                         | Missions, checkpoints, unresolved effects, cancellation evidence, independent output/delivery states                   | Canonical supported operation with immutable identity; no generic “retry everything”        | Accepted is not executed, completed is not delivered, cancellation is not rollback  |
| `/api/runtime/reviews`                                                                          | Exact pending action, target/content/digests/revision/expiry and authenticated scope                                   | Exact decision mapped to `runtime.approval.resolve`, never generic runtime command approval | Changed/expired review is invalid; lost response requires decision receipt recovery |
| Artifact, specialist, memory, Learning, schedule, executor, voice, Slack and migration families | Separate qualified feature contracts, added with their frontend phases                                                 | Only capability-declared operations                                                         | A feature does not become usable because another provider is ready                  |

These families are not a second public producer protocol. Dots backend owns their canonical mapping and must document which producer operation and semantics each uses. Runtime session IDs, live transport IDs, durable lineage IDs, conversation IDs, mission IDs and surface/provider event IDs remain distinct.

## Read reconciliation

1. Authenticate, negotiate an exact supported contract, obtain the server-issued scope and verify explicit qualification. A reachable endpoint, configured model key or successful HTTP status does not qualify integration.
2. Read a bounded canonical conversation list. “Load more” appends actual authoritative rows, deduplicated by conversation ID/revision; a repeated cursor must stop rather than loop. A changed scope invalidates all prior pagination.
3. Read canonical history. A message ID identifies one logical message across live rendering, refresh, compression lineage and retries. A higher message revision supersedes that message; lower revisions cannot overwrite it. Duplicate messages must not create duplicate bubbles. Internal receipt markers remain hidden, and calls use stable anchor-message IDs.
4. Maintain transcript/session sequence separately from durable mission cursor. Durable journal events are not token deltas and must never be rendered as if they contain omitted transcript text.
5. Reconcile a live history change by reading canonical history; a safe presentation delta may exist only if BE03 supplies an explicitly versioned adapter. Do not append client-generated assistant messages to compensate for missing output.
6. Ignore foreign scope/generation and nonmonotonic events. Detect gaps. Snapshot replacement clears only the affected scope/projection and installs the snapshot cursor atomically before continuation. Keep retained/truncated history visibly distinct from an empty complete conversation.
7. Read cancellation or page navigation detaches subscriptions. It never sends execution cancellation. Bounded polling/reads may stop; accepted work remains runtime-owned.

## Mutation identity and pending writes

A user action creates one random operation ID before external submission. The canonical intent includes operation kind, conversation/resource selector, exact user-authored bytes and expected revision. Its SHA256 digest is immutable. Browser pending-write storage is a recovery aid only: BE03 must persist ingress identity atomically before dispatch and enforce uniqueness across restarts/tabs/surfaces.

Persist enough browser metadata to inspect the same operation after refresh, scoped to the authenticated owner/gateway/agent/project and resource. Do not store service credentials, granted permissions, unrestricted outputs or private memory. Keep unsent text until durable admission is known. Editing text creates a different intent; pressing retry or reconnect with unchanged text must preserve ID and digest. A new binding generation cannot silently replay a write under newer authority.

The receipt must match scope, operation ID and digest. `accepted` means durable admission only. `rejected` preserves the draft. `outcome_unknown` blocks blind resubmission and exposes inspection/reconciliation. HTTP exceptions, empty output, stream closure, failed rendering and a 90-second wait are not evidence of non-execution. Browser unmount does not delete server receipts or cancel work.

Exact reviews, revision-checked artifact writes, media requests and schedule controls follow the same recovery principle but use their specific canonical operation. A page-save receipt is historical evidence of one write, never a reusable general approval. Delivery-only recovery must reference the immutable completed output rather than re-running its mission.

## Retention and readiness

The server must explicitly disclose transcript truncation and the next history cursor; a missing old page is not silently converted to “no messages.” Backend retention windows for messages, command receipts, event cursors, artifact versions and call anchors must be documented and validated together. This candidate intentionally does not invent numeric production retention promises. Expired recovery identity requires operator-visible reconciliation, not a new automatic action.

Ready feature state requires: compatible version; reachable qualified control plane; authenticated binding; feature-specific capability; actual provider/executor availability where relevant; current grants. Degraded, unsupported, unconfigured, disconnected and permission-denied remain different states. Unknown remote outcome is inspectable independently of capability readiness.

## Qualification boundary

The synthetic producer fixture verifies selected wire behavior and source provenance. Browser contract tests verify parsing, scoping and fail-closed presentation rules. Neither establishes server-to-server auth, restart recovery, real provider behavior, canonical history completeness, live speech, external Slack delivery, computer isolation or migration safety. The paired BE gate and final acceptance evidence remain mandatory.
