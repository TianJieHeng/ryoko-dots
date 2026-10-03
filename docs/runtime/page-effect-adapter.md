# Native page effect adapter

BE05 wires the native executor/store, bounded owned-stdio callbacks, exact approval path, immutable artifact reads and receipt reconciliation. Native agent tools activate only under reviewed server-owned mappings and verified real producer project grants. Implementation and isolated stdio proof do not certify a deployed host or live provider. No external service, credential or deployment is activated by this checkpoint.

## Producer contract

The reviewed producer is `ryoko-agent` commit `3453afefce2b21947390fac0e03d9eaa67f326e9`.

Its actual implementation exists in:

- `agent/dots_adapter.py`: policy-bound native adapter registration, exact approval dispatch and inspection-only reconciliation
- `tui_gateway/contracts/dots_effects.py`: page prepare/publish, native dispatch/inspect/read and exact receipt schemas
- `tui_gateway/dots_bridge.py`: callbacks pinned to the owned stdio transport
- `tools/capability_broker.py`: canonical action and input digest definition

Use the producer's generated OpenRPC `x-server-requests` entries, rather than inventing callbacks:

- `dots.effect.dispatch`: `DotsDispatchRequest` → `DotsEffectReceipt`
- `dots.effect.inspect`: `DotsInspectRequest` → `DotsEffectReceipt`
- `dots.page.read`: `DotsPageReadRequest` → `DotsPageReadResult`
- `dots.approval`: exact held native review, answered only after the authenticated current presentation decision

The matching outgoing operations are `runtime.dots.register`, `runtime.dots.page.prepare`, `runtime.dots.page.publish`, and `runtime.dots.effect.reconcile`. The transport advertises `client.capabilities` before agent construction and registers only verified Space/project mappings. `request.cancel` uses the exact pinned notification payload to withdraw the matching callback by request ID, session and method.

The producer canonical format is sorted-key compact JSON with `ensure_ascii=True`. Do not hash ordinary Unicode `JSON.stringify` bytes. For the tested document containing `# Exact café 🦊`, the pinned producer produces 100 ASCII bytes with SHA-256 `d83033fbcd2371d25e884c264d561de73eafd1fc64419f58ce6efb30c253e7e5`. The test also contains the action/input digests obtained directly from the pinned producer's `dots_action` implementation.

## Ownership and transaction boundary

`PageEffectService` must use the same SQLite workspace database as `Pages`, Spaces, owner pin and grant bindings. A second page store or a separate receipt database would lose the atomicity required here.

`initializeNativePageStore(db)` registers two deterministic SQLite functions and installs immutable page-version triggers. Call it immediately after the existing page tables are created in `Pages` construction, on **every connection capable of writing pages**. The service constructor also initializes its connection, but that is insufficient if the owner editor uses a different SQLite connection. A connection without the registered functions cannot write through the triggers; do not bypass the triggers to work around that failure.

Existing pages are imported at their current revision only. The adapter does not invent older versions. All subsequent native and manual page inserts/updates create an immutable document snapshot and SHA-256 in the same transaction as the page head. Page identity and Space cannot be changed, and the head must advance by exactly one revision per update. Existing expected-revision owner edits keep their conflict semantics.

The `runtime_page_flags` table carries the exact approved `archived` bit without modifying the old `pages` column layout. Agent changes update the flag and page head in one transaction. Native reads/artifacts include the bit. Owner-facing list/get responses expose this flag, and revision-checked owner PATCH supports archive and restore. Any owner archive operation must update flag and page revision in the same transaction; never change the flag alone.

A fresh native dispatch has two boundaries:

1. Validate the strict pinned schema, owned peer, canonical scope/document, exact input/action digest, content byte size/hash, and deadline. Durably insert its exact effect/operation/approval identity before attempting mutation.
2. Recheck the peer and live grants under `BEGIN IMMEDIATE`, perform expected-head CAS, update the native page, insert immutable snapshot and source lineage, then commit its durable receipt in that same transaction.

Space/grant revocation must be serialized using the same workspace database. `canAccess` must synchronously read current mapped grants, not cached UI state. No async work is allowed inside these SQLite transactions. A native write uses the producer's requested page ID, so two creates for the same page cannot create duplicate random IDs.

The bounded producer document allows 24,000 content characters and a 256-character title. The native editor allows a 160 UTF-16-unit title. The adapter rejects an incompatible title with a durable `not_applied/unavailable` receipt; it never truncates, trims or changes approved bytes. Legacy manual pages retain their existing 100,000-character limit. If their serialized document exceeds the producer read envelope, the callback fails closed without truncating the page; authenticated owner artifact download remains available subject to its own bound.

