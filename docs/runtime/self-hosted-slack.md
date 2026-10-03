# BE10 self-hosted Slack: implementation and activation contract

Status: implemented and locally verified; **not activated or live-workspace qualified**. All evidence below is synthetic or loopback. No Slack credentials, real Slack messages, provider activation, or external inference were used. This does not claim the BE10 connected-workspace exit criterion is complete.

## Delivered implementation

- `slack-types.ts`: explicit installation/allowlist/qualification configuration and narrow adapter interfaces
- `slack-ledger.ts`: SQLite FULL synchronous durable event aliases, original message identity, canonical thread reservation, immutable outbox, rate limits, recovery cursors, and installation sender lease
- `slack-service.ts`: signed raw-body Events endpoint, durable acknowledgment, separate background worker, exact thread command admission, output dispatch and inspect-only recovery
- `slack-api.ts`: actual official Slack Web API HTTP calls to `auth.test`, `chat.postMessage`, and `conversations.replies`; automatic transport retries are deliberately absent
- `slack-bridge.ts`: actual `SelfHostedPlatform`, `CommandService`, `RuntimeDeliveryService`, and exact review service integration
- `slack-routes.ts`: public signed `/slack/events` and authenticated owner-only channel/provenance/outbox inspection routes
- focused Slack unit, HTTP, frontend, and real pinned-producer stdio test files
- `slack-config.ts` / `slack-runtime.ts`: strict server-owned opt-in startup, scoped standing authority, single-adapter selection, policy-change fencing and graceful lifecycle
- authenticated frontend inspection POST, nullable command-only delivery identity, qualified setup and durable Slack conversation origins

## Authority and dispatch path

There is exactly one ingress/sender choice for this installation: `authority: "dots_signed_events"`. Disable the old managed `createSlackChannel` path and any independently configured producer gateway/Socket Mode Slack loop before mounting this adapter. Pass a truthful `competingIngressEnabled` check to the service constructor; conflicting adapters fail startup. The SQLite installation lease prevents two instances sharing this installation database from sending concurrently. Running copies against independent databases cannot be fenced; deployment must keep one authoritative durable database/adapter.

Signed Slack Events -> persisted event/message identity -> persisted thread reservation -> existing canonical conversation creation/recovery -> **the platform's existing CommandService instance** -> pinned producer command admission/ownership. Web, voice, and Slack must reference that same canonical conversation and service. No new inference loop, channel-only execution mutex, managed Intelligence key, second transcript owner, or Slack-side generic approval mechanism is introduced.

The producer's existing `submit_runtime_command` performs principal/session identity and duplicate checks transactionally; this adapter does not replace its per-session turn ownership. Synthetic bridge coverage proves web and Slack use the identical CommandService/durable-session path. The separate actual Node→Python fixture passed against clean producer commit `98b9eeb7d2afc02d0e0393fea285f010000a0378`, using a loopback model and Slack server. It proves one canonical command, one model execution and one Slack POST across response loss, restart, duplicate ingress and exact-marker inspection. It does not certify a live Slack workspace or external model provider.

## Exact host integration steps

1. Construct and start the existing `SelfHostedPlatform`. Keep its producer pin, owner/profile/home identity, recovery, and delivery verification unchanged.
2. Load a server-owned `SlackConfig` from the normal server configuration file. Do not accept these fields in browser requests:

   ```json
   {
     "enabled": false,
     "authority": "dots_signed_events",
     "ownerId": "EXISTING_DOTS_OWNER_ID",
     "dotId": "EXISTING_BOUND_DOT_ID",
     "teamId": "T...",
     "appId": "A...",
     "botUserId": "U...",
     "allowedChannelIds": ["C..."],
     "allowedHumanUserIds": ["U..."],
     "appOrigin": "https://your-authenticated-dots-origin.example",
     "exclusiveIngressConfirmed": true,
     "replyAuthority": null,
     "qualification": null
   }
   ```

   Allowlisted IDs must be actual Slack IDs, not names. Empty allowlists fail configuration. Slack Connect/external shared-channel events are refused by this initial implementation. Configuration changes invalidate the qualification digest. The installation database identity also binds owner, Dot, team, app, bot identity, and application origin; replacing those identities requires a separately reviewed migration, not reopening old state with different authority.

