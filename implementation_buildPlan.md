# Ryoko Dots implementation and startup plan

Prepared: 2026-10-18. Baseline: `main`, commit `aaff582`.

## Goal and execution rules

Bring this checkout through three observable milestones: a frontend preview, an authenticated local workspace, and working chat backed by the pinned Ryoko runtime. Qualify optional integrations and persistent deployment afterward.

This is an implementation guide. Creating this document does not install dependencies, change credentials, start services, or certify production readiness. Check off each phase only after recording its actual results.

- Work from `/home/ryoko/Desktop/rdots/ryoko-dots`.
- Follow `AGENTS.md`: **no CI**. Run validation locally. Older documentation requiring CI is superseded by this policy.
- Preserve the existing lockfile and runtime source pins. Investigate installation failures rather than upgrading dependencies or regenerating contracts to make checks pass.
- Keep credentials outside Git. The machine's sudo password is not an application owner token or provider credential.
- Run one state-owning deployment. Native development, native production, and Compose must not share live state concurrently.
- Treat older phase-specific documentation as historical where newer adapter source and release evidence supersede it.

## Phase 0 — Record the starting point

```bash
cd /home/ryoko/Desktop/rdots/ryoko-dots
git status --short
git rev-parse HEAD
uname -m
cat /etc/os-release
command -v node npm python3 git
python3 --version
```

Observed during the initial review:

- Ubuntu 24.04.4 LTS; Python 3.12.3.
- Node was unavailable on the review shell's PATH; `node_modules` was absent.
- Python operations suite: 33 cases, 31 passed, one error, one skip.
- The failing test read an empty PID file at `tests/test_operations.py:190`.
- Historical release evidence records 767 JavaScript/TypeScript passes; these have not been reproduced on this host.
- Real browser, provider, computer, voice, Slack, recovery and deployment acceptance remain open.

Identify any existing Dots/Ryoko processes and state before creating a fresh installation. Record the intended owner, database location and ports. Do not adopt an existing profile implicitly.

**Exit:** baseline and intended fresh/existing state scope are recorded.

## Phase 1 — Install host and JavaScript dependencies

### Ubuntu prerequisites

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates xz-utils build-essential pkg-config python3 python3-venv python3-pip
```

Install **Node 24 with its bundled npm**. Use an existing trusted version manager if present; otherwise obtain an official Node 24 Linux archive matching `uname -m`, verify its published SHA-256 and release provenance, and extract it into an owner-controlled installation directory. Add its `bin` directory to PATH. Do not assume Ubuntu's default `nodejs` package meets the project's Node 24 requirement. Record the chosen exact patch version and installation path; the historical release used Node 24.19.0, which is evidence rather than an instruction to fetch an unverified version.

```bash
node --version
npm --version
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) process.exit(1)'
cd /home/ryoko/Desktop/rdots/ryoko-dots
npm ci
```

`npm ci` installs the complete locked application and development dependency set: React, Hono, Tiptap, TypeScript, Vite, Vitest, ESLint, Prettier, Playwright and the retained historical test dependencies. Do not install these individually or omit development packages before building/testing. Do not run npm with sudo.

Record installation failures verbatim with secrets removed. Resolve unavailable registry versions, network failures or native build prerequisites before proceeding; do not silently alter `package-lock.json`.

For browser QA, install the browser and its Linux dependencies after npm succeeds:

```bash
npx playwright install --with-deps chromium
```

This browser is for local UI verification; it does not qualify the separate agent-computer sandbox.

**Exit:** Node 24/npm work in the execution shell, locked dependencies install, and Chromium launches for local testing.

## Phase 2 — Repair the known test race and establish a local baseline

Update `test_killed_supervisor_leaves_direct_owner_gate_held` in `tests/test_operations.py` to wait with a bounded timeout for a complete, valid PID marker, rather than file existence alone. Prefer atomic marker publication or a readiness protocol. Preserve the assertion that killing the supervisor leaves the direct owner holding the gate. Ensure failure cleanup terminates the synthetic child even if PID parsing fails. Inspect adjacent marker-based tests for the same race and change only affected fixtures.

Run the focused case after the fix, including repeated runs sufficient to exercise startup timing:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_operations.py' -k killed_supervisor
```

Then run the repository checks locally:

```bash
npm run check-format
npm run lint
npm run typecheck
npm test
npm run build
npm run check:runtime-contract
npm run check:production-boundary
npm run test:operations
npm run test:production-boot
```

Investigate each failure before calling the phase complete. The no-argument runtime-contract check verifies stored fixture integrity; it does not verify a live producer. Conditional stdio skips remain pending until Phase 6. The production boot test uses isolated synthetic state and credentials; running it in this development checkout does not prove a production-only dependency installation.

