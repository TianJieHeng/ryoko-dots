# Local workstation setup — 2026-10-21

Run `./run.sh` and open **http://127.0.0.1:4310**. The default Dot is **Ryoko**, connected to the existing Hermes `ryoko` profile. Create or select a conversation and send a message. Chat connects to Ryoko automatically and reconnects after temporary interruptions; drafts remain saved while it connects. Cold startup and the first connection can each take tens of seconds.

Sign in with your configured Dots password. The private server credential is stored in `/home/ryoko/.config/ryoko-dots/owner-password` (mode 0600), referenced by the legacy `OWNER_TOKEN_FILE` setting. No password is committed to the repository.

## Service controls

From the repository, run `./run.sh` to start the installed user service, wait for
backend health, and open the UI. It works from any working directory. The backend
serves the built UI and owns the configured agent's stdio process, so there is no
separate UI or Hermes daemon to launch. The service continues running after the
script exits.

Use `./run.sh stop`, `./run.sh restart`, `./run.sh status`, or `./run.sh logs` for
routine controls. After source changes, run `./run.sh build` then
`./run.sh restart`. Set `DOTS_NO_BROWSER=1` to suppress browser opening.

The backend launches Hermes automatically and serves the built UI. Its user service
is enabled at login. Python 3.12.3 is installed system-wide; Hermes also has managed
Python 3.14.7. The `hermes` command points to the supplied agent installation at
`/home/ryoko/Desktop/rhermes/ryoko-agent`, with `ryoko` already the active profile.

Dots uses a clean detached worktree at `/home/ryoko/Desktop/rhermes/dots-runtime`
and its PM-built `.venv/bin/python`. This preserves local CLI edits in the original
checkout while enforcing the backend's exact source pin. Both use the existing
`/home/ryoko/.hermes/profiles/ryoko` profile. Its model is `gpt-6-astra`, provider
`openai-codex`, and `codex_auth_source: codex_cli`. The producer reads the existing
Codex login; Dots does not copy tokens or use an API key.

The private launch configuration is `/home/ryoko/.config/ryoko-dots/ryoko.json`,
selected by `RYOKO_CONFIG_PATH` in `.env`. Its `reviewedProfile` section pins the
reviewed profile YAML and dotenv bytes by SHA-256 and supplies the explicit Codex
home. Profile changes require review and refreshed pins before restarting Dots.
The normal restricted-profile validator remains the default for other deployments.
Existing Ryoko integrations, including its scoped personal-memory MCP and command
secret loader, are part of this explicitly enrolled local profile. This enrollment
trusts owner-maintained profile code and the interpreter; it is not a host sandbox.

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
| Owner password           | `/home/ryoko/.config/ryoko-dots/owner-password`       |
| Validation evidence      | repository `artifacts/local-build` (ignored)          |
| Intended agent source    | `/home/ryoko/Desktop/rhermes/ryoko-agent`             |

Keep the gate path stable. Manual copies of a live SQLite database are not the documented paired recovery procedure.

## Current verification — 2026-10-21

- PM built `/home/ryoko/Desktop/rhermes/dots-runtime/.venv` with the locked runtime,
  development and test dependencies. No system Python replacement was needed.
- Producer pin: `a4dc372345eb4a4780f2e4301b2a474c73bc00b0`. Review against the old
  pin found no changed RPC method or server callback definitions. Changes add
  decision-bundle events, planner metrics, optional decision-policy metadata and
  fallback enum members. Both exact consumer subsets were regenerated. Source
  cleanliness and generated-schema hash checks remain enforced.
- The real profile passed the stdio capability/identity handshake. The backend
  admits only its reviewed YAML/dotenv hashes and explicit Codex credential home.
- Fixed cold-start deadlines (60-second initial handshake and agent construction)
  and the UI losing its explicit connection when enrollment advances scope.
- Real browser login, conversation creation, connection, submission, durable
  completion, fresh login, full service restart, explicit reconnect and saved-history reload passed. The real provider reply
  was “I can hear you, Botwin. Your Dots message came through.” The producer recorded
  one model call and zero tool turns for this test.
- The test conversation is `20261021_125650_849947` (shown as **A new thought**).
  Screenshots and local scripts are in ignored `artifacts/local-build/`.
- Typecheck, lint, builds, production import boundary and production boot smoke
  passed. All 16 stdio integration cases passed across the full run and focused
  reruns after correcting cold-start test deadlines, as did 33 focused runtime
  regressions. No CI was used.

Voice, computers, Slack and scheduling remain independently unconfigured. Text
chat uses the existing primary profile, including its personal-memory policy;
this setup does not grant new Dots page/computer integrations.

## Earlier validation — 2026-10-18

