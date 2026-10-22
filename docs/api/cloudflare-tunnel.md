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

The connector will forward only `/api/v1/` to `127.0.0.1:4311`. A separate gateway
accepts documented chat API routes and bearer authentication, then forwards to
Dots at `127.0.0.1:4310`. Cookies cannot authenticate through the gateway; local
browser authentication and its existing exact-origin checks stay unchanged.

Cloudflare installation and setup references:
[official package repository](https://pkg.cloudflare.com/index.html),
[locally managed tunnel setup](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/),
[ingress configuration](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/).
