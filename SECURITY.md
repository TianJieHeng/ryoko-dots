## Self-hosted frontend integration boundary

The new browser runtime adapters fail closed without a qualified same-origin gateway. They are not proof of secure runtime authentication, memory tenancy, effect policy or provider isolation. BE01 replaces the browser-held owner credential with server-managed sessions; legacy execution/channel dependencies remain pending the later backend phases; do not deploy this frontend checkpoint as a completed migration.

The standalone frontend preview is loopback-only, serves no private data, performs no runtime proxying and returns 503 for APIs. Runtime/provider service secrets must remain server-side. Keep the same-origin CSP and whole-route checks; do not restore a hosted WebSocket origin to work around unavailable setup. Backend migration/restore/rollback, persistent credential creation, provider/channel activation and deployment each require their own authorization and qualification.

# Security

OpenDots is an application template under development, not a hosted service. The local prototype is single-owner; Space membership, Slack identity mapping, and voice delegation require additional enforcement before connected multi-user use. It is not a security-audited autonomous agent.

## Intended boundary

- Run local development on loopback.
- Protect remote deployments with authentication and HTTPS.
- Keep the browser service isolated from the application host and private networks. Do not expose its port publicly.
- Keep Intelligence, model, speech, and browser credentials on the server. Never commit `.env` files or local databases.
- Treat page text, uploaded content, and model output as untrusted data, not authorization to change permissions.
- Authorize every Space, Dot, and thread operation on the server. Map Slack actors explicitly; never treat a display name or client-supplied user ID as proof of identity.
- Voice sessions must use scoped, short-lived credentials and route compute actions through the same permissions as text and Slack.
- Research browsing is read-only. Page tools can edit local documents in the executing Dot’s Space; those writes use revision checks. Adding external writes requires a separate authorization and review design.

Recurring work requires an available server. A sample run is not evidence that a live provider or deployment is safe or configured correctly. Review results before using them for important decisions.

## Reporting

Use the repository's private vulnerability reporting feature when available. If it is unavailable, open an issue asking for a private reporting channel without including exploit details, credentials, private URLs, or personal data.

Do not post sensitive reproduction data in a public issue. This project does not currently promise a response-time SLA or offer a bug bounty.

## BE01 single-owner session boundary

The production application factory requires `OwnerAuth`; there is no unauthenticated local mode or broad bearer-token fallback. Configure an existing owner bootstrap secret (`OWNER_TOKEN`, 24–4096 characters) in the host's secret facility. Missing configuration returns 503 and does not unlock pages or private state. This checkpoint creates no deployment credential and does not activate a provider.

- `POST /api/auth/login` accepts only the owner token, with exact same-origin `Origin` and JSON. Timing-safe verification exchanges it for a random session cookie. The token is never returned, written to browser storage, or used as an API bearer credential
- Cookies are HttpOnly, SameSite=Strict, Path=/, and Secure with a `__Host-` name on HTTPS. Session secrets are hashed in SQLite; browser CSRF tokens stay in memory and are recovered with authenticated `GET /api/auth/session`
- Every mutation requires the exact Origin and `X-CSRF-Token`. Logout revokes the current session; `/api/auth/revoke` revokes every session. Sessions expire after 30 idle minutes or 8 absolute hours, survive ordinary restarts, and are invalidated when the configured owner token changes. Old running processes cannot continue using the rotated token. Changing `OWNER_ID` against an owned database fails closed
- Maximum 16 active sessions; 10 login attempts per 15 minutes across the single owner; 600 reads and 60 writes per minute per session. Limits are SQLite-backed and survive restart. No client IP or forwarded header is trusted as an identity or rate-limit key
- Request URL authority and Host must exactly match configured authorities, including ports. Origins are never inferred from Host, X-Forwarded-Host, X-Forwarded-Proto or other proxy headers. Remote direct binding requires native HTTPS certificate/key files; TLS reverse-proxy mode requires an explicit `TLS_PROXY=1` and a loopback listener. The proxy must preserve the canonical Host and protect the private loopback upstream; do not expose it on another interface
- WebSocket upgrade/ticket access is unavailable. Future streaming/download adapters must call the authenticated owner and runtime mapping guards again for each delivered chunk/effect; admission alone does not authorize an indefinite stream. Delayed finite responses are rechecked before delivery
- API request bodies remain bounded to 1MB, JSON-only mutations are enforced, auth responses are no-store, and new auth code does not log bodies, cookies, tokens, or raw failures. TLS certificates/keys, database backups and owner secrets remain private server material

SQLite runtime mappings pin owner, gateway, principal, profile, stable agent identity/privilege class, project/Space, canonical conversation, durable session lineage, and live transport identity with revisions and uniqueness constraints. Names do not select privilege. Grant changes (including revoke then restore) invalidate captured scopes. Live reconnection generations are separate from stable authority revisions. Archived conversations remain readable only with current grants; mutations, subscriptions and downloads are blocked. Tombstoned conversations cannot be rebound.

These registry mutators are server-only; no browser endpoint accepts a verified mapping. They are populated only after an authenticated producer response proves ownership, never merely from configured IDs. `/api/runtime/setup` remains unqualified until that integration is proven. The legacy SDK scope checker is a temporary migration seam only: its Dot/thread selectors do not establish producer identity, and the legacy headless bearer self-call is deliberately no longer accepted by production authentication. Later backend phases must retire those execution paths rather than restoring a bypass.

## Self-hosted offline recovery boundary

See [BE11 operations](docs/BE11-operations.md). Backup consistency requires all actual writers stopped under the same lifetime gate plus deployment-specific service/cgroup/container proof. Dots/Ryoko SQLite alone does not include remote computer journals, workspaces, browser profiles, provider-held data or a complete Intelligence history. Keep target unknown receipts, schedule retirement fences and erasure tombstones across restoration. A restored generation does not authorize re-execution, publication, credential reuse or activation. Imported history is inert plain text behind the current owner session. Production SDK retirement is verified from the startup import graph; legacy SDKs remain only for development regression coverage.
