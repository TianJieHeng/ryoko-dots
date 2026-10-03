# Self-hosted frontend inspection and backend setup

Final local qualification is recorded in [backend-release.md](backend-release.md):767 aggregate passes, all16 stdio cases exercised successfully after one fixture correction,175 producer-interface passes, and operational/production-only boot checks. Production readiness remains false; no external gate is waived.

## Current source and readiness

The production Node entrypoint now serves the self-hosted BFF, not the retired Intelligence server. BE00–BE11 source implements one owner-authenticated canonical Ryoko stdio adapter, durable command/receipt recovery, exact controls, native pages/artifacts, scoped identities/workflows, schedules and optional computer/voice/Slack adapters. The browser talks only to same-origin authenticated routes; it does not hold runtime/provider service credentials.

Current producer: `98b9eeb7d2afc02d0e0393fea285f010000a0378`. Exact TypeScript/OpenRPC hashes and method subsets live in `src/shared/runtime/producer/provenance.json` and `src/shared/runtime/be06-producer/provenance.json`. A different source/configuration is not implicitly compatible. Current phase evidence is in `BuildJournal.md`; the historical FE12 receipt is explicitly marked in [frontend-release.md](frontend-release.md).

Source integration is not production acceptance. Optional surfaces stay unconfigured/unavailable until their own current capability, authority and qualification checks pass. Missing configuration never starts a legacy DotAgent, timer, managed channel or substitute memory backend.

## Safe frontend-only inspection

Use Node 24:

```sh
npm ci
npm run build:frontend
npm run preview:frontend
```

The static preview binds `http://127.0.0.1:4173` (or explicitly selected `FRONTEND_PORT`) and returns503 for API routes. It creates no runtime session, database, credential, model call, schedule or channel. It is an inspection preview, not an integrated app test or deployment. `npm run dev:frontend` starts Vite alone; its `/api` proxy targets loopback4310 and must point only at the intended separately configured backend.

## Supervised self-hosted backend

Use the current [canonical adapter configuration](self-hosted-conversations.md), [command configuration](self-hosted-commands.md), `.env.example`, `SECURITY.md` and [BE11 operations](../BE11-operations.md). Do not follow historical Intelligence or managed-channel activation examples to make setup green.

`npm start` launches the compiled self-hosted server through `scripts/start-self-hosted.mjs` and `scripts/operations/lifetime_gate.py`. `npm run dev` uses the same supervisor for the development server. Both require the operator-selected absolute `DOTS_STATE_GATE_PATH` and an existing trusted absolute `DOTS_GATE_PYTHON` (default `/usr/bin/python3`); the server refuses startup without the inherited gate. Do not bypass the supervisor, use a second gate inode or run a second writer against the state. Real host process/cgroup shutdown and writer census are additional qualification, not guaranteed by a local advisory lock alone.

The operator must separately provide authorized owner authentication, exact `APP_ORIGIN`, selected database/configuration and any required protected secret mounts. Use native TLS for non-loopback bindings or the expressly supported loopback TLS-proxy configuration. `RYOKO_CONFIG_PATH` is a server-owned exact producer/profile/identity configuration; the browser cannot invent it. An absent Ryoko configuration yields honest unavailable runtime state while authenticated owner-local metadata remains inspectable. No Intelligence account/key is required.

A real deployment, new credentials, provider activation, migration, permission change or channel message requires its separate authorization. This setup guide is not such authorization.

## Independent capability gates

- Conversations/history can be read without constructing a model. Connect a selected conversation explicitly before command/identity/schedule actions
- Owner-local Spaces/pages remain separate from producer project grants. Creating a Space does not grant an agent access. Native page effects require registered project mappings, actual grants and exact review/CAS
- Primary personal memory uses only its external harness; unsupported ingestion/mutation/delete/export stay unavailable. Specialists use isolated built-in namespaces. Global legacy memory stays read-only and is not injected
- Reviewed finite workflows and named specialist handoff are supported; broad team orchestration and LAYA are off
- Schedules start paused; activation/run-now need a live observed producer scheduler, valid bounded authority and original occurrence ownership
- Computers need exact real target-host evidence and current target fingerprints, permissions and fresh snapshots. Synthetic drivers are not a host qualification
- Voice needs separately qualified realtime media. Finite local STT/TTS is not implemented as this realtime UI; no automatic model install or fallback
- Slack uses one self-hosted signed-events adapter with exact actor/channel standing authority and immutable original-thread outbox. It is off by default; no managed Channels fallback or arbitrary cross-channel sharing
- Legacy task/capture reads and imported history are inert/read-only; new canonical outputs are accessed through immutable runtime result/artifact APIs

## Migration, recovery and acceptance

Do not assume local SQLite contains managed Intelligence history. Supply an authorized export and review normalization, counts, omissions and original links before import. BE11 tools preserve stable inert IDs, quarantine conflicts and honor tombstones; they never replay historical tools, approvals, schedules or effects. Actual source export and full migration acceptance remain open.

Back up only through a verified offline paired boundary covering Dots, actual Ryoko state/artifacts and every target/remote writer volume. Local fixture restore is not full-host recovery. Actual encryption/key recovery, whole process-tree shutdown, load/disk-pressure and compatible cross-version restore remain mandatory checks. Unknown accepted work keeps its original owner and operation through rollback; freeze new admissions and never replay via a legacy engine.

Final BE12 must record exact-tree focused/aggregate format/lint/type/test/build, real local stdio, production-only boot, operations results and exact-commit external CI. Missing CI is not passed. Real browser QA remains blocked with0 assertions/0 screenshots from the documented environment; no visual/media/host/provider acceptance is claimed. Full cutover also needs an explicit cohort and separate deployment acceptance.

## Dependency disposition

The browser has no hosted CopilotKit provider dependency. Runtime production dependencies exclude retired CopilotKit/Channels/TanStack execution imports; their packages remain development-only where legacy regression source still uses them. `check:production-boundary` statically checks the production entrypoint, while the isolated production-only boot checks installed runtime packaging. Neither test qualifies a Docker image, TLS host or live provider.
