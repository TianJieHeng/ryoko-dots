# CI disabled

The owner requires **NEVER USE CI** as of 2026-10-04. Workflow files in this directory preserve their original bytes but are outside GitHub Actions' active workflow directory.

Use local checks documented by the repository. Do not dispatch or rerun historical CI jobs.

## Archived workflows

- `ci.yml.disabled` was `.github/workflows/ci.yml` (original blob `16da2af61f86a3c9d4b87578d7d6ef80093a5e31`).

## Reversibility

Only if the owner explicitly changes the no-CI policy, move an archived file back to its original `.github/workflows/` path and remove its `.disabled` suffix. Update `AGENTS.md` to reflect that newly authorized policy change. No restoration is currently authorized.

This source change deactivates these workflows on `main` and branches inheriting it. It does not change repository Actions settings or erase workflow files from older branches/tags, and does not cancel existing runs. Historical logs and artifacts are retained.
