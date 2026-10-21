# Dots API v1

The versioned API is rooted at `/api/v1`. Browser clients retain same-origin
password login and CSRF protection. Scripts use a separately generated bearer
credential restricted to explicit Dot IDs and read or read/write access. Create
and revoke those credentials in the Dots & API panel; the secret is shown once.
A credential cannot create other credentials or enroll runtimes.

Send `Authorization: Bearer <credential>` over loopback HTTP or configured HTTPS.
Do not put credentials in URLs. `GET /api/v1/openapi.json` describes the surface.
Pagination uses opaque cursors; events are durable, cursor-based JSON pages that
clients poll. This release does not claim an SSE connection. A client can resume
from the last returned cursor after disconnecting. Events are retained with runs.

Message and conversation creation require a UUID `operationId`. Reuse the same ID
and exact input to recover a request. Conflicting reuse returns 409. A message
receipt means acceptance, not completion. Poll the run resource and then fetch
committed conversation messages. `unknown` means inspection is required; never
retry unknown work with a new operation ID automatically. Native provider errors
and internal prompts are not copied into public diagnostics.

The existing `/api/runtime` UI routes remain available to authenticated browser
sessions. API credentials are accepted only on `/api/v1`, not those older routes.

## Additional runtimes

Set `DOTS_RUNTIMES_PATH` to an owner-maintained JSON manifest using
[runtimes.example.json](runtimes.example.json). Do not copy placeholder paths.
Restart after enrollment. Hermes entries require an independently reviewed launch
configuration and a distinct existing profile. Source pins, profile hashes,
provider scope, and runtime identity checks still apply. Each additional Hermes
runtime has its own workspace database under `runtimes/<id>/workspace.sqlite`.
Registry names/default/archive settings persist independently of the manifest.
The default Dot is a UI preference, never a change to runtime authority.

The initial registry accepts 500 configured runtime entries and paginates at 50.
It admits four active API runs globally, one unfinished run per conversation.
These are conservative configured limits, not measured capacity promises. The
legacy specialist interface retains its existing contract bounds; it is not
used as the persistent multi-runtime Dot catalog. No subagent setup is performed.
