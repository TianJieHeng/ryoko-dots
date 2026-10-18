# Local workstation setup — 2026-10-18

Open **http://127.0.0.1:4310** on this workstation. The authenticated workspace supports manual Spaces/pages; the agent is not connected yet.

The dedicated owner access token is stored in `/home/ryoko/.config/ryoko-dots/owner-token` (mode 0600). Read it locally and enter it in the login screen. It is separate from the machine password. No token is committed in this repository or included in the validation artifacts.

## Service controls

```bash
systemctl --user status ryoko-dots.service
systemctl --user restart ryoko-dots.service
systemctl --user stop ryoko-dots.service
systemctl --user start ryoko-dots.service
journalctl --user -u ryoko-dots.service -n 50
```

The service is enabled for the user's login session. User lingering is not enabled, so this is not a claim of unattended boot availability before login. The installed unit is `/home/ryoko/.config/systemd/user/ryoko-dots.service`; its reviewed source is `deployment/dots-local.service.example`.

Do not run `npm start` or `npm run dev` alongside this service. Stop it first. For development, change the private `.env` `APP_ORIGIN` to `http://127.0.0.1:5173` and use `npm run dev`; restore `http://127.0.0.1:4310` before restarting the service.

## Installed paths

| Item                     | Location                                              |
| ------------------------ | ----------------------------------------------------- |
| Repository               | `/home/ryoko/Desktop/rdots/ryoko-dots`                |
| Node                     | `/home/ryoko/.local/opt/node-v24.22.0-linux-x64`      |
| Node/npm/npx entrypoints | `/home/ryoko/.local/bin`                              |
| Private environment      | repository-root `.env` (ignored, 0600)                |
| Dots database            | `/home/ryoko/.local/share/ryoko-dots/dots.sqlite`     |
| Shared lifetime gate     | `/home/ryoko/.local/share/ryoko-dots/gate/state.lock` |
| Owner token              | `/home/ryoko/.config/ryoko-dots/owner-token`          |
| Validation evidence      | repository `artifacts/local-build` (ignored)          |
| Intended agent source    | `/home/ryoko/Desktop/rhermes/ryoko-agent`             |

Keep the gate path stable. Manual copies of a live SQLite database are not the documented paired recovery procedure.

## Verified locally

- Node 24.22.0/npm 11.19.1, locked application dependencies, and Playwright Chromium installed.
- Dependency audit reduced to zero reported vulnerabilities with compatible lockfile updates.
- Format, lint, TypeScript, build, runtime-fixture integrity and production import checks passed.
- All 33 Python operations tests passed. JavaScript aggregate: 766 passes, one import-time timeout, 11 conditional skips; the repaired Slack file then passed all 41 cases. See `BuildJournal.md` for exact run boundaries.
- Production boot smoke passed after correcting its startup deadline and failure cleanup.
- Actual browser login, Space/page creation, rich-text autosave, reload persistence, narrow-screen navigation and settings Escape passed with no uncaught page errors.
- Anonymous readiness is denied. Authenticated storage is ready and conversations are honestly unconfigured.
- A second startup against the same gate is refused. Page title/content survived supervised shutdown and service startup.

The `Local setup` Space contains a `Ready for Ryoko` page created during validation. Browser screenshots and JSON evidence are local ignored artifacts.

## Agent handoff and remaining work

Per the owner's instruction, the agent checkout was inspected but not installed or changed. Its clean HEAD is `a5ca09642c95d98702b3b21d004fe2551d4857ab`. Dots currently pins `98b9eeb7d2afc02d0e0393fea285f010000a0378`, which exists in that checkout's history. The newer source changes runtime decision contracts/events, including `decision.bundle`, and its generated hashes differ:

| Contract at supplied HEAD | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| TypeScript                | `56e9155680b3ff9af383961fed69aba78fe1e9aa4e996f0f3e44a8b2dc16aeaf` |
| OpenRPC                   | `5bc7e0947e867eb3ca96662660c8073be8f84bf91aaf34f3b6c7bcde3dc2960c` |

Before connection, choose the intended producer revision, review contract differences, regenerate consumer subsets only after compatibility review, and run actual stdio tests against that revision. Never just disable source-pin checks.

The local Codex CLI reports a ChatGPT login. The supplied agent supports an optional Codex app-server runtime, but Dots' strict profile validator currently allows only `openai`/`custom` with optional `chat_completions` and no `openai_runtime`. OAuth-backed chat therefore needs explicit adapter/profile support and end-to-end testing. No OAuth credential was read, copied or injected. Consult the supplied agent's Codex runtime guide and [official Codex authentication documentation](https://learn.chatgpt.com/docs/auth).

The historical synthetic browser harness now launches, but recorded nine passes/eight failures before aborting at a narrow-screen setup wait. Several fixtures assume pre-migration automatic connection and need reconciliation with current contracts. This is unresolved browser integration work, not a production-readiness pass. Actual stdio/provider tests, optional computer/voice/Slack qualification, paired encrypted recovery and deployment acceptance remain pending.

Continue from Phases 5–8 of `implementation_buildPlan.md` when the owner is ready to install/connect the agent. All checks remain local; CI stays disabled.
