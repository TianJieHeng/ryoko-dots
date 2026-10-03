# BE00 read-only backend foundation

Status: implemented bounded consumer foundation; **OD00 and integrated BE00 acceptance blocked** on the owning transport/binding prerequisites below. This is not a write-capable cutover. `/api/runtime/setup` now exists and truthfully reports unqualified features through the existing authenticated boundary. The legacy server remains until later retirement phases.

## Exact pin and schema ownership

Producer published source: `124931a916c8aa6beeaf60d08dd55ca5d20f6e3c`. Local fixture source `eb6b89fd554bb29cc295732a9b9cba9c3a50a489` has identical pinned sources. `src/shared/runtime/producer/provenance.json` records full producer TypeScript/OpenRPC SHA256. `scripts/pin-producer-contract.mjs` rejects any drift before extracting the exact transitive schema/type closure of capabilities, snapshot and replay. It does not hand-author a purported producer API. Generated files are excluded from formatting to retain deterministic extraction; their regeneration is checked separately.

The Ajv validator rejects schema drift and additional authority fields without coercing, deleting or defaulting input. Browser DTOs remain separate safe projections. Runtime responses and notification bytes are never forwarded wholesale to the browser.

## Read boundary

`ReadOnlyRpc` accepts trusted server-owned streams, enforces a three-method allowlist and generated request/response schemas, limits outstanding reads to 8, queue/frame bytes to 1 MB, and read waits to 5 seconds. It never creates a session, spawns an executor, selects a credential, issues commands, retries a write or cancels accepted work. Notifications, including private token data, are discarded. Unknown request IDs cannot complete another read. Disconnection rejects pending reads with redacted errors.

`RuntimeProjection` is a disposable SQLite WAL read cache. Verified bindings keep live transport session IDs distinct from durable lineage IDs. Every bind increments a persistent local generation, fencing A→B→A responses. Snapshot/cursor and event/cursor writes are transactional. Replay rejects gaps, conflicting duplicates, foreign durable sessions and regressing turn-lease generations. Producer turn-lease generation is distinct from the local binding generation. Unknown/expired cursor recovery requires the supplied authoritative snapshot. Cache retains at most 1,000 recent events; it is not a transcript owner or export.

## Actual evidence

- Unit tests use exact captured producer fixtures for schema validation, split frames, private notification discard, timeout/backpressure, malformed/oversize/closed input, scope-generation fences, replay duplicates/gaps/foreign ownership, SQLite restart and snapshot replacement
- `node --import tsx scripts/probe-runtime-readonly.mjs /path/to/python /path/to/ryoko-agent` sends actual Dots consumer reads through a child pipe into the producer's real dispatcher, ownership checks and isolated SQLite fixture. Capabilities/snapshot/replay, foreign-session denial and expired cursor replacement pass with zero provider dispatches
- The Python peer is deliberately a **synthetic fixture bridge**, not the production entrypoint, WS authentication or service-to-human proof. It creates and removes temporary synthetic homes and sends no provider traffic. The producer fixture's worker is mocked but never invoked
- The prior `check-runtime-contract.mjs` source hash and real dispatcher replay checks also pass. Browser/live-provider/target-host tests are not run here

## Transport decision and blockers

Prefer restricted server-owned stdio for the initial single-owner install, using trusted isolated profile configuration and OS process/pipe ownership. Do not expose arbitrary RPC names, runtime IDs, profiles, credentials or grants to the browser. WS currently authenticates human dashboard tokens or single-use tickets; it does not supply a general Dots service-plus-human delegated binding. No new credentials were created.

Required producer work before dependent acceptance:

1. Canonical, owner-scoped conversation create/rebind/list/history with durable operation identity, stable message IDs, bounded pagination and compression lineage. Existing create dedupe is process-memory only with a 300-second TTL, and generic session attachment warns about foreign login rather than enforcing ownership
2. A read-only command receipt lookup. Replaying `runtime.command` can enqueue an old accepted/unclaimed command and is not a safe receipt-inspection operation
3. Qualify actual stdio startup/restart/resubscribe and its trusted owner mapping through the consumer. A fixture pipe pass does not close that gate

Cross-repository changes require the owner's explicit scope approval. Until the producer boundary is implemented and pinned, dependent write paths remain unavailable. Independent Dots authentication/storage work may proceed with this blocked status, but BE00 is not marked accepted.

For the complete retained/replaced/disabled inventory, see [parity inventory](parity-inventory.md), [frontend handoff](frontend-release.md), and the backend plan. No parity rows were removed by this foundation checkpoint.
