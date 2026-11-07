# Ryoko delegates to the Codex Dot

Installed helper: `~/.local/bin/dots-codex` runs `scripts/dots-codex.py`.
Installed Hermes skill: `~/.hermes/profiles/ryoko/skills/dots-codex/SKILL.md`.
The skill instructs Ryoko to submit, monitor and return the actual Codex result.
This uses the existing local Dots API and Codex adapter, not a second Codex runtime.

Private state (not in Git):

- `~/.config/ryoko-dots/codex-delegation-key`: 0600, Codex-only read/write API key.
- `codex-delegation-client.json`: credential ID for revocation in Dots & API.
- `codex-delegations.sqlite`: durable task IDs, exact inputs, conversation IDs.

The key expires after 365 days and cannot administer credentials or access Ryoko.
It has access to the Codex Dot, including its conversations, not a per-task sandbox.
The helper talks only to loopback port 4310 and refuses HTTP redirects. It neither
reads ChatGPT tokens nor sends secrets to model prompts. Existing Codex sandbox and
owner approval controls apply. Skill text and helper contain no credentials.

Each task uses a caller-persisted UUID, a deterministic conversation-create UUID,
and that task UUID as its Dots run ID. Intent is committed before network writes.
Repeated submit calls after an attempted send only inspect; they never repeat the
send. A crash before the send may therefore require manual inspection/recovery,
which is preferable to silently creating duplicate work. Do not replace unknown
jobs with new IDs. See the skill for commands and wait/approval behavior.

Tasks show up under Codex as `Ryoko → Codex: <title>` and in **Recent work across
Dots**. Ryoko reads results by polling; this does not inject a callback into an
already-finished Hermes turn or create a native Hermes child-run relationship.
The helper retains IDs across restarts so another turn can recover with `list`.
It does not change the memory harness or broaden the Ryoko mobile API key.

Installation on another workstation requires provisioning a Codex-only API key
through the local owner API, saving it at the private path above with mode 0600,
copying SKILL.md into the correct Hermes profile, and creating the helper launcher
with that workstation's repository path. No credentials are included here.

## Terminal inside the Dots computer

Ryoko uses the existing native computer `exec` action: observe a snapshot,
propose the exact command, then read its confirmed result. This terminal runs
inside the computer's isolated `/workspace`; commands require the existing
owner approval. It is not unrestricted access to the host filesystem or network.
API-originated Hermes commands now register identity and native computer tools
before submission, matching the normal conversation connection path.

The workspace contains `dots-codex`, copied from `scripts/dots-codex-client.py`.
It talks through the private `.dots-codex.sock` Unix socket to
`scripts/dots-codex-bridge.py`, managed by the supplied user systemd service.
Only submit/status/wait/cancel/list are accepted. The host bridge holds the
Codex-only credential; neither the isolated terminal nor the model receives it.
The computer sandbox and Hermes profile permissions remain unchanged.

For installation, copy the client into the configured computer workspace as
`dots-codex` with mode 0755, adjust the service's repository/workspace paths,
install it under `~/.config/systemd/user/`, run `systemctl --user daemon-reload`,
and enable/start `ryoko-dots-codex-bridge.service`. The socket is mode 0600.
Submitting and waiting can share one approved command. Subsequent status commands
also follow normal computer approval. Codex's own requested approvals appear in
its conversation. Ryoko must inspect actual completion before claiming success.
