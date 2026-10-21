# Ryoko Dots desktop

Run `./run.sh` or choose **Ryoko Dots** in the Linux application menu. Closing the
window leaves the backend and accepted work running. `./run.sh browser` opens the
browser instead; `DOTS_NO_BROWSER=1 ./run.sh start` starts the service alone.
The desktop shell starts the installed user service, checks the local Dots health
identity, and retains password-backed browser authentication. No secret is bundled.

The **Appearance** selector in **Settings & setup** offers Neon Relay, Redline Comms, and Blackout Channel.
Each uses its supplied background and design document under `docs/themes`.
Selection persists on this device without restarting the agent. City art is
restricted to the conversation area and darkened behind messages. Theme design
copy does not override the automatic connection behavior requested by the owner.

**Dots & API** opens the persistent multi-runtime workspace. Ryoko remains the
default Hermes agent. Codex is available as an optional native runtime using its
existing CLI login. Add another Codex Dot from an owner-configured template with
**Add Dot**. Independent Hermes profiles are enrolled through the private runtime
manifest; this does not configure temporary subagents. Names, defaults and archive
state are managed in Agent settings. Archived agents retain their history.

**API access** creates/revokes credentials restricted to the selected Dot. See
`docs/api/README.md` and `node scripts/dots-chat.mjs` for client usage. The API is
local by default. Public exposure is not enabled by this build.

**Delegated work** in an existing Ryoko chat shows recorded durable child tasks.
The multi-Dot workspace also has per-task child inspection and recent work across
Dots. Last recorded activity is not a guarantee that a child is currently alive.
Unsupported legacy/ephemeral child telemetry is not fabricated. No subagent
configuration or delegation limit was changed.

## Local build and packaging

```sh
npm ci
node node_modules/electron/install.js  # if install scripts are disabled locally
npm run build
npm run desktop:install
npm run desktop:package
DOTS_NO_BROWSER=1 ./run.sh restart
```

The Linux x64 artifact is generated at
`artifacts/local-build/ryoko-dots-linux-x64.tar.gz` (ignored by Git). It contains the
Electron shell, not private state or the agent runtime. It requires the installed
backend checkout/service; `desktop:install` writes the checkout location into the
private `~/.config/ryoko-dots/desktop.json`. It is not a standalone system installer.
Electron is pinned in the lockfile. No automatic update/download runs on launch.

On this Ubuntu workstation, a narrow AppArmor user-namespace profile allows the
Electron executable to keep Chromium sandboxing enabled. The reviewed local
profile is `deployment/ryoko-dots-desktop.apparmor`; paths must match an installation.
Never work around this requirement with `--no-sandbox`.

## State and upgrades

The new hub tables are additive to the existing database. Original conversation
IDs, grants, execution budgets and producer source pins are retained. Each extra
runtime gets its own registry/adapter database. The default selection is not a
privilege class. API runs are reconciled by the backend even with no window open.
A service restart marks unfinished projections uncertain until runtime evidence
reconciles them; it never replays a message with a new operation ID.

Before upgrading, stop Dots and other writers and take paired offline SQLite
backups plus relevant configuration and artifact trees. Restore a matching set
with services stopped. Pre-upgrade database snapshots from this build are in the
private `~/.local/share/ryoko-dots/backups` directory, alongside integrity-checked
isolated restores. Those snapshots do not claim to back up remote provider history
or the complete computer workspace. Existing `scripts/operations/safe_state.py`
remains the complete planned-state snapshot/restore utility.

Tests are local only. No CI workflows are enabled or used. A dependency lockfile
change invalidates native computer qualification; rerun its real qualification
checks before updating its recorded build identity.
