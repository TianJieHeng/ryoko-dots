# Local DeepSeek Superagent installation

Installed 2026-11-07 from deepseek-ai/dsh-superagent-prototype commit
8c32a9dc5d72c033816c6a8110b37f40cf94fba4 in
`/home/ryoko/Desktop/dsh-superagent-prototype`.

- DeepSeek Harness: 0.2.1-rc.3 (upstream deployment pin).
- pnpm: 11.7.0 (upstream packageManager pin); Node: 24.22.0.
- tmux: 3.4; GitHub CLI: 2.103.3, official release checksum verified.
- Dedicated profile: `~/.dsh/profiles/superagent`.
- State: `~/.dsh/state/superagent`; local panel: `127.0.0.1:3082`.
- Desktop launcher: `~/Desktop/Superagent.desktop`; command: `superagent-panel`.
  It reads the local login link without embedding its token in the launcher.
- Control commands: `superagent start`, `superagent status`, `superagent stop`.
  Runs in tmux; no boot service or hourly agent job has been enabled.

The profile is installed and its authenticated panel responds with HTTP 200.
Setup is pending: select a target GitHub repository, authenticate a dedicated
agent GitHub account, set the allowed requester list, and configure a model
provider through DeepSeek Harness. No GitHub automation has been activated.
Do not reuse Hermes ChatGPT credentials implicitly. No secrets belong here.

The upstream control script checks process names `node` and `dsh`; Node on this
machine reports `MainThread`. The accompanying patch additionally accepts that
name only when the command executable is node, retaining the profile filter.
Applied locally; re-evaluate on upstream upgrades. Start/status now identify the
existing process and return exit 3 for pending setup rather than a false timeout.

Validation: typecheck and standalone build passed; 1,196 of 1,197 upstream tests
passed. The optional Feishu malformed-event health test in sources.spec.ts fails
reproducibly (expects error, receives ready); focused rerun: 70/71 passed. Feishu
is not enabled. Logs are in the checkout's ignored `.artifacts/` directory.

Claude Code 2.1.319 is installed at `~/.local/bin/claude`, but `claude auth status`
reports not logged in. Run `claude auth login` to authenticate it.
Neither Claude nor Superagent has a Dots runtime adapter yet; installation alone
does not register them as chat Dots. Existing Ryoko and API tunnel were unchanged.

Upstream installation guide:
https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md
