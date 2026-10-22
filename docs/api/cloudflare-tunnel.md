# Ryoko mobile API tunnel

Target API base: `https://dots.ryoko.okinawa/api/v1`.
This is an API-only tunnel to the existing local Ryoko instance. No website is
uploaded or hosted. The local Dots UI, owner login, credential administration,
computer endpoints and non-v1 routes are excluded.

## Phases

1. Install Cloudflare's signed Ubuntu package and prepare API-only ingress.
2. Install a loopback API gateway; provision a separate Ryoko-scoped app key;
   verify routes, authentication and app operations locally.
3. Prepare service/configuration and stop at Cloudflare login and owner approval.
   Only after approval: create the named tunnel, add the hostname route and start
   the connector. Do not run a temporary Quick Tunnel.

The connector will forward only `/api/v1/` to `127.0.0.1:4313`. A separate gateway
accepts documented chat API routes and bearer authentication, then forwards to
Dots at `127.0.0.1:4310`. Cookies cannot authenticate through the gateway; local
browser authentication and its existing exact-origin checks stay unchanged.

Cloudflare installation and setup references:
[official package repository](https://pkg.cloudflare.com/index.html),
[locally managed tunnel setup](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/),
[ingress configuration](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/).

## Installed local components and app key

- `ryoko-dots.service`: existing UI/backend, loopback port 4310.
- `ryoko-dots-api-edge.service`: enabled API-only gateway, loopback port 4313.
  Port 4311 belongs to an existing local component and is not used for this tunnel.
- `ryoko-dots-tunnel.service`: installed but **disabled**, pending approval.
- Gateway config: `~/.config/ryoko-dots/api-edge.json`.
- App secret: `~/.config/ryoko-dots/mobile-api-key` (mode 0600).
- App connection metadata: `~/.config/ryoko-dots/mobile-api-client.json` (0600).

The app key is independent of the local owner password, scoped to Ryoko only,
read/write chat access, and expires after 365 days. It cannot enroll runtimes,
create keys, change Dot settings or access other Dots. The database stores only
its digest. Rotate/revoke it through the local **Dots & API** credential controls;
the private connection metadata records its credential ID and expiry. Never put
this key in a URL, source code, a public browser bundle, or Git.

Clients send `Authorization: Bearer <app-key>` and use JSON for POST requests.
See [the v1 API contract](README.md). Native HTTP clients can connect without an
Origin header. Browser/WebView clients need their exact app origin added to
`allowedOrigins` in the private gateway config and a gateway restart; no browser
origins or credentialed CORS are enabled by default. No wildcard CORS is used.

The exposed routes cover listing Ryoko and its conversations, creating a
conversation, reading/sending messages, reading runs/events/children, cancelling a
run, and reading the API schema. UUID `operationId` values make submissions
retryable; retain the same ID and request bytes when recovering an uncertain
submission. A 202 receipt means accepted: poll `/runs/{id}` for completion, then
read `/conversations/{id}/messages`. Do not blindly resubmit with a new ID.

The gateway rewrites Host only toward its fixed loopback backend, strips cookies,
Origin and forwarding headers, bounds request bodies, and refuses HTML responses.
It never proxies arbitrary paths or destinations. The existing per-key API rate
limit still applies. Cloudflare carries HTTPS to the tunnel; local hops use HTTP
only over loopback. The machine must be on and online for mobile access.

## Approval handoff and activation

Prepared hostname: `dots.ryoko.okinawa`. Proposed tunnel name: `ryoko-dots-api`.
Private pending ingress: `~/.config/ryoko-dots/cloudflare/pending-config.yml`.
The real `config.yml` is intentionally absent until an approved tunnel exists;
the installed connector unit is disabled and cannot use the placeholder UUID.
User-service lingering is enabled, so services can run while the desktop is logged
out; they do not run while this computer is asleep or powered off.

1. Run `cloudflared tunnel login` as the desktop user and use its browser link to
   log in to Cloudflare and authorize the `ryoko.okinawa` zone. The account
   certificate stays in `~/.cloudflared/cert.pem` and must never enter Git.
2. Stop for the owner's explicit approval to create the named tunnel and attach
   `dots.ryoko.okinawa`. Login itself does not create a tunnel or publish a route.
3. Only after that approval:

   ```sh
   cloudflared tunnel create ryoko-dots-api
   node scripts/prepare-cloudflare-config.mjs <returned-tunnel-uuid>
   cloudflared tunnel --config "$HOME/.config/ryoko-dots/cloudflare/config.yml" ingress validate
   cloudflared tunnel --config "$HOME/.config/ryoko-dots/cloudflare/config.yml" ingress rule https://dots.ryoko.okinawa/api/v1/dots
   cloudflared tunnel --config "$HOME/.config/ryoko-dots/cloudflare/config.yml" ingress rule https://dots.ryoko.okinawa/
   cloudflared tunnel route dns <returned-tunnel-uuid> dots.ryoko.okinawa
   systemctl --user enable --now ryoko-dots-tunnel.service
   ```

   Review existing DNS before adding the route; do not overwrite an unrelated
   record. The configuration helper requires the matching private credential file
   and refuses to overwrite an existing config. It does not create tunnels, edit
   DNS or start services.

4. Verify public HTTPS: `/` and owner/admin paths return 404, an unauthenticated
   API request fails, the app key sees only Ryoko, and a message completes. Confirm
   no redirect to a website/login page. Those external checks are **pending** until
   the owner approves activation.

To close remote access: `systemctl --user disable --now ryoko-dots-tunnel.service`.
Local Dots continues working. Keep the gateway and backend bound to loopback.

The mobile client connection metadata is prepared with the final HTTPS URL, but
that URL must not be considered live until the external verification above passes.