- Node 24.22.0/npm 11.19.1, locked application dependencies, and Playwright Chromium installed.
- Dependency audit reduced to zero reported vulnerabilities with compatible lockfile updates.
- Format, lint, TypeScript, build, runtime-fixture integrity and production import checks passed.
- All 33 Python operations tests passed. JavaScript aggregate: 766 passes, one import-time timeout, 11 conditional skips; the repaired Slack file then passed all 41 cases. See `BuildJournal.md` for exact run boundaries.
- Production boot smoke passed after correcting its startup deadline and failure cleanup.
- Actual browser login, Space/page creation, rich-text autosave, reload persistence, narrow-screen navigation and settings Escape passed with no uncaught page errors.
- Anonymous readiness is denied. Authenticated storage is ready and conversations are honestly unconfigured.
- A second startup against the same gate is refused. Page title/content survived supervised shutdown and service startup.

The `Local setup` Space contains a `Ready for Ryoko` page created during validation. Browser screenshots and JSON evidence are local ignored artifacts.

## Historical handoff — 2026-10-18 (superseded for local chat)

Per the owner's instruction, the agent checkout was inspected but not installed or changed. Its clean HEAD is `a5ca09642c95d98702b3b21d004fe2551d4857ab`. Dots currently pins `98b9eeb7d2afc02d0e0393fea285f010000a0378`, which exists in that checkout's history. The newer source changes runtime decision contracts/events, including `decision.bundle`, and its generated hashes differ:

| Contract at supplied HEAD | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| TypeScript                | `38a8129a5d98bf222b8871cfa73683e123018b20ba0c534135b476eb6cebc54e` |
| OpenRPC                   | `1086c496bd3180bd69de90c82f63a6aefebeba3f20150e468f39b3a9a602b902` |

Before connection, choose the intended producer revision, review contract differences, regenerate consumer subsets only after compatibility review, and run actual stdio tests against that revision. Never just disable source-pin checks.

The local Codex CLI reports a ChatGPT login. The supplied agent supports an optional Codex app-server runtime, but Dots' strict profile validator currently allows only `openai`/`custom` with optional `chat_completions` and no `openai_runtime`. OAuth-backed chat therefore needs explicit adapter/profile support and end-to-end testing. No OAuth credential was read, copied or injected. Consult the supplied agent's Codex runtime guide and [official Codex authentication documentation](https://learn.chatgpt.com/docs/auth).

The historical synthetic browser harness now launches, but recorded nine passes/eight failures before aborting at a narrow-screen setup wait. Several fixtures assume pre-migration automatic connection and need reconciliation with current contracts. This is unresolved browser integration work, not a production-readiness pass. Actual stdio/provider tests, optional computer/voice/Slack qualification, paired encrypted recovery and deployment acceptance remain pending.

Continue from Phases 5–8 of `implementation_buildPlan.md` when the owner is ready to install/connect the agent. All checks remain local; CI stays disabled.

### Ryoko's local computer

The workstation installation also runs `ryoko-computer.service`, a loopback-only
supervisor on port 4311 and signed computer target on port 4312. The Dots service
starts it automatically; stopping/restarting Dots also stops/restarts its computer.
The Computer button opens the live browser, workspace files, and isolated terminal.
This is Ryoko's persistent browser and workspace, not control of the owner's GNOME
desktop. The shell has no network and only its workspace is writable.

- Workspace: `/home/ryoko/.local/share/ryoko-dots/computer/workspace`
- Browser profile: `/home/ryoko/.local/share/ryoko-dots/computer/profiles`
- Private service configuration: `/home/ryoko/.config/ryoko-dots/computer.env`
- Host acceptance report and fingerprint: `qualification-report.json` and
  `qualification.json` under the computer data directory.
- Logs: `journalctl --user -u ryoko-computer.service -n 60`

The local supervisor uses the same authenticated lifecycle and signed target
protocol as the Docker deployment. It can only manage its one configured Dot;
no browser-supplied executable, identity, path, or port is accepted. Private
master and supervisor credentials are not forwarded to the target. Permissions,
model proposals, approvals, takeover, and durable receipts remain enforced.
The service template is `deployment/ryoko-computer.service.example`; the installed
Dots unit has a `Wants`/`After` dependency on it.

Ubuntu's AppArmor profile `/etc/apparmor.d/ryoko-dots-computer` allows user
namespaces for the installed Playwright Chromium binaries and `/usr/bin/bwrap`.
Chromium sandboxing remains enabled. New browser versions require reviewing the
exact executable paths and repeating the host checks. `npm run build` compiles
the standalone target into `dist/computer`; changed target/runtime/OS dependency
fingerprints require a fresh host qualification before it will execute actions.

The computer grants were enrolled in the existing Ryoko profile. Use the new
**Ryoko’s computer** conversation or create a new chat to use those tools; existing
conversations retain their original frozen policy and cannot acquire the new
permissions. Pre-change profile and database backups are in the private
`computer/profile-backup` directory. No prior sessions or snapshots were deleted.