## Trusted callback integration

The transport must route callbacks from its owned producer process directly to the service. Do not expose `dispatch`, raw `NativePagePeer`, or raw producer effect identity as a browser mutation API.

Construct `NativePagePeer` from the verified binder and live process, never from callback/browser JSON:

- `sessionId`: current owned live callback session
- principal/profile/agent IDs: pinned producer identity
- `runtimeSessionId`: canonical durable conversation/session mapping
- `conversationId`: corresponding Dots conversation for source lineage
- `policyDigest`: current verified producer policy
- `generation`: actual producer lease generation, not browser generation, connection epoch, or a value copied unverified from the incoming request
- `grantRevision`: actual registration revision used in `runtime.dots.register`
- `assertCurrent`: reject process replacement, stale transport epoch, lost binding or wrong session
- `canAccess`: re-read current Dots Space and producer project mapping/grants for the mode (`dispatch`, `inspect`, `read`)

The adapter itself verifies matching identities and digests. Current run generation comes from bounded, singleflight reads of real `command.claimed` events. Dispatch additionally checks `runtime.effect.get`; historical inspection deliberately does not need an old claim event. Superseded live-session registrations are removed, and native resource context is globally bounded below 8 KiB with the selected page first. Approval authenticity comes from the pinned producer broker and owned callback channel; a matching digest from an arbitrary caller is not authorization. If the transport/binder cannot establish the required generation or registration/grant evidence, keep native writes unavailable rather than manufacturing a ready peer.

After a producer restart, register the actual peer again under validated current scope. `inspect` permits the original historical effect generation and policy identity because it only reads immutable proof; it still requires the same principal/profile/agent/durable session and current read access. Dispatch requires the current exact policy and generation.

The server launch configuration accepts `nativePages: { adapterId, projects: [{ spaceId, projectId }] }`. The reviewed producer profile must already allow `dots_page_read`, `dots_page_propose`, and each project ID in `project_grants`. Actual `runtime.project.get` owner/grant records are verified before creating the local mapping. First connection may advance local grant generation; the browser independently verifies its refreshed setup before adopting that same-identity transition.

Do not expose legacy independent-loop page tools in self-hosted mode. Page review must call producer prepare and approve/publish exactly once; it must not first create a local page and then issue another producer save.

## Lost responses and recovery

The `runtime_page_effects` row is a durable native receipt/outbox. It is keyed by effect ID with unique operation and approval IDs. It contains the entire canonical producer identity and proposal digest. Changed retries are rejected; an exact committed retry returns the original receipt/version even when the owner has subsequently edited the head.

If the native process dies after durable admission but before the mutation transaction commits, the receipt is absent. The result remains `outcome_unknown`; repeating dispatch returns that unknown record without mutating. This deliberately sacrifices automatic replay even when a rollback probably prevented the write. Only inspection may reconcile the producer effect.

If the native process dies after committing bytes/receipt but before returning the callback, `dots.effect.inspect` returns the original receipt after restart. Producer `runtime.dots.effect.reconcile` then closes its unresolved journal entry without inference or effect redispatch. No push/ack outbox worker is needed because the producer has an actual pull-inspection operation. Do not mark a native receipt as producer-confirmed until that producer receipt is observed.

Missing receipts are never inferred from the current page head. Committed receipt reads revalidate identity, exact revision and immutable snapshot digest. Unknown inspection is read-only and does not insert a page, reserve a page or generate a receipt. There is no automatic compensation, overwrite, or new-operation retry.

Native model proposals wait on `dots.approval` and use the existing exact review UI. The BFF forwards an approved decision through that original held callback, then reads the durable producer decision instead of resolving it a second time. Native review identities and waiting/answered/withdrawn state are retained. A cancelled or disconnected native waiter cannot fall through to generic approval resolution; neither can an early decision before its proof finishes. `decisionUnavailableReason` explains that condition without changing producer status. Only a matching durable manual prepare record permits the separate generic control path.

Archiving a page fences new submit/steer and native writes from that source page conversation, including writes to another page. It also fences native updates of the archived target until owner restore. Reads, receipt inspection and exact cancellation remain available. Archive does not cancel inference, claim rollback or restore grants.

## Artifacts and old review links