3. Resolve signing and bot secrets only inside server-side getter functions, for example from explicitly supplied `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN`. `SlackWebApi` optionally accepts a separately authorized `recoveryToken` getter. Never put tokens, signing secret, raw headers, OAuth responses, user text, or provider exception bodies into configuration DTOs/logs/outbox. No credentials are acquired or created by this implementation.
4. Construct `CommandServiceSlackBridge(platform, config, currentPolicy)`. `currentPolicy` must check that the server's current owner-to-installation authorization remains enabled. Do not pass browser request guards into the long-lived worker; conversely, do not omit owner/CSRF auth on browser routes. The bridge additionally rechecks owner/Dot bindings, current runtime access, and canonical conversation identity after awaits.
5. Construct `SlackWebApi(botTokenGetter)` and `SelfHostedSlack(config, durableDatabase, signingSecretGetter, bridge, api, Date.now, competingIngressEnabled)` exactly once. Do not set `loopbackTestOrigin` in production.
6. Mount `createSelfHostedSlackApp({service, auth, platform})` once into the self-hosted Hono server. Its `/slack/events` route is public only in the sense that owner cookies are not required; a valid Slack HMAC and timestamp are required. TLS proxy must preserve exact raw bytes and pass the original Slack signature headers. Keep a 64 KiB body limit and request/header timeouts at the HTTP edge. The owner status/provenance/delivery routes use `OwnerAuth` and existing scope checks.
7. For setup, a signed Slack URL verification challenge can be answered before activation. Configure Events API request URL `https://<app-origin>/slack/events`; subscribe to `app_mention`, plus only the message event types needed for the allowlisted channels/DMs. Mentions establish conversations; ordinary channel messages are admitted only into an already mapped thread. Explicitly allowlisted DM messages can establish a conversation. Bots, message subtypes, edits, deletes, reactions, nested messages, and external shared events never admit a command.
8. After separately authorized connected-workspace qualification, save a bounded evidence ID and `configurationDigest(config)` in `qualification`; then set `enabled: true`. This is operator evidence, not a credential check or automatic attestation. `service.start()` first verifies `auth.test` team and bot identity, then runs the background worker. `service.stop()` waits for the active worker before closing storage. Startup/shutdown belong to the server process, never browser visits or status GETs.
9. Publish Slack readiness into `SelfHostedPlatform.setup(...).features.slack` from the qualified adapter status. Without qualification leave the feature unsupported/disabled, even if configured credentials exist. Do not route self-hosted startup through the old managed `setupStatus` Intelligence requirement.

## Integrated host and FE10 behavior

Production startup reads only `DOTS_SLACK_CONFIG_PATH`, an absolute server-owned JSON path (maximum 64 KiB), through `slackConfigSchema`. No path means no Slack adapter. Missing `enabled` defaults to false. Disabled or unqualified configuration never calls `auth.test`, starts the worker, or activates a provider. See `slack-config.example.json` for the disabled template. The same-origin owner-auth origin must exactly equal `appOrigin`; owner and Dot must match the configured producer.

Credentials are opt-in server-only `DOTS_SLACK_SIGNING_SECRET`, `DOTS_SLACK_BOT_TOKEN`, and optionally a separately authorized `DOTS_SLACK_RECOVERY_TOKEN`. They never appear in configuration/status DTOs. Startup rejects a managed `SLACK_CHANNEL_NAME`, explicitly enabled producer Slack, or Socket Mode flag alongside this adapter. `exclusiveIngressConfirmed: true` records the operator's independently checked installation selection; it is not proof against separately operated copies with a different database.

`index.ts` constructs one adapter, mounts it on the actual self-hosted app, starts it after the canonical platform, and drains it before closing the producer. Local owner pause fences Slack authorization. Shutdown awaits pending identity verification, startup, active worker and read-only delivery inspections before closing the durable ledger; late startup cannot begin new work. The existing web, voice, and Slack surfaces share the platform's CommandService. Setup projects the adapter's current state only for its exact bound Dot. Slack provenance and list origins derive from the durable ingress ledger.

Canonical command receipts do not invent a mission: `deliverySchema.missionId` is nullable, and the activity panel renders “command output.” Its Inspect button sends authenticated, CSRF-protected `POST /api/runtime/channel-deliveries/:id/inspect`; the helper checks the returned owner scope and delivery identity. GET only lists existing state. No retry action is advertised for this adapter.

