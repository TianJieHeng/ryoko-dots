# BE02 canonical conversation adapter

The production `src/server/index.ts` now owns a self-hosted BFF. It imports no Intelligence runtime, DotAgent, local model/tool loop, legacy runner, voice or managed-channel startup. Legacy modules and their regression tests remain explicit retirement seams for later phases. A fresh process needs no Intelligence credential or account. The owner session/CSRF/origin boundary is mandatory.

BE02 established canonical conversation storage. BE03 adds the durable command adapter described in `self-hosted-commands.md`; specialist selection and other surfaces remain unavailable until their planned backend phases. This staged limitation does not remove those phases or establish full readiness. Native Space/Dot/page reads and revision-checked manual page writes remain local.

## Trusted single-owner launch

Set `RYOKO_CONFIG_PATH` to an absolute JSON file readable only by the deployment owner. All paths and identity pins are server-owned; none are accepted from browser parameters. The shape is:

```json
{
  "checkout": "/absolute/pinned/ryoko-agent",
  "python": "/absolute/isolated-venv/bin/python",
  "home": "/absolute/isolated-ryoko-profile",
  "runtimeDirectory": "/absolute/isolated-runtime-directory",
  "ownerId": "same-as-OWNER_ID",
  "dotId": "existing-workspace-dot-id",
  "gatewayId": "local-ryoko",
  "identity": {
    "principal_id": "configured-principal",
    "profile_id": "configured-profile",
    "agent_id": "configured-primary",
    "policy_digest": "reviewed-64-character-sha256",
    "config_digest": "reviewed-64-character-sha256"
  }
}
```

`ownerId` maps the authenticated Dots owner to this exact producer identity; the principal need not be named identically. Obtain the existing Dot ID from the authenticated workspace read. Review identity digests from the producer's configured identity resolver/capabilities through an owner-controlled offline process. Do not invent digests or paste credentials into this file. The adapter verifies the returned identity before registering the mapping. Restart with reviewed configuration after any profile change; an existing persisted mapping cannot be silently replaced or revived.

The original BE02 passive profile restriction was: `config.yaml` must contain JSON, with only `agent_identity`, optional empty `mcp_servers`, and optional `model` containing `default` and `provider: "openai"`. The active agent must be the primary agent. No `.env` may exist in the profile or checkout, and an `/etc/hermes` managed configuration requires separate qualification rather than bypass. This restriction prevents inherited secrets, startup discovery and unrelated configuration from activating integrations during this stage. BE03 now accepts ordinary safe YAML and explicitly scoped provider configuration as documented in `self-hosted-commands.md`; executor and integration configuration remain gated.

The launcher uses an absolute Python interpreter, fixed `-u -m tui_gateway.entry`, no shell, an isolated HOME/profile/runtime directory, fixed PATH and a small explicit environment. It does not inherit API keys, owner tokens, Python injection variables or provider settings. Diagnostics are drained without retention or forwarding. The exact Git HEAD, staged/unstaged tracked-tree cleanliness (including hidden index flags), configuration and both generated-schema hashes are checked before spawning; profile bytes are rechecked before each call. The configured checkout/Python/profile are trusted owner inputs, not a sandbox for arbitrary code. Git uses a fixed `/usr/bin/git` executable without a shell; this check is not cryptographic attestation of the Python environment, untracked dependencies, or entire host. Target-host filesystem/process isolation remains a separate deployment gate.

Exact producer pin: `a4dc372345eb4a4780f2e4301b2a474c73bc00b0`; TypeScript `38a8129a5d98bf222b8871cfa73683e123018b20ba0c534135b476eb6cebc54e`; OpenRPC `1086c496bd3180bd69de90c82f63a6aefebeba3f20150e468f39b3a9a602b902`. `scripts/pin-producer-contract.mjs` extracts the transitive exact schemas/types. The three-method read-only adapter remains separately allowlisted. The BE03 allowlist adds explicit canonical bind, durable command submission, canonical receipt inspection and bounded runtime journal reads. Conversation storage and history remain independent of agent construction.

## Existing owner-managed ChatGPT profile

The local workstation uses the existing Ryoko profile instead of creating a second
persona. Its private launch JSON adds:

```json
{
  "reviewedProfile": {
    "configSha256": "<SHA-256 of the reviewed config.yaml bytes>",
    "dotenvSha256": "<SHA-256 of the reviewed .env bytes, or empty bytes if absent>",
    "codexHome": "/absolute/existing/codex-home"
  }
}
```