`artifact(spaceId, pageId, revision, guard)` returns a bounded `RuntimeArtifact` plus verified immutable bytes. Runtime HTTP artifact list/content routes require the selected `dotId`; the guard checks authenticated owner, reviewed Dot binding and current requested-Space access before and after retrieval, and for every streamed chunk. The filename is a hash-derived safe basename; page IDs are SQLite identities, never filesystem paths or URLs. Return the fixed `application/vnd.ryoko.dots.page+json` MIME, exact length/hash, `nosniff`, and an attachment disposition through the authorized streaming route. Do not redirect to arbitrary remote locations. The FE artifact verifier already rejects partial, mismatched, redirected or stale-auth responses.

`read` returns the exact producer callback envelope for the requested immutable version or current head. Page text remains untrusted data. This service does not render HTML, follow links or execute content; existing renderer sanitization and safe-link behavior must remain in place.

`linkReview(identity, threadId, toolCallId)` is server-only receipt correlation after a committed effect. It checks source conversation lineage, fills legacy `(threadId, toolCallId)` page receipt recovery, and records the canonical effect/operation linkage without saving another page. Existing receipts for a different page or effect are never overwritten. Browser review recovery should inspect this mapping and canonical effect rather than posting a new save.

## HTTP paths

- `GET /api/runtime/artifacts?dotId=…`: existing bounded artifact envelope
- `GET /api/runtime/artifacts/:pageId/versions/:revision/content?dotId=…`: immutable verified bytes, fixed MIME, safe filename, `nosniff`, no-store, exact size and digest
- `POST /api/runtime/conversations/:id/page-saves`: exact manual prepare with stable UUID and explicit expected revision/generation
- `POST /api/runtime/conversations/:id/page-saves/:operationId/publish`: exact approval ID/digest; duplicate/unknown outcomes inspect rather than redispatch
- `GET /api/runtime/conversations/:id/page-saves` and `GET …/:operationId`: bounded manual ingress and read-only recovery
- `POST /api/runtime/conversations/:id/page-effects/:effectId/inspect` with an empty body: native model/manual effect inspection via exact producer receipt reconciliation
- `GET /api/conversations/:id/reviewed-page/:toolCallId`: authorized legacy receipt reads retained; legacy save writes remain retired

Recovery first uses an exact recorded effect ID or native operation/effect mapping. If unavailable, it filters by the real prepared/command run ID. An oldest-first prefix of 200 unrelated effects never proves non-application.

## Integration checklist and remaining qualification

Steps 1–6 below are implemented in this tree. Step 7 passes in the isolated actual Node/Python test. Consistent production backup/restore and deployment remain later qualification gates; this does not claim live-provider or multi-user certification.

1. Copy `src/server/runtime/page-effect-service.ts`, its test and this document into the matching repository paths.
2. Extend the pin generator to collect the native outgoing methods and `x-server-requests` above, including transitive generated schemas/types. Preserve the reviewed producer hashes; these are already present in the pinned source.
3. Initialize the native store in every page-writing connection, and expose a service using the pinned-owner workspace DB. Do not substitute a separate database.
4. Wire actual owned-stdio callback routing, exact reply IDs, deadlines, no reconnect replay, schema validation, registration lifecycle and verified peer construction. Complete producer approval flow before enabling agent mutation tools.
5. Wire owner page/archive/list semantics and grant-checked callback/document/artifact HTTP reads. Preserve manual edit CAS, page conversations, snapshots and source links.
6. Wire old review correlation/recovery without a second save. Register only actual allowed Space/project pairs; visible/default Space choices do not grant permission.
7. Exercise a real Node BFF ↔ pinned Python producer loop: prepare/publish, native bytes commit, callback loss, producer reconciliation, grant revocation and stale generation. Unit fixtures and static method presence are not this qualification.
8. Back up workspace page heads, flags, immutable versions, receipts, lineage, review correlation and runtime mappings at a consistent SQLite boundary with the producer journals. Restore must never replay historic effects or silently drop unknown admissions. Real backup/restore, authorized HTTP download interruption, old-link and browser regressions remain integration gates.
9. Run format, lint, typecheck, all tests, build and runtime-contract checks against the final integrated tree. Do not report isolated adapter tests as full BE05 completion.

## Isolated verification

The integrated final focused gate passes TypeScript, targeted ESLint and 50 tests across the native store, runtime service, typed callbacks and existing BE04 control/result bridges. The final `tests/self-hosted-pages.test.ts` actual Node → pinned Python test passes in 14.18 seconds with `/tmp/dots-backend-python/bin/python` and the reviewed pinned checkout. The final repository-wide gate belongs to the publishing checkpoint. The native-specific regression files contain 31 tests, including: Coverage includes:

