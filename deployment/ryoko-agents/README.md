# Claude and Kimi in Dots

The runtime manifest accepts `claude` and `kimi` entries with `id`, `name`,
absolute `executable`, and absolute `cwd`. Claude additionally supports `model`.
Their executables use the current OS user's existing login, stored outside Dots.
No login tokens are copied into the runtime manifest, prompts, or repository.

Claude uses the official Agent SDK with the installed Claude Code executable.
Kimi uses its ACP stdio server. Native provider session IDs are persisted for
follow-up messages. Dots keeps durable submitted inputs, messages and completion
receipts. Repeated operation IDs inspect existing work; changed input is rejected.
Interrupted executions become unknown on restart and are not automatically
replayed. A stopped/failed provider cannot silently become a successful run.

Tool permission requests appear in the selected agent's conversation. Only the
owner can answer them through the API. Delegation keys cannot approve tools or
administer credentials. No bypass-permissions flags are used. The providers run
as the local user in their configured working directories; a working directory
is not an OS sandbox. Their native tools and permission policies still apply.

The shared delegation bridge accepts only three fixed agent names. Each has its
own private key and job database (`AGENT-delegation-key` and
`AGENT-delegations.sqlite` under `~/.config/ryoko-dots`). Each key grants read/write
only to its respective Dot. The existing Codex command remains compatible.
Copy `scripts/dots-codex-client.py` into the computer workspace as executable
`dots-agent`, install this directory's skill in the Ryoko profile, and use the
bridge service described in `../ryoko-codex/README.md`.

The API is the existing `/api/v1` API: select `claude` or `kimi` in
`POST /dots/:id/conversations`, then submit messages to that conversation and
inspect runs/messages/approvals. Existing mobile keys keep their original scope.
No provider threads are imported into or represented as Hermes memory-harness
conversations. Provider-internal subagents are not exposed as Hermes child runs.

Protocol references:

- https://code.claude.com/docs/en/agent-sdk/typescript
- https://moonshotai.github.io/kimi-code/
- https://github.com/agentclientprotocol/typescript-sdk