This explicit enrollment accepts the existing profile's additional configuration
only when both hashes match. The model must be `provider: openai-codex` with an
explicit `default`, and `codex_auth_source` must be `codex_cli`. The profile's
principal/profile/primary-agent identity and returned policy/configuration digests
must still match. `providerEnvironment` is forbidden in this mode. No credentials
are inherited from the backend process or copied to a new store. The producer
uses its existing read-only Codex credential resolver; an expired login requires
renewing the Codex login before reconnecting.

Review integrations, secret sources and identity policy before computing these
hashes. Changes require re-enrollment and restart; the launcher does not silently
approve new profile bytes. The owner-managed interpreter, profile code, skills and
configured secret loader remain trusted local code. This mode does not claim the
minimal profile's isolation or independently qualify optional Dots integrations.
See [local startup](../local-startup.md) for the installed profile and validation.

## Browser routes

All routes are under `/api/runtime`, authenticated, same-origin and bounded. Unknown/duplicate query fields and authority-shaped JSON fields are rejected.

- `GET /setup?dotId=...`: selected verified scope; no global selected-agent state
- `GET /conversations?dotId=...&cursor=...&query=...&archived=false`: newest-created conversation list; literal title search; alias `/conversations/search`
- `POST /conversations`: `{operationId,dotId,title}`
- `POST /pages/:id/conversation`: same fields plus `spaceId`; durable `(pageId,dotId)` reservation makes concurrent first creates share one producer key
- `GET /operations/:operationId`: original producer receipt lookup only; never creates, binds, retries or queues work
- `GET /conversations/:id/history?cursor=...`: oldest-first safe committed text chunks, stable message IDs, physical lineage metadata and explicit omission notices
- `POST /conversations/:id/rename`: `{operationId,expectedRevision,title}`
- `POST /conversations/:id/archive`: `{operationId,expectedRevision,archived}`; metadata visibility only
- `GET /conversations/:id/export`: bounded-page NDJSON safe-text stream; only an explicit final `complete:true` record certifies completion

Each mutation persists UUID, canonical intent digest, immutable identity scope and producer key before sending. Identical POST retries recover the original receipt; conflicting bytes return 409. A timeout/disconnect/invalid response preserves `outcome_unknown`. A missing read-only receipt remains unresolved, never an excuse to create another conversation automatically. Create/rename/archive receipts preserve original metadata, so replay does not overwrite a newer projected revision. Conversation IDs and durable lineage roots remain distinct from nullable, unbound live handles.

Browser cursors are validated to the producer's 2048-character bound. History traversal is oldest-first; continuation pages append. UTF-8 source offsets are not JavaScript string indexes and may span sanitized gaps. The browser deduplicates chunks by stable message/offset and limits accumulation visibly; it does not silently truncate a transcript or fabricate messages. Producer traversal pins an append watermark, not an immutable backup against historical edits/deletions. Safe export includes ordinary text only, not private tools/system prompts/hidden rows, a restore format, or a full runtime backup. Export is bounded to 10,000 pages with an incomplete outcome if exceeded; no whole-export memory buffer exists.

Owner authentication and stored grant/generation authority are rechecked after asynchronous reads and before streamed chunks. Page access is checked separately from runtime project authority; no fabricated Ryoko project binding is created for a local Space. Explicit project/artifact integration remains BE05.

## Reproducible verification

`npm test` runs isolated unit/contract regressions. The real stdio test is conditional because its Python environment and producer checkout are external prerequisites. Run it explicitly; missing prerequisites make this command fail rather than report a false pass:

```sh
RYOKO_TEST_PYTHON=/absolute/qualified-python \
RYOKO_TEST_CHECKOUT=/absolute/pinned/ryoko-agent \
npm run test:runtime-stdio
```

The test creates temporary owner/profile/runtime databases, launches the actual producer entrypoint through Node pipes, checks identity and schema, creates/lists/reads canonical conversations, exercises metadata CAS and concurrent page reservation, restarts and recovers the original operation. No generic session bind, model/provider invocation, new credentials, production data migration or deployment is requested. Run repository lint/typecheck/format/test/build against the final assembled changes. Actual browser interaction and target-host/live-provider qualification remain distinct gates.

### Explicit user turns keep conversations usable after idle

Dots marks each newly submitted user message with `new_user_turn: true` in the
owner-authenticated producer command. Hermes stores that marker with the command
and creates an independent task budget in the same conversation. The queue's
five-minute start TTL no longer becomes the chat's lifetime or the execution
limit for these turns; the accepted profile task policy remains authoritative.
Steering, cancellation, automatic work, children, and retries do not receive a
fresh budget. Existing transcripts, prior budget accounting, and command IDs
remain intact. No data migration or new chat is required for an old conversation.
