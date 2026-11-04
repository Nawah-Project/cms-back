# Delivery policy

- Keep the existing manual production approval, migration/backup/rollback gates,
  standard GitHub runners and download limits. Never build production images on
  the server or enable paid usage as a fallback.
- Use the change-aware `ci_cd.yaml` workflow as the default verification receipt.
  PRs compile and test source; changed applications are packaged once on main.
  Documentation and operator-only work do not require application images. Unknown
  paths conservatively select a full application build. `full_build` is an explicit
  manual escape hatch for packaging verification, not the default for each edit.
- Run a relevant test once for a given code revision. Repeat it after new edits,
  a failure, or a specific unresolved concern. Do not repeat full restores, broad
  browser tours or database fingerprints for routine UI/wording/operator changes.
  Schema/data migrations, identity/security boundaries and storage changes still
  require their appropriate integration/recovery tests.
- Observe a CI run with `python3 scripts/ci/delivery.py wait --repo OWNER/REPO
  --run RUN_ID`. It polls without model reasoning. Do not repeatedly inspect every
  job, rebuild, restage or rerun successful suites while waiting. Use the one CI
  result and its failure diagnostics before deciding on further checks.
- After an authorized approval, let the installed deployment agent download,
  verify, back up, deploy, check health and roll back. Observe its state with the
  same helper's `--deployment-dir`, `--component` and `--tag` arguments. Do not
  recreate that process as task-specific shell scripts.
- Applying an already-current healthy tag must be a no-op. A previously loaded
  image can be reused only after digest and revision verification. Never weaken
  identity or storage checks to speed deployment.
- Finish with the actual result and material limitations once the selected gates
  pass. Put unrelated improvements in follow-up notes rather than extending a
  completed feature into another release cycle.