## Required standing authority and private-context boundary

A valid Slack signature proves the transport source. A connected bot, display name, broad channel allowlist, or another allowed human does not authorize use or disclosure of the owner's primary private context.

Before qualification, a separately reviewed `replyAuthority` must record:

- the exact existing `ownerId`, a bounded `grantId`, and expiry in UTC epoch milliseconds
- exact `sourcePairs` of `{channelId, humanUserId}`, each inside the installation allowlists; membership in the two independent allowlists alone is insufficient
- `dataScope: "primary_context_original_command_results"` and `deliveryScope: "original_slack_thread"`
- the exact configured producer `runtimeIdentity` (principal, profile, agent, policy digest and configuration digest)
- the exact approved `projectIds` set, including every project available to this primary agent

The owner must knowingly approve this category of primary-context replies to these actual Slack channel audiences. Human ingress allowlists do not restrict who can read an existing Slack channel. Review its membership and sensitive-data boundaries; do not fabricate a grant or treat technical configuration as evidence of user consent. This initial adapter does not claim to redact or filter a private primary harness into a public-safe assistant. Use remains disabled when this standing authority is absent, expired, or unsuitable. It does not authorize credential transmission, unrelated messages, arbitrary artifacts, scheduled cross-channel output, or approval resolution.

The guard rereads the server authority file at every local authorization boundary. Changes/removal fence the running worker. Before command admission, private result read, and outbound send, the bridge checks the qualified producer's current enrolled session, non-archived primary identity, exact approved project set, and current owner/agent read+write project grants. Local owner/Dot/conversation guards are rechecked after awaited reads. Unsupported or revoked authority never falls back to Intelligence or another execution loop.

The first durable input freezes the installation authority digest. Reopening prior private conversation/outbox history with changed allowlists, grant, expiry, runtime identity, project scope or origin fails closed and requires a separately reviewed migration. An empty setup database can be qualified before its first input. This intentionally conservative policy prevents old results being released under a narrower replacement grant; this phase does not implement policy-history migration.

Outputs can address only their original durable event's team/channel/thread, with row and payload destination checks immediately before the send. Result bytes come from the original canonical command through the digest-validating immutable result reader. Exact approval links are emitted only with verified producer run/mission/review linkage; Slack replies and reactions never become approval tokens.

## Durability and failure behavior

The 2xx webhook acknowledgment happens after the event/message identities and thread reservation are committed. No provider/model network work happens before that acknowledgment. Signature freshness permits at most 300 seconds skew; event and message deduplication survives process restarts. A duplicate `app_mention`/`message` pair is coalesced without inferring authority from retry headers. Message text is preserved as untrusted user content; provenance is independently stored as verified IDs and timestamps. Canonical command order is receipt/admission order. Original provider timestamps and monotonically increasing receipt sequence remain available; the adapter cannot retroactively reorder events Slack delivers late.

Thread identity is team + channel + root `thread_ts` (or top-level `ts`). A persisted conversation-creation operation ID is recovered through the platform's existing operation ledger. Once a command has crossed the dispatch boundary, recovery only inspects the same operation; absence is not permission to re-admit. An uncertain prior command blocks later queued messages in that same thread; other threads continue. Inspection of accepted/unknown commands is paged fairly.

Immutable producer result bytes are obtained through `RuntimeDeliveryService.readResult`, which checks chunk bounds, immutable descriptor, SHA-256, publication state, and owner/session scope. The adapter never claims that Slack delivery is a browser receipt or acknowledgment of the producer's `local_runtime` destination. Provider receipt storage is separate. Scheduled cross-channel output and arbitrary web-result sharing are deliberately not exposed: the initial sender can only address the original admitted Slack event's team/channel/thread.

The durable outbox freezes destination, source artifact ID/version/hash, exact JSON payload and payload digest before sending. Normal sends return Slack's actual channel+timestamp receipt. Plain-text blocks disable automatic mention parsing and unfurling. Citations remain in answer text. Long answers keep a bounded preview plus the authenticated existing result endpoint; no private file is uploaded, publicly shared, or given a bearer/signed URL. Readers still need existing owner authentication and correct conversation access. Exact review notifications disclose no action contents; their authenticated page performs the usual digest-bound decision.