- Direct producer canonical-byte/action-digest specimen
- Exact single commit, conflicting identity/operation/approval retries
- Owner autosave CAS, immutable manual versions and two SQLite connections
- Lost receipt recovery independent of newer owner edits
- Real Node process death after native commit and after pre-mutation admission
- Atomic rollback of flags/head/snapshot/lineage/receipt on storage failure
- Grant revocation at commit, stale/foreign session and generation rejection
- Historical receipt inspection without mutation permission
- Cross-Space page/parent rejection and parent-cycle protection
- Archive bit preservation, native title bounds and oversized manual read safety
- Safe artifact filenames, auth guard, immutable snapshots and corruption detection
- Legacy review mapping without duplicate saves or overwritten receipts

## Assembled configuration and browser routes

The reviewed owner launch JSON may include:

```json
{
  "nativePages": {
    "adapterId": "dots-native-pages",
    "projects": [
      {
        "spaceId": "existing-dots-space-id",
        "projectId": "existing-ryoko-project-id"
      }
    ]
  }
}
```

These are references to existing owner-created resources, not permission grants. The primary policy must explicitly include `dots_page_read` and `dots_page_propose` in `allowed_tools` and the project IDs in `project_grants`. Producer `runtime.project.get` must verify the matching owner/agent and current read/write grants. The BFF refuses a mismatched/revoked project mapping; it never invents a project from a Space name or browser input. No missing project is created by merely opening a page. Optional native capabilities are advertised to the owned producer before agent construction.

First explicit connect can establish a verified Space/project mapping and advance the local authority revision. The browser accepts only the same owner/gateway/agent/project with an increased revision and an independently authenticated selected-Dot setup read matching that exact new scope. Foreign, decreasing or contradictory scopes remain rejected.

- `GET /api/runtime/artifacts?dotId=...` lists bounded currently authorized immutable native page heads
- `GET /api/runtime/artifacts/:pageId/versions/:revision/content?dotId=...` verifies current Dot/Space access, exact stored bytes, MIME and digest; no redirect or arbitrary file path
- `GET/POST /api/runtime/conversations/:id/page-saves` inspects/adopts manual exact page-save intents under actual producer artifact-control admission
- `GET /api/runtime/conversations/:id/page-saves/:operationId` recovers original evidence only
- `POST /api/runtime/conversations/:id/page-saves/:operationId/publish` publishes its exact previously prepared/approved bytes
- `POST /api/runtime/conversations/:id/page-effects/:effectId/inspect` validates the exact original producer page effect then reconciles its native receipt without redispatch

Agent-generated `dots-tool-*` operations retain their actual producer identities. Activity shows their exact reviews and unresolved effects; it does not replace them with invented consumer UUIDs. Owner page edits/archive/restore remain ordinary revision-checked owner operations. Archive retains history and downloads, fences new inputs/native writes from the archived source page, and preserves cancel/stop/read recovery. It does not cancel the provider or undo an already committed save.

## Withdrawal and recovery boundaries

Producer `request.cancel` events are matched by the exact request ID, method and live session and abort the associated native callback. No late answer or pre-dispatch mutation is accepted after withdrawal. A native mutation committed before withdrawal remains an immutable receipt to inspect; no rollback or replay is inferred.

Native tool review identity is retained so a withdrawn/restarted waiter cannot accidentally fall through to generic approval resolution. Manual prepared reviews remain separately correlated. The UI keeps exact review bytes and producer status visible but disables decisions when the original native waiter is unavailable.

Lease evidence refresh is serialized. New live bindings supersede old registration context. Original effect recovery uses exact stored effect identity first, then the actual original run scope, rather than assuming the first bounded page of unrelated history is complete. Auth/grants are fenced after asynchronous preparation even if receipt persistence succeeded for a now-detached caller.

The actual page test proves fresh unmapped Space/project bootstrap, exact manual prepare, native bytes committed with lost callback receipt, a full BFF and producer restart, historical generation receipt inspection without redispatch, later owner edit preservation, actual model tool discovery/read/proposal, exact human review callback, one native model write, Dot-scoped immutable download, owner archive snapshots, and archive-safe cancellation. Mocked focused regressions additionally cover parallel generation evidence, withdrawn/early review decisions, delayed-auth/project revocation, bounded selected-page context, and exact/run-scoped recovery past 200 older effects.