Capture command, commit, runtime versions, exit status and skipped-test reasons in `BuildJournal.md`. Use targeted formatting for edited files; avoid repository-wide rewriting as an incidental setup step.

**Exit:** applicable local checks pass, with external-prerequisite skips individually documented.

## Phase 3 — Inspect the frontend

```bash
npm run build:frontend
npm run preview:frontend
```

Open `http://127.0.0.1:4173`. Verify asset loading, navigation, narrow-screen layout, keyboard focus, setup messages and console errors. API requests returning 503 are expected in this static preview. Persistence, login and chat cannot be accepted here.

Record screenshots and actual observations. Stop the preview when finished. Development-only UI iteration can use `npm run dev:frontend`; its API proxy expects the separately configured backend on port 4310.

**Exit:** the frontend renders and unavailable backend features are represented truthfully.

## Phase 4 — Start the authenticated local workspace

Create owner-private state/configuration locations for this new installation. If adopting existing state, substitute its reviewed paths and preserve its owner ID and gate.

```bash
install -d -m 700 /home/ryoko/.local/share/ryoko-dots
install -d -m 700 /home/ryoko/.local/share/ryoko-dots/gate
install -d -m 700 /home/ryoko/.config/ryoko-dots
```

Provision a dedicated application owner token through the operator's secret facility, 24–4096 characters, in `/home/ryoko/.config/ryoko-dots/owner-token`, owner-readable only. Never use the sudo password. The following configuration assumes that file already exists.

Create a private repo-root `.env` without overwriting an existing configuration. Use these initial settings:

```dotenv
HOST=127.0.0.1
PORT=4310
APP_ORIGIN=http://127.0.0.1:4310
OWNER_ID=opendots-owner
DATABASE_PATH=/home/ryoko/.local/share/ryoko-dots/dots.sqlite
DOTS_STATE_GATE_PATH=/home/ryoko/.local/share/ryoko-dots/gate/state.lock
DOTS_GATE_PYTHON=/usr/bin/python3
OWNER_TOKEN_FILE=/home/ryoko/.config/ryoko-dots/owner-token
```

Set `.env` permissions to 0600. Configure only one token source. Leave `RYOKO_CONFIG_PATH`, computers, voice and Slack unset initially. Keep the canonical gate path/inode stable; the supervisor creates/opens its lock within the private parent directory.

```bash
npm run build
npm start
```

Open `http://127.0.0.1:4310`, sign in, create a Space and page, edit it, reload, and verify persistence. Confirm anonymous `/api/ops/readiness` is denied and authenticated readiness reports storage independently from unconfigured conversation services. `/health/live` should respond successfully but is not integration readiness.

Stop gracefully and restart; verify the same data remains. Confirm a second startup using the same gate is refused. For Vite-backed development, stop this server, set `APP_ORIGIN=http://127.0.0.1:5173`, run `npm run dev`, and use that exact browser origin. Do not launch the compiled entrypoint directly to bypass the supervisor.

**Exit:** authenticated manual workspace use and restart persistence work locally.

## Phase 5 — Install the pinned Ryoko producer and its dependencies

The Python agent is a separate repository, not an npm dependency. Required producer commit:

```text
98b9eeb7d2afc02d0e0393fea285f010000a0378
```

Use a new checkout if no reviewed one exists:

```bash
git clone https://github.com/TianJieHeng/ryoko-agent.git /home/ryoko/Desktop/rdots/ryoko-agent
git -C /home/ryoko/Desktop/rdots/ryoko-agent checkout --detach 98b9eeb7d2afc02d0e0393fea285f010000a0378
git -C /home/ryoko/Desktop/rdots/ryoko-agent status --short
```

Before installation, read that checkout's `AGENTS.md`, setup documentation and dependency manifests/lockfiles. Use its documented installation and test runner. This review did not inspect that repository, so its exact package installation command must be resolved from the pinned source, not guessed as `pip install -r requirements.txt` or `pip install -e .`.

Install a supported isolated **Python 3.14** interpreter/environment to reproduce the documented producer qualification. Do not replace Ubuntu's system Python; Python 3.12 remains available for the Dots gate. If the producer documentation permits another version, explicitly record and qualify that deviation.

Dependency work to complete at the pin:

1. Identify the supported interpreter installer and package manager from producer instructions; install them if absent.
2. Create an isolated environment outside tracked source, such as `/home/ryoko/.local/share/ryoko-dots/producer-venv`.
3. Install the complete locked runtime dependencies and test dependencies using the producer's documented command.
4. Record interpreter/package-manager versions and the exact installation command in this plan or the journal.
5. Verify imports, then run the relevant producer regressions through its documented `scripts/run_tests.sh` runner, not bare pytest.
6. Keep the producer's tracked tree clean. Do not put a credential `.env` in its checkout.