Each send is marked `sending` before the HTTP call. Process death or response loss leaves `unknown`, never `queued`. Recovery searches a bounded thread page for the exact bot author, thread, unedited fallback text, complete ordered immutable block markers and contents, persisting a pagination cursor. No match, missing history permission, incomplete pagination, malformed receipt, network error, or old lease authorizes retransmission. A matching real Slack timestamp completes the outbox receipt without a new send. Slack may sanitize output; if it alters compared block text and no exact match is available, the result conservatively remains unknown.

Only explicit HTTP 429 permits automatic resend. Retry-After is respected, workspace cooldown and ~1 message/second channel pacing are durable, exponential delays are bounded, and five attempts stop at failed. Invalid/extreme Retry-After, HTTP 5xx, ambiguous Slack errors and redirects remain unknown. Revoked authentication/channel permission becomes failed, disconnects the adapter, and prevents further sends until explicit reconnection/qualification checks. Raw provider exception messages are never logged or returned.

Storage is bounded to 256 unresolved input events, 100,000 retained event IDs, and 100,000 output records. On exhaustion, admission fails closed; no unresolved evidence is discarded. Operators must preserve dedupe records and reconcile unresolved work during any retention/migration. A currently claimed worker uses a 60-second renewable installation lease; after takeover, the old holder cannot settle records or issue additional admitted work. The HTTP call timeout is 10 seconds. Deployment host suspend/forced termination still requires the same unknown-outcome recovery.

## Qualification required before enabling

Use a real, explicitly authorized Slack workspace and channel. Minimum scopes depend on actual subscribed channel types: `chat:write`, `app_mentions:read`, and the relevant message/history scopes. Verify exact actual permissions through the installed app and the current Slack documentation. In particular, `conversations.replies` must be exercised with the actual token/channel type; inability to read replies is an inspectability blocker, not justification to broaden scopes silently. An optional recovery token requires its own explicit authorization and matching workspace verification.

Record real evidence for: wrong team/app/human/channel; invalid HMAC and old timestamp; Slack retry dedupe; bot-loop immunity; top-level/child thread mapping; web and Slack sharing one producer session/owner; ignored edits/reactions; revocation; actual throttling; accepted-send/lost-response recovery; authenticated artifact and exact-review links for unauthorized readers; process restart; disconnected adapter. Verify external app is in the allowed channels. Never enable both ingress authorities to compare them live.

No local fake can certify these checks. A passing synthetic suite only certifies the tested local mechanics.

## Local verification

From the repository root:

```sh
npx vitest run tests/self-hosted-slack.test.ts tests/slack-bridge.test.ts tests/slack-consumer-http.test.ts tests/slack-delivery-client.test.tsx tests/runtime-channels.test.ts
npm run typecheck
npx eslint src/server/runtime/slack-*.ts tests/*slack*.test.ts
```

The actual producer fixture is opt-in and creates an isolated temporary profile, synthetic credentials and loopback endpoints only:

```sh
RYOKO_TEST_CHECKOUT=/absolute/path/to/qualified-clean-producer \
RYOKO_TEST_PYTHON=/absolute/path/to/python \
npx vitest run tests/self-hosted-slack-stdio.test.ts
```

`RYOKO_TEST_KEEP=1` retains its isolated fixture for inspection. The test does not configure a real account or contact external Slack/model services.

Tests include the actual self-hosted Hono app served over loopback HTTP, its CommandService and immutable result reader, frontend POST helper/nullable DTO rendering, scoped policy and live producer-grant revocation, the raw signed request route and OwnerAuth, SQLite restart and lease takeover, concurrent web/Slack entry through the actual CommandService, and a loopback HTTP Slack server that stores a message then drops its connection before the response. That last test proves the actual Web API adapter subsequently resolves the exact stored message without a second POST. All tokens and signatures in tests are synthetic.

Official API references checked during implementation:

- https://docs.slack.dev/authentication/verifying-requests-from-slack/
- https://docs.slack.dev/apis/events-api/
- https://docs.slack.dev/reference/methods/chat.postMessage/
- https://docs.slack.dev/reference/methods/conversations.replies/

The sender uses a `block_id` marker instead of relying on an undocumented idempotency guarantee for `client_msg_id`, and does not publish private context in broadly visible Slack message metadata.
