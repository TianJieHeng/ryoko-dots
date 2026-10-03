# BE09 self-hosted voice lifecycle

## Ownership and adapter choice

Dots owns durable call records, call/speaker/session bindings, transcript event receipts, media admission operations and compute-to-command mappings. Ryoko alone owns admitted commands, execution, policy, exact-action reviews, missions, canonical results and delivery. This adapter imports no Intelligence SDK, invokes no `Platform.turn`, starts no second agent loop and does not synthesize a summary on hangup.

The supported optional media route preserves the existing browser WebRTC experience through the actual OpenAI Realtime calls API. It sends the server-held credential only to the fixed official endpoint, persists the provider control handle before reading the answer, and supplies only the `ask_compute` tool. It never returns credentials to the browser, takes browser-selected provider URLs, follows redirects or silently changes providers. Its server-side call setup uses the same supported multipart `sdp` + `session` request shape as the prior media implementation. This is an external media adapter around a self-hosted control plane, not an offline realtime model.

`OpenAIRealtimeMedia` is disabled by default. A key/model does not make it qualified. `enabled`, `qualified`, `apiKey`, `model`, `voice`, `maxCallSeconds`, `maxDailySeconds`, `maxCompute` and `maxOutputTokens` are server-owned configuration only; never accept them from the browser. Only set `qualified` after target-browser and actual-provider gates have been accepted. This change does not activate any adapter, save credentials, install a package, download a model, capture a microphone or contact a live provider.

## Pinned local speech is a separate finite interaction

Producer checkout: `ryoko-agent-dots-be07-producer`, commit `98b9eeb7d2afc02d0e0393fea285f010000a0378`. The four finite-speech source files below have unchanged Git blob IDs from the earlier `9c39b3c` inspection; the current source pin is `98b9eeb`.

Verified source contracts: `tui_gateway/contracts/media.py`, `tui_gateway/methods_media.py`, `agent/media_ingress.py`, and `docs/build/be13-local-speech.md`.

The producer's actual finite route comprises `runtime.media.capabilities`, `runtime.voice.admit`, `runtime.voice.capture.start/feed/cancel`, `runtime.voice.speak/stop` and separately confirmed `runtime.voice.submit`. Results are `response_json` envelopes. Local STT requires explicitly selected local faster-whisper and complete preexisting model assets; local TTS requires explicitly selected Piper and preexisting voice assets. Missing models, packages or strict budgets remain explicit failures. Capability preflight does not load models.

The producer advertises local nonstreaming speech, client-owned playback and no backend speaker access. Strict speech reservations consume stable request IDs; repeating a consumed request must not rerun inference or replay audio. There is no independent speech-receipt inspection RPC. A lost synthesis result therefore stays unknown unless the original response was persisted; it cannot be recovered by calling `speak` again. Its stop operation is independent of mission cancellation.

These finite methods are not invoked by the realtime adapter. The current Dots FE only starts qualified `realtime_webrtc` + `openai_realtime_v1`; it explicitly rejects `finite_local` as a realtime call. Local speech must remain unavailable/off in this integration rather than fabricated as streaming support. Adding a separate finite UI requires a separately pinned media transport allowlist, immutable speech reservations, reviewed transcript submission, finite audio playback and actual model qualification. No such capability is claimed here.

## Authority and canonical compute

Each call binds the authenticated owner/speaker, principal, profile, Dot, gateway, project, authority generation, conversation and durable session. These are server-resolved values, never caller-supplied speaker identity or permission grants. Conversation authorization must include current owner/CSRF state, archive/revocation, page/Space grants and relevant pause policy. Reconnect may change a live transport ID without changing durable call identity; changed owner, grant or durable session fails closed.

Each compute request has an immutable browser operation UUID, provider tool-call ID and request digest. A unique `(owner, call, toolCallId)` record reserves one internal canonical command UUID before dispatch. Reusing any identity with changed intent fails; reusing the tool-call ID under another operation UUID directs inspection of its original operation. The global operation registry prevents collisions with conversation/command/control families.

Only a fresh reservation calls existing `CommandService.admit` with a canonical `submit` intent in that same conversation. No effect/approval/cancel or destination fields are accepted. Media-model text is explicitly labelled untrusted, non-approval research/reasoning input. This label is not a sandbox: the producer's permission/effect/review policy remains the enforcement boundary. Do not enable voice compute in a deployment that treats arbitrary model/transcript text as an exact-action approval.

Accepted input is not completed output. Compute receipts stay accepted/unknown until the canonical command receipt establishes completion. Optional spoken text must come from `RuntimeDeliveryService.readResult`, with its digest verification and `publicationState === 'committed'`; do not acknowledge delivery or fabricate success. Output over the 20,000-character voice receipt limit is omitted, with the canonical result still available elsewhere. End/detach suppresses spoken output without destroying canonical results. Late/out-of-order receipt reads cannot regress established completion/rejection.

## Separate lifetimes and recovery