**Exit:** the exact pinned producer and a reproducible isolated Python environment are available. A missing producer install recipe remains an explicit blocker, not a completed dependency step.

## Phase 6 — Verify real local stdio integration

From the Dots repository, substitute the actual installed interpreter path:

```bash
RYOKO_TEST_PYTHON=/home/ryoko/.local/share/ryoko-dots/producer-venv/bin/python \
RYOKO_TEST_CHECKOUT=/home/ryoko/Desktop/rdots/ryoko-agent \
npm run test:runtime-stdio
```

These tests use the actual pinned Python process with isolated fixtures and synthetic external services. Verify conversations, commands, recovery, controls, page effects, identity, schedules and optional-adapter protocol cases. Record failures and resolve them without weakening source checks.

Compare the selected producer to `src/shared/runtime/producer/provenance.json` and `src/shared/runtime/be06-producer/provenance.json`. Do not repin to a different agent revision merely to bypass incompatibility. The older baseline fixture checked by `check:runtime-contract` has its own historical provenance; do not assume its optional source-root mode targets the current producer pin.

**Exit:** the explicit stdio suite passes; synthetic results remain distinguished from live-provider results.

## Phase 7 — Configure identity and enable live chat

Follow `docs/runtime/self-hosted-conversations.md` and `docs/runtime/self-hosted-commands.md`, together with the pinned producer's profile instructions.

1. Create an isolated owner-private Ryoko profile and runtime directory. Select the actual model/provider and provision its credentials through the intended secret facility.
2. Configure the primary identity and the supported profile fields. Command profiles need `onboarding.seen.profile_build_offered: true` to prevent interactive first-run profile writes.
3. Obtain the existing Dot ID from an authenticated workspace read. Resolve the actual principal/profile/agent IDs and policy/config digests through the producer's supported identity resolver. Never invent digest strings or reuse fixture identities.
4. Create a private launcher JSON using the documented shape: absolute `checkout`, `python`, `home`, `runtimeDirectory`, stable `ownerId`, existing `dotId`, `gatewayId`, and the verified `identity` object.
5. Where required, configure only the documented `providerEnvironment` fields. Follow the exact profile `.env` matching rules in the command guide. Setting legacy `OPENAI_*` entries in the Dots `.env` alone does not configure this isolated producer.
6. Add `RYOKO_CONFIG_PATH=/home/ryoko/.config/ryoko-dots/ryoko-dots.json` to the Dots `.env`, then restart via `npm start`.
7. Create/select a conversation and explicitly connect it. Send one small prompt, confirm the real provider response is committed to history, reload, and verify recovery without duplicate submission.
8. Exercise explicit cancel/steer where supported, provider failure reporting, and reconnect after a controlled restart. Preserve unresolved operation IDs; a timeout is not permission to replay accepted work.

Record the actual provider/model, scoped capability results and credential-free evidence. If the primary personal-memory harness is required, configure and verify that external dependency separately; unsupported mutation/export/delete operations stay unavailable.

**Exit:** a real authenticated conversation survives reload/restart and produces a verified provider response. This is the core local “up and running” milestone.

## Phase 8 — Verify integrated workspace behavior

Use an authenticated real browser against the assembled app:

- Space/page creation, visual and Markdown editing, autosave failure recovery, revision conflicts and persistence.
- Conversation creation, history/search/archive, explicit connect, activity and command recovery.
- Page-context chat and research-to-page flow, including exact review, authorized project mappings and saved artifact links.
- Named specialists, separate permitted Space access and isolated memory; reviewed workflow/skill delivery only where configured.
- Keyboard use, responsive layouts, clear unavailable states and console/network failures.

Creating a local Space does not grant a producer project. Configure real page/project authority before accepting agent-written page effects. Keep schedules paused until current scheduler ownership and bounded authority are observed. Test a limited schedule only after those conditions hold; existing legacy jobs also require retirement evidence.

**Exit:** record passed/failed browser journeys and screenshots. Earlier zero-assertion browser receipts are superseded only by actual new evidence.

## Phase 9 — Install and qualify optional services individually

These are separate feature milestones. They are not prerequisites for manual pages or basic chat, but leaving them disabled does not establish full-parity production acceptance.

