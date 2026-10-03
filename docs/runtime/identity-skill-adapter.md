# Owner-scoped identities, memory and reviewed workflows

Producer pin: `98b9eeb7d2afc02d0e0393fea285f010000a0378`. The BE06 selected schemas are unchanged. The full producer schema hashes advance for BE07 scheduler status and are recorded in the generated provenance. This producer retains the exact JSON-manifest review fix that scans decoded content without treating its base64 transport wrapper as a JWT.

The trusted stdio process remains the configured primary with `personal_mcp` memory. A displayed Dot name never selects authority. Specialist conversation creation explicitly selects a producer-issued stable ID; bind and reconnect then inspect `runtime.agent.session.get` and reject identity/backend mismatches, unfrozen enrollment, archival or revoked authority. Stable built-in namespace values come from the producer registry, never browser JSON.

## Server-owned mapping

`identityProjects` in the reviewed launch configuration maps local `spaceId` to producer `projectId`. Existing `nativePages.projects` is used when `identityProjects` is absent. Mappings must resolve to actual owner-bound producer projects. Local Dot Space access is the intersection of configured agent project grants and the live project ACL. In particular, copied specialists receive a new namespace and do not inherit a source specialist's live ACL. Local page context is rechecked before command preparation and dispatch. Display-only renames and frozen next-session instructions do not advance the live grant generation; effective research/memory/Space permission changes do.

An explicitly connected primary conversation provides registry management. Read routes never create a hidden management conversation. After a process restart, connect an owned primary conversation again before using project or registry controls. Newly selected specialist sessions can only use verified saved mappings and their actual producer enrollment.

## Routes and envelopes

All routes remain owner-authenticated, same-origin and CSRF-protected. Request bodies are bounded. No arbitrary RPC method proxy exists.

- `GET /api/runtime/specialists?dotId=...` returns the existing stable specialist projection, scoped to the selected Dot
- `GET /api/runtime/identity/projects?dotId=...` returns authorized Space/project mappings
- `POST /api/runtime/conversations/:id/identity/:action` uses the finite alias map in `shared/runtime/identity.ts`
- Read aliases receive `{payload, projectId?}`
- Mutation aliases receive `{operationId, intentDigest, expectedGeneration, payload, projectId?}`
- Digest is SHA-256 of lexicographically canonical JSON `{method, payload}`, where method is the exact producer method from the alias map
- `GET /api/runtime/operations/:operationId` retrieves the retained operation outcome without replay
- `GET /api/runtime/identity/operations/:operationId/review` presents the exact retained preparation and its review digest
- `GET /api/runtime/conversations/:id/identity/memory/export?projectId=...&includeDeleted=false` returns a verified local JSON download with `X-Content-SHA256` and `X-Memory-Revision`
- `GET /api/runtime/identity/legacy?dotId=...` exposes frozen historical enrollment evidence
- `GET /api/runtime/identity/legacy-memory?dotId=...&offset=0` exposes bounded owner-global migration inventory to the primary only

Read and mutation envelopes include `version`, `scope`, `conversationId` and `result`; mutation envelopes also include the original operation ID, intent digest, status and reason. The project in the envelope is operation-local and checked against actual grants. An outer `projectId` is only needed for contracts such as evidence/memory record lookup whose producer params do not carry project selection. It must agree with any project already present in the payload. A reviewed commit derives its project and all target fields from the immutable original preparation.

Agent create/update mirrors only an exact verified producer receipt. Local projection can recover from the retained receipt; it never recreates an uncertain producer agent by display name. Config mutation receipts retain the admission generation; a subsequent setup read shows any permission-generation change.

## Actual lifecycle

1. Select explicit versioned evidence; no personal-memory or transcript auto-enrollment
2. Create a finite immutable workflow definition or separate style template
3. Evaluate through the producer's bounded local deterministic adapter, with varied tuning and held-out cases and recorded baseline artifacts
4. Prepare exact approval using `action: approve`, then explicitly accept or decline
5. Run an approved exact version under an exact ready mission and prepare immutable output proposals
6. Display every proposal using the existing review endpoint with `?projectId=<prepared project>`; the server verifies the project, actual retained bytes and producer action before returning project-scoped review material
7. Publish only when every output and manifest has an unchanged exact-byte presentation; hashes alone and unavailable/opaque/oversized reviews cannot authorize it
8. Deliver an evaluated approved version to a named stable specialist, or explicitly roll back to an earlier approved version previously delivered to that same specialist

Delivery activates only in a new session. It grants neither execution authority nor personal-memory access. Existing session knowledge stays frozen; session inspection exposes enrolled versus desired versions. Publication is non-atomic and does not imply mission completion.

Decline cancels the exact prepared workflow's bounded artifact-control command through `runtime.artifact.cancel`, retaining the original reviewed decline intent and actual cancelled receipt. It does not claim an approval was marked denied. The generic approval-resolution RPC is restricted to active inference runs and is not used for artifact-control workflow reviews. A cancelled control cannot publish or promote later. An ambiguous cancellation remains `outcome_unknown`; reads never retry it.

## Memory and migration boundaries

Primary personal-MCP mutation, supersession, deletion, export and ingestion remain unsupported at the pinned producer contract. Harness unconfigured/degraded/disabled states are returned literally; built-in memory is never a fallback. Specialist records are validated against principal, profile, stable agent and namespace. Writes use exact version CAS. Export verifies all chunks, total digest, revision and every record owner before exposing any download bytes. The 8 MiB export ceiling and producer tombstone semantics do not certify physical erasure of copies or backups.

Legacy conversation container enrollment, including disabled conversations, is preserved independently of current Dot settings. The old conversation schema had no frozen skill-delivery flag; this remains unknown rather than being inferred. Global memory inventory stores source IDs and digests, not duplicate memory bodies. Only unchanged original content within the review bound is displayed; changed/deleted sources are unavailable. Neither inventory grants enrollment or migration authority, and specialists cannot read owner-global memory inventory. All legacy global injection and mutation routes remain retired.

## Recovery and supported scope

The shared global operation registry fences operation family, owner, original intent and authority. Original intent is stored before dispatch. Ambiguous outcomes survive restart without automatic mutation retries. Exact successful receipts are saved before rechecking browser detachment. Review origin and presentation bind the live session and transport epoch; reconnect cannot reauthorize an old preparation by merely displaying it again.

Named single-specialist handoff/status is supported through real producer admission. Broader teams, multi-child synthesis and new privilege grants are not enabled. No real credentials, LAYA, live personal MCP or external provider were used in qualification; test SDK traffic remains on loopback. The focused actual stdio proof is `tests/self-hosted-identities.test.ts`; isolated consumer contract tests are `tests/runtime-identity-service.test.ts`.