- Browser microphone capture/mute, playback stop/mute and discarded audio remain local browser operations. Backend receipt cannot prove physical capture or playback
- `media_connected` records a browser connection report; it is not live-media qualification
- `end_media` requires `cancelMission: false`; it ends/detaches media and requests provider hangup, never command cancellation
- `detach_compute` stops new media-bound compute and suppresses result speech, leaving accepted commands intact
- Mission cancellation remains the existing authenticated exact-run command/control route with its own immutable operation, revision and policy
- Transcript snapshots and identified transcript events are untrusted local call evidence, never new commands or summaries
- Identified events deduplicate by immutable event ID and unique sequence, sort out-of-order arrivals and accept late events after ending without changing call duration
- Legacy unsequenced end snapshots can extend a matching prefix; conflicting content is rejected. Structured events take precedence

Media/compute/control reservation is durable before dispatch. Inspecting any operation is read-only with respect to remote effects: GET never starts a call, repeats hangup, reruns compute or synthesizes audio. A crash before canonical admission can leave a reserved compute unknown even if no command was sent; it is intentionally not retried. A lost media admission without a provider handle remains unknown and blocks another call. A provider-hangup response loss reserves that single hangup for inspection; changing control UUID or restarting does not send another hangup. A later locally persisted successful hangup receipt can reconcile another pending end-control inspection without dispatch.

The server owns a 30-second activation deadline and bounded call expiry. `start()` runs the receipt-aware cleanup sweep; restart resumes stored deadlines. `close()` stops new mutations, drains started mutations, then tears down known media without cancelling commands. Drain HTTP readers before closing its SQLite handle. Stop voice before stopping `CommandService`/transport. If cleanup cannot be persisted, `health()` reports an operator-reconciliation failure instead of emitting raw private errors.

Unknown remote state is not automatically cleared by a timer, `404`, configuration rotation or a second UUID. The provider may retain media after an uncertain admission/hangup. Operator confirmation and an explicit supported reconciliation workflow are required before releasing that safety fence; do not directly delete unknown rows. The current provider API offers no independent receipt-inspection flow implemented here.

## Bounds and privacy

One active/unresolved media session per owner. Defaults: 300 seconds/call, 1,800 reserved media seconds/UTC day, six compute requests/call and 512 output tokens/realtime response. Server schema caps: 900 seconds/call, 14,400 seconds/day, 20 compute requests and 1,024 response output tokens. Daily media budget conservatively reserves the whole allowed duration, including rejected/uncertain attempts; it does not refund guessed usage. Calls crossing midnight remain charged to their admission day and continue occupying the single-call gate.

This is duration/request accounting, not a guaranteed currency ceiling. Provider-side spend/quota controls and live price/resource measurements are required for a monetary cap. A lost provider hangup can outlive the local lease; do not claim local teardown proves remote billing stopped. No short-lived provider credentials are needed because the browser receives only an SDP answer, not an API key. Signalling material is sensitive, scoped and short-lived at the provider; retained SQLite state must be protected like other private conversation state.

Other bounds: 100,000 SDP bytes; 20,000 transcript characters and 1,000 identified events/call; 100 events/append; 500 displayed calls; 16,384 retained operation receipts before further admission is refused. Context to media is at most 12,000 characters and must be authorized for that configured provider. Compute wrappers must fit the shared 16,000-character canonical command limit. Responses are incrementally bounded, private response bodies/errors are not reflected, and there is no raw audio/transcript telemetry.

## Application integration and configuration

Production `index.ts` constructs the optional media adapter with `loadVoiceMedia(RYOKO_VOICE_CONFIG_PATH)`. The absolute JSON file is server-owned, bounded to 16 KiB, strictly validated and never populated by the browser. Omission yields a disabled adapter. Legacy `VOICE_*` and command-provider credentials are not read for media. An explicit example (without credentials or activation) is:

```json
{
  "enabled": false,
  "qualified": false,
  "model": "deployment-selected-realtime-model",
  "voice": "marin",
  "maxCallSeconds": 300,
  "maxDailySeconds": 1800,
  "maxCompute": 6,
  "maxOutputTokens": 512
}
```

The deployment operator supplies `apiKey` through the protected server configuration only after explicit provider/data-sharing authorization. `enabled` and `qualified` must both be explicitly true and the key/model present before the adapter advertises availability. A key alone never activates voice. This implementation ships no active provider configuration and no model installation. Do not set `qualified` from fixture test success.

`SelfHostedPlatform` owns the voice service whenever the canonical transport exists. The host shares the existing `CommandService`, conversation/page/project authorization and digest-verified `RuntimeDeliveryService`. It requires an explicitly connected live conversation before new media or compute, rechecks managed identity where available, rejects archived page work, and reads canonical owner/profile pause state. It does not forward earlier canonical history to the media provider implicitly. Only media conversation and an explicitly requested verified compute result reach the configured provider. The media API receives only `ask_compute`; all task/tool/compute ownership stays in Ryoko.