| Feature | Dependencies and implementation work | Acceptance |
| --- | --- | --- |
| Agent computers | Install a supported Docker Engine/Compose environment if using the supplied services; build the pinned supervisor/target images using `deployment/computers/README.md`, `docs/COMPUTERS.md` and current `docs/runtime/computer-target-edge.md` / `computer-effect-adapter.md`. Provision distinct service secrets and persistent volumes. | Verify actual image/host identity, browser/files/shell containment, egress, takeover, restart persistence and the real qualification receipt. |
| Voice | Configure the qualified realtime media service/provider per `docs/runtime/voice-lifecycle.md`; install only its documented prerequisites and supply `RYOKO_VOICE_CONFIG_PATH`. | Test real microphone/playback, permissions, captions, mute/hangup, durable receipts and cost/quota limits. Finite local STT/TTS is not realtime support. |
| Slack | Configure the self-hosted signed-events adapter per `docs/runtime/self-hosted-slack.md`, including the real app installation, token/signing secret, workspace/user/channel authority and ingress. | Verify signatures, replay rejection, permitted original-thread replies, recovery and actual delivery. Keep legacy managed Channels disabled. |
| History | Obtain an authorized normalized source export and use `docs/history-export-contract.md` plus the offline import procedure. | Reconcile source counts, omissions, conflicts and original links; imported content remains inert. |

Record exact additional installation commands and versions from each selected service's pinned instructions before marking its dependency work complete. Never fabricate qualification receipts or activate a service merely because its URL/token exists.

**Exit:** each chosen integration has its own real-service receipt; all others are explicitly disabled/pending.

## Phase 10 — Persistent deployment and recovery

Choose one deployment mode after local acceptance:

- **Native service:** adapt `deployment/dots-native.service.example` to the actual installation paths, owner, Node binary, environment and shared gate. Verify process-tree shutdown and `KillMode=control-group` behavior.
- **Compose:** install the supported Docker Engine and Compose plugin if not already present. Use root `compose.yml` or the separate deployment example, never both. Review the actual mounts, UID 1000 ownership, resource limits, state/gate directories, owner-secret file and TLS certificate paths before `docker compose config`, build and startup. The default root Compose configuration does not automatically mount a Ryoko checkout/interpreter/profile or set `RYOKO_CONFIG_PATH`; implement and validate those dependencies in the image/mount configuration before claiming containerized chat support.

For native non-loopback access, configure native TLS or the explicitly supported loopback TLS proxy and exact HTTPS `APP_ORIGIN`. The root Compose app listens on `0.0.0.0` inside the container and requires its native TLS configuration even though the published host port is private.

Validate production-only packaging in a separate disposable directory/image: build with development dependencies, install the lockfile with `npm ci --omit=dev`, include compiled `dist` and required startup/operations scripts, and run the isolated production boot probe. Do not prune the working development installation to perform this check.

Install `age` if encrypted backup is selected:

```bash
sudo apt-get install -y age
```

Follow `docs/BE11-operations.md`: inventory all writers and Dots/Ryoko/artifact state, stop the entire state-owning process tree, use the same gate for offline paired snapshots, and restore to a new isolated generation. Qualify actual encryption/key recovery and restored authentication. Include separately owned computer volumes if enabled. Record measured recovery time and data-loss expectations on representative data.

Test service restart/reboot, authenticated readiness, graceful stop, second-writer rejection, secret rotation, storage pressure and recovery. Keep production routing/cutover pending until the intended owner/session cohort and rollback procedure are established. Retain accepted/unknown command ownership through rollback; do not replay through the legacy executor.

**Exit:** the selected deployment boots persistently, real recovery is demonstrated, and its explicitly selected scope is accepted. Full parity still requires all mandatory release gates or separately agreed scope exclusions.

## Phase 11 — Final evidence and documentation cleanup

Re-run relevant local checks after implementation changes. Update `BuildJournal.md` with exact commits, versions, commands, results, skips and browser/live-service evidence. Resolve stale CI requirements in current-facing documents while preserving historical receipts as historical. Clarify the README's current setup path so legacy credentials/startup are not mistaken for the active runtime configuration.

Completion checklist:

- [x] Host tools, Node/npm and locked JavaScript dependencies installed.
- [x] Browser QA dependencies installed and launch verified.
- [ ] PID-marker race fixed; applicable local checks pass.
- [ ] Frontend preview verified.
- [ ] Authenticated workspace and persistent manual pages verified.
- [ ] Pinned producer and its complete isolated runtime/test dependencies installed.
- [ ] Actual stdio integration tests pass.
- [ ] Real provider-backed chat and restart recovery verified.
- [ ] Integrated browser/page/review flows verified.
- [ ] Optional feature status recorded separately.
- [ ] Selected persistent deployment and real backup/restore accepted.
- [ ] Current documentation reconciled; no CI used and no secrets committed.

## Source references

- `AGENTS.md`, `package.json`, `.env.example`
- `docs/runtime/frontend-setup.md`
- `docs/runtime/backend-release.md`, `docs/runtime/backend-acceptance.md`
- `docs/runtime/self-hosted-conversations.md`, `docs/runtime/self-hosted-commands.md`
- `docs/runtime/self-hosted-controls.md`, `docs/runtime/page-effect-adapter.md`
- `docs/runtime/identity-skill-adapter.md`, `docs/runtime/schedule-adapter.md`
- `docs/BE11-operations.md`, `SECURITY.md`
