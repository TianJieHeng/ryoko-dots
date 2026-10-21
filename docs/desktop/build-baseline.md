# Desktop and multi-runtime baseline

Implementation begins from the installed 2026-10-21 Ryoko environment. Existing uncommitted installation and chat fixes are captured in the phase-0 local commit. Runtime producer remains pinned to a4dc372345eb4a4780f2e4301b2a474c73bc00b0.

Production entry: src/server/index.ts → createSelfHostedApp; browser: src/client/main.tsx. Persistent state: configured DATABASE_PATH, the enrolled Hermes profile state, and computer supervisor state. Authentication and launch secrets are outside version control. Do not restore old application binaries against newer schemas without restoring the corresponding state snapshot.

New registry/API tables are additive. Existing Ryoko tables, IDs, grants, and conversation budgets remain authoritative. Additional runtime workspaces use separate databases and profile directories. Desktop packaging never includes private state or credentials.

The owner's build instruction defers all testing until the final phase. Baseline, migration restoration, desktop compatibility, and regression checks are pending until then; source inspection is not validation. No CI is permitted. Git checkpoints are local; no push is authorized or needed.
