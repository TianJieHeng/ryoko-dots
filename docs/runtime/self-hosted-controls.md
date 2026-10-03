# Exact runtime controls and review boundaries

BE04 adds authenticated, conversation-bound views of the pinned Ryoko owner/profile control, missions, exact reviews, unresolved effects and immutable result delivery. It never infers completion, rollback or remote delivery from HTTP200. Use the exact producer/schema pins in `producer/provenance.json` and an explicitly connected conversation.

## Routes and authority

All routes below are relative to `/api/runtime/conversations/:conversationId` and require the same owner session, object grant, live transport epoch and current authority generation as commands:

- `GET /control`, `/missions`, `/reviews`, `/effects`: bounded producer projections; list completeness/truncation is preserved
- `GET /reviews/:approvalId`: full exact review details including content digest, target/recipient, affected version, expiry and original producer decision
- `GET /deliveries/:deliveryId`: original immutable output and receipt state
- `POST /control`: explicit owner/profile pause or resume
- `POST /missions/:missionId/actions`: supported exact revision-bound pause/resume/cancel
- `POST /reviews/:approvalId/decision`: exact digest-bound `once` or `deny`
- `POST /deliveries/:deliveryId/actions`: explicit retry of the same immutable output, never inference/effect replay
- `GET /api/runtime/operations/:operationId`: inspect the original admitted control operation only

Read routes never initialize an agent or reconnect a conversation. The user explicitly connects the selected conversation first. No browser-provided live session, principal, profile, grants, transport lease or credentials are accepted. Each mutation retains its full scoped path, immutable intent digest and operation identity in SQLite before any producer mutation. Global operation IDs cannot cross conversation/command/control families. Live mapping/grant checks run before and after awaited producer reads.

## Exact approval

A review must be read under the current live binding before its decision is admitted. Dots persists the exact safe presentation fingerprint; changed content, target, recipient, input/artifact revision, expiry, grant or binding invalidates it. The producer owns immutable approval IDs/digests and has no mutable review revision field; the browser revision0 value is a documented compatibility sentinel, not an invented producer revision.

No generic `runtime.command approval` is used. Approval resolves only the exact durable producer request. A lost resolve response is reconciled with `runtime.approval.get`; no recovery GET resends the decision. A page-save review receipt is not generic execution authorization.

## Pause, cancellation and effects

Owner/profile pause blocks new command admission and scheduled dispatch, retains accepted work, and fences in-flight work at its next checked dispatch boundary. Already-dispatched provider requests/effects may complete. The producer explicitly reports that it did not cancel the provider or undo remote effects. Mission controls and run-targeted cancellation remain distinct from global pause; neither is compensation or rollback. Unresolved effects remain visible after cancellation.

## Qualification

Focused tests use isolated synthetic owner/profile records and actual schema-pinned producer responses. Actual stdio qualification uses an isolated loopback provider. Live external provider, browser, target-host, computer and connected Slack/media acceptance remain separate gates. Source availability alone is not deployment or complete surface qualification.

## Immutable result receipt bridge

`GET /results/:commandId` reconstructs bounded producer chunks and verifies offset continuity, immutable descriptor, total length and whole-object SHA-256 before returning result bytes and safe text. Only a matching `runtime.result.available` notice from the owned current stdio process can issue a browser receipt. The producer's private attempt token never reaches the browser. Availability notices do not acknowledge anything; other private runtime notifications remain discarded.

The browser verifies bytes and explicitly sends `POST /deliveries/:deliveryId/ack` with the opaque receipt ID, exact SHA-256 and received components. Text and artifact receipt are independent. A client-received receipt does not claim a human read it. Issued exact-attempt receipts are reused; retained receipt rows are bounded. When the receipt ledger is full, verified reads remain available while new acknowledgment admission fails closed.

A lost ACK response remains unknown. Repeating its original claim only inspects producer status, including after BFF/producer restart; it never repeats ACK or inference. Explicit retry checks the same artifact ID/version/hash and attempt count, respects producer backoff/budget, and can redeliver an existing immutable output without rerunning work. Stale attempt notifications cannot acknowledge a newer attempt.
