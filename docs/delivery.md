# Changed-path delivery

| Change | Verification | Production image |
|---|---|---|
| Documentation only | Plan and completion gate | None |
| Operator/deployer/release helpers | Targeted operator tests | None |
| Tests only | Source checks and compilation | None |
| Application source/dependencies/schema | Source tests, candidate image, runtime smoke | Changed application(s), on main |
| Owned Nawah admin pages only | Common frontend checks once | Admin only |
| Shared/unknown frontend files | Common checks once | Member and admin |

The planner considers deleted/renamed files and falls back to all components if
it cannot establish a diff. PRs compile/test without exporting unused image
archives. A manual full build remains available. Production approval promotes the
already-tested main candidate; it never rebuilds it. Required checks are not
replaced by a changed-path guess: unit/integration suites still run when their
application changes, and every production candidate must pass runtime checks.

Docker caches include intermediate build stages. Docs, workflow/operator code and
review harnesses are excluded from application build contexts so those edits do
not invalidate application layers. The hosted runner remains ubuntu-24.04.

Use one observer process, rather than agent polling and repeated verification:

```sh
python3 scripts/ci/delivery.py wait --repo OWNER/REPO --run RUN_ID
python3 scripts/ci/delivery.py status --deployment-dir /operator/deployment --component api --tag EXACT_TAG
python3 scripts/ci/delivery.py wait --deployment-dir /operator/deployment --component api --tag EXACT_TAG
```

The observer is read-only, prints progress only when it changes, exits on failure
or timeout, and never restarts work. Existing approval and automatic rollout remain
separate. Timeouts, staging failures and budget exhaustion are reported as such.
Do not rerun a successful image build to approve or deploy it.

Changes to safety/schema/storage still require the corresponding focused tests.
An ordinary UI edit does not repeat the one-time application extraction, database
migration, all-table comparison or full disaster-recovery rehearsal.