The application mounts the bounded voice routes after the existing owner authentication, CSRF, origin and body limits. The profile is resolved from the configured Dot; foreign/project/specialist scopes remain unavailable unless they exactly match the frontend's authenticated connection. The generic operation inspection route recognizes stored voice control operations before the normal control dispatcher. Operation UUIDs share the durable registry with conversation/command/control/schedule families.

`features.voice` reflects actual adapter enablement, qualification and cleanup health. `/api/runtime/voice/health` is authenticated and reports redacted cleanup failures. The current UI requires explicit runtime connection before microphone access, and labels media-provider captions separately from verified Ryoko task results. Call transcripts remain local evidence rather than canonical assistant completion. No transcript is sent back as a summary command.

`start()` starts only the cleanup lease sweep, never a media call. Authenticated canonical pause/resume POSTs synchronize media state after reading current canonical control; pause hangs up active media but does not cancel commands. Existing local pause settings are an additional startup safety fence, not a second canonical control plane. A resumed control never starts a call. The sweep checks each active lease against current scope, connection and canonical pause, ending media conservatively after revocation or transport loss. GET operation/call reads never dispatch media, repeat hangup or compute.

On the successful graceful path, shutdown closes/drains HTTP requests before closing platform stores. Platform stop drains voice mutations and hangs up known media before stopping command recovery/transport. The existing global shutdown deadline can still force process exit while adapter cleanup is unfinished; it does not prove process-tree drain or safe completed store teardown after deadline exhaustion. BE11 must qualify abort/escalation and that failure path. Neither local teardown nor process exit proves a remote provider stopped billing. Retain unresolved receipts for operator reconciliation.

Retain/migrate operation records at the same consistent backup boundary as Dots metadata and Ryoko mappings. Owner-authorized retention/export and unknown-media reconciliation remain deployment gates; automatic cleanup must never erase unresolved receipts.

## Validation evidence and remaining gates

Integration validation uses an isolated `/tmp/dots-be09/integration` copy with shared installed node dependencies. The consumer HTTP integration listens only on loopback and exercises the actual owner-authenticated Hono application, platform, command/delivery services and durable SQLite ledgers. Canonical RPC and media transport responses are deterministic fixtures; no external service is contacted. New tests use synthetic fetch responses and actual Dots `WorkspaceStore`, `CommandService`, command ledger/projection and voice ledger. The canonical producer transport in those new tests is a deterministic fixture; no live provider, microphone, speaker, credential, model activation or download is involved.

Focused tests cover canonical command deduplication, pre-admission crash, lost response/restart, distinct provider tool UUID conflict, late/out-of-order transcript events, bounded compute/duration, missing/unqualified media, exact owner/generation fences, no-replay admission/hangup, detached completion, invalid/oversized SDP and official provider URL validation. Legacy voice and FE/runtime command tests remain included.

Remaining mandatory gates: final assembled aggregate qualification, real browser microphone denial/capture/playback/teardown and reconnect, actual provider SDP/media/control round trip, measured latency/cost, target deployment quotas, owner-authorized retention/export/reconciliation and consistent backup/restore. Synthetic evidence does not mark the realtime adapter qualified or BE09 production-ready.

Integration coverage adds authenticated real HTTP/CSRF, explicit-connect admission, cross-family control inspection, corrupt or unpublished result withholding, completed-result speech, hangup/restart/detach suppression, canonical pause/resume and lease pause propagation, missing media configuration, delayed-authorization hangup and expiry-before-sweep races, and HTTP-drain ordering. These are synthetic consumer proofs, not actual microphone, speaker, browser or provider qualification.

### Real canonical-compute consumer gate

`tests/self-hosted-voice-stdio.test.ts` ran against the actual pinned producer `98b9eeb7d2afc02d0e0393fea285f010000a0378` with Python 3.14.7. Dots used its real authenticated application, `StdioConversationTransport`, durable command/call ledgers, canonical owner control and immutable result delivery. The only model endpoint was an explicitly allowlisted loopback fixture with a synthetic key; media signalling/hangup was synthetic and did not contact a provider.

One `runtime.command` and one loopback model request were observed across duplicate compute POST, app-route reload, canonical pause while the model request was in flight, media hangup, resume, canonical completion and a full Dots/Python restart after completion. Result bytes and SHA-256 remained identical after restart; completed compute retained its original command ID. Hangup and pause did not dispatch mission cancellation, and result reads did not acknowledge delivery. Completed detached compute remained available canonically while spoken text stayed suppressed. The focused gate passed in 13.55 seconds, including 10.84 seconds of test execution, on the recorded fixture run.

This gate qualifies the real canonical compute path with a loopback model, not realtime speech, browser hardware, external provider behaviour, production costs or shutdown-time process-tree completion. The full process restart in this test occurs after canonical output commits; in-flight restart remains a separate command-recovery qualification.
