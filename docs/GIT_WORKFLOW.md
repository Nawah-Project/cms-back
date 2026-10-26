# Git baseline and branch workflow

The only maintained branches are `main` (production) and `dev` (development).
Both start from the analytics redesign release deployed on 2026-10-26.
The baseline commit changes repository hygiene and CI isolation only.

- Work in `/data/cms/cms-back` and `/data/cms/cms-front` on `dev`.
- Production source checkouts `/data/cms-back` and `/data/cms-front` track `main`.
- `/data/cms/production-release` contains detached release worktrees. Do not develop there.
- `/data/cms-development/backend` and `/data/cms-development/frontend` are CI deployment copies, not Git repositories. Their running code changes only when deployed.
- Push `dev` to run checks and deploy development. Promote reviewed changes to `main` for production.
- Keep the two branches; use commits and pull requests between them.
- Never commit local environment files, database backups, uploads, or build outputs.

## Baseline recovery

Before branch cleanup, every local branch and commit was preserved in verified
Git bundles under `/data/cms/git-cleanup-backup-20261026/`.
`before.json` records the original branch tips, worktrees and running containers.
Inspect with `git bundle list-heads <bundle>`; recover into a separate directory
with `git clone <bundle> <recovery-directory>`.

The baseline commit uses `[skip ci]` so aligning branch references does not
redeploy either live environment. Future ordinary commits run the existing CI
and deployment workflows. Synchronizing the branches does not imply that the
already-running development containers have been upgraded.
