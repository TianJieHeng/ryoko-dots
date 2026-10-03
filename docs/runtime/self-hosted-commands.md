# BE03 durable command adapter

The production self-hosted BFF owns one persistent, authenticated stdio process. It has no Intelligence, DotAgent, TanStack chat, browser-owned model, or legacy runner fallback. Web chat, page chat and an authenticated headless HTTP caller use the same command admission. Voice, Slack, schedules and legacy headless task loops remain unavailable until their own qualified adapters exist; they cannot bypass this ingress.

## Admission and lifetime

- `POST /api/runtime/conversations/:id/connect` with `{}` explicitly binds the stored canonical conversation and checks its actual agent/provider adapter. It returns a scoped setup result for that selected conversation. It does not submit input
- `POST /api/runtime/conversations/:id/commands` takes `operationId` (UUID), SHA-256 `intentDigest`, strict `intent`, and `expectedGeneration` (the browser authority/grant generation)
- Submit intent is `{operation:"submit",conversationId,text,sourceUrl}`. Text is bounded to 16,000 characters; an optional HTTP(S) source URL is bounded to 4,096 characters and cannot carry credentials
- Cancel and steer intents carry the actual `runId` and latest `expectedRevision`. Steer also carries text. They never use a mission ID as a run ID
- `GET /api/runtime/conversations/:id/commands?cursor=...` lists the current-authority server ingress records, newest-first, ten per page, for recovery even when browser storage is gone
- `GET /api/runtime/commands/:operationId` only reads the original provider-independent canonical command receipt. It never binds, submits, recreates, or retries work
- `GET /api/runtime/conversations/:id/events?cursor=...` projects bounded durable-journal invalidations. It is not a token stream. Committed text comes only from canonical history

Canonical intent uses validated fields sorted by key. The server commits operation ID, intent bytes/digest, immutable owner/agent/grant/config authority and the effective producer payload before dispatch. Source URLs and a bounded snapshot of the authorized page are untrusted reference text; they cannot grant tools, select another principal, or authorize a side effect. Later page edits do not change the already-stored payload.

An identical POST retry inspects the original receipt. Different bytes or authority under the same ID fail with 409. A missing receipt or transport timeout remains unknown; neither GET nor reconnect resubmits it. The producer, not this cache, owns command execution and canonical messages. The receipt distinguishes durable acceptance, latest execution status, actual run ID, nullable actual mission ID and canonical committed input message ID. Canonical history also carries each message's producer command ID and original UTF-8 source offsets.

Request abort, tab close, auth expiry and read cancellation detach readers. They never become a runtime cancel command. Explicit cancellation sends `runtime.command` with the real `target_run_id` plus exact journal revision. Acceptance records the request; it does not claim provider acknowledgment, external rollback, or absence of uncertain effects. Unsupported stdio server requests receive a JSON-RPC method error; no automatic approval is granted.

The service rebinds persisted nonterminal conversations on startup and after process loss, independently of an open browser. It checks stored authority and current object/page grants first. Producer admission can resume accepted, unclaimed work; claimed/uncertain work is never blindly replayed. Transport epochs, live binding generations, browser authority generations and producer writer-lease generations remain distinct. Revoked mappings are not revived. A provider outage does not require agent construction to inspect a canonical command receipt.

## Configuration and readiness

Use the owner-managed launch configuration documented in `self-hosted-conversations.md`. The reviewed profile now supports ordinary safe YAML, with strict root fields `agent_identity`, an optional empty `mcp_servers`, , optional `onboarding.seen.profile_build_offered: true` (required for command profiles to suppress interactive first-run configuration writes), and optional `model` (`default`, `provider` of `openai` or `custom`, optional `base_url`, optional `api_mode:"chat_completions"`). Unknown integrations remain gated. The profile must match the configured primary identity and its reviewed policy/config digests.

An optional server-only `providerEnvironment` object can explicitly supply `OPENAI_API_KEY` and `OPENAI_BASE_URL`. No other parent-process secrets or provider variables are inherited. Do not put real credentials in test fixtures. The producer's exact recipient plan still governs provider egress; merely providing a key or URL creates no tool or recipient authority. Strict producer identities read secrets from their own profile store. An owner-provisioned profile `.env` must contain exactly the configured provider fields in object order, each as `NAME=<JSON-quoted string>` followed by a newline. Dots verifies this match on every RPC and never writes credentials. Arbitrary profile dotenv entries, checkout `.env`, and unqualified `/etc/hermes` configuration remain rejected. Changes require restart and identity/config requalification; persisted command authority includes a digest of scoped provider configuration without storing secret values in the authority record.

Exact producer commit and generated hashes live in `src/shared/runtime/producer/provenance.json`. Only generated methods in that manifest are admitted. Runtime source cleanliness and hashes are checked before each process launch; profile bytes are fenced on every RPC. This trusts the reviewed Python installation and host; it does not attest arbitrary dependencies or provide host sandboxing.

A ready command capability means the selected bound agent has a recognized durable provider adapter and executable operation declarations. It does not certify endpoint availability, every model capability, live external service behavior, or deployment safety. The isolated loopback provider test is synthetic integration evidence, separate from live-provider qualification.

## Bounds and recovery

There are at most eight in-flight RPCs, 1 MB per buffered frame, four concurrent binds, 256 live conversation projections, and 256 unresolved ingress records. Per read, event replay takes at most eight pages of 100 events; the atomic BE00 journal cache retains at most 1,000 events per binding. History remains oldest-first and paginated. The browser reconciles bounded fresh traversals toward the tail, retains already loaded canonical chunks and the first journal watermark, and visibly reports its 8 MiB / 20,000-chunk display limit. It never silently converts partial live output into canonical text.

## Verification

Run the focused suites and actual isolated stdio proof explicitly:

```sh
npx vitest run tests/self-hosted-commands.test.ts tests/self-hosted-conversations.test.ts tests/backend-runtime.test.ts
RYOKO_TEST_PYTHON=/absolute/isolated-python \
RYOKO_TEST_CHECKOUT=/absolute/clean-pinned-producer \
npx vitest run tests/self-hosted-commands.test.ts tests/self-hosted-conversations.test.ts
```

Set `RYOKO_TEST_LONG_RUN=1` on the real test command to hold an actual SDK request for 95 seconds while detached and verify the old 90-second browser deadline does not cancel execution.

The real integration test uses the production Node launcher, actual Python stdio entrypoint, actual SDK HTTP serialization, an isolated temporary profile/database and a loopback-only mock provider. No user credentials, Intelligence service, live provider, deployment or external side effect is part of that proof. Full repository checks and target-host/browser/live-provider gates remain separately reportable.
