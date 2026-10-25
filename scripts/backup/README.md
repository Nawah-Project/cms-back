# PostgreSQL + CV backup and isolated recovery

This tooling fits the current single-host Docker Compose deployment. It uses Python 3.11+ stdlib, Docker/Compose, and the locally available PostgreSQL image. It installs no packages, pulls no images, stops no running service, changes no production configuration, and never runs Prisma/application startup during recovery.

Run it on the Docker host: backup directory bind mounts must refer to the same filesystem seen by the selected Docker daemon. A remote Docker client with unrelated local paths is not supported automatically.

`backup.py` has three operations: `backup`, `verify`, and `restore`. All failures return exit code **1** (argument errors **2**); success returns **0**. A backup/verify success means archive and reference checks passed. A successful **isolated restore drill** is required to demonstrate recoverability.

## Consistency point: approved write downtime

PostgreSQL logical snapshots alone do not snapshot the CV filesystem. Do **not** copy an actively written CV directory and call it a consistent backup.

1. Arrange an approved maintenance window and maintenance messaging. Prevent new application requests, deployments, external SQL writers/imports, and workers from writing.
2. An authorized operator separately stops **all API writers**, including replicas. This also stops the in-process no-response processor and CV orphan timer. This tool never stops or restarts services for you.
3. Run the backup with `--confirm-quiesced` only after all other writers are stopped. The tool independently checks that all existing Compose API containers are stopped, both before and after capture. Container configuration is retained so it can discover the CV mount. A removed API container is insufficient; the container must still exist.
4. The tool captures a custom-format `pg_dump`, all CV files including referenced historical versions, table counts, current/history file references, representative user relationship counts, and per-file SHA-256 checksums. It rechecks database inventory and CV references before marking the set complete.
5. An authorized operator may resume normal operation after a successful backup, or after reviewing a failure. There is no automatic service restart.

The stopped-writer requirement is the consistency mechanism. Rechecking counts cannot detect every possible external SQL/content change. If independent writers cannot be quiesced, **do not acknowledge the flag**: schedule downtime or design a separately approved snapshot/locking procedure. No such live-writer guarantee is claimed by this tool.

## Back up

Set these variables to the actual deployment configuration; do not copy credentials into commands or filenames:

```bash
NAWAH_SOURCE_COMPOSE=/absolute/path/to/compose.yml
NAWAH_SOURCE_PROJECT=actual-compose-project
NAWAH_SOURCE_ENV=/absolute/path/to/existing-compose.env
NAWAH_BACKUP_ROOT=/absolute/private/off-application-volume/backups

install -d -m 700 "$NAWAH_BACKUP_ROOT"
python3 scripts/backup/backup.py backup \
  --compose-file "$NAWAH_SOURCE_COMPOSE" \
  --project "$NAWAH_SOURCE_PROJECT" \
  --env-file "$NAWAH_SOURCE_ENV" \
  --output-dir "$NAWAH_BACKUP_ROOT" \
  --confirm-quiesced
```

`--env-file` is optional when Compose can resolve its configuration normally. Use explicit `--project` every time, especially where development and production coexist. `--pg-service` and `--api-service` default to `postgres` and `api`; override them if service names differ. Container IDs and storage mount paths are discovered from this configured project, never from hardcoded production names. PostgreSQL must configure `POSTGRES_USER`, `POSTGRES_DB`, and `PGDATA`; it uses the container's configured local connection/password environment without putting passwords into arguments or logs. The application database is expected in PostgreSQL's `public` schema, matching the current Prisma deployment.

The output root must be `0700`. Each run creates a unique set containing:

```text
nawah-<UTC timestamp>-<random suffix>/
  database.dump
  cv-files.tar
  manifest.json
  COMPLETE
```

Files are `0600`, directories `0700`, created with umask `077`. The manifest excludes credentials but includes source identities, storage paths, counts, storage keys, sizes and hashes. `database.dump` **contains sensitive application data**, including existing authentication/email metadata; protect the entire set, not just environment files. Do not commit it to Git.

Unsuccessful runs remain as `.incomplete-*` without a final completion marker. They must not be used for recovery. The tool never removes existing backups or overwrites a previous completed set. It also refuses unsupported nonpersistent mounts or symlink/special-file CV archives rather than guessing how to copy them.

## Verify and move off-host

```bash
NAWAH_BACKUP_SET=/absolute/path/to/one/completed/backup
python3 scripts/backup/backup.py verify "$NAWAH_BACKUP_SET"
```

Verification checks the dump/tar SHA-256, a readable custom dump TOC using `pg_restore --list`, every archived CV hash, and that each DB-referenced current/history CV exists with the recorded size. The same PostgreSQL image must be available locally; use `--helper-image` for a compatible locally available image when verifying on another host. A TOC/checksum check is **not** a substitute for executing a restore.

Transfer the **complete directory** to approved off-host storage over SSH, for example:

```bash
# Configure this yourself: SSH destination without a password/token in the URL.
NAWAH_OFFHOST_DEST=backup-user@backup-host:/private/nawah-backups/
rsync -a -- "$NAWAH_BACKUP_SET" "$NAWAH_OFFHOST_DEST"
```

Verify again at the destination and protect its directory/file permissions. Use encrypted storage or an established backup encryption process, restricted SSH access, and a copy outside the application host. Checksums detect corruption; they do not authenticate an attacker-modified manifest. Restore only trusted backup sets.

Suggested pilot retention policy: **7 daily + 4 weekly sets**, adjusted to actual data volume and recovery objectives. Keep at least one independently verified off-host copy before expiring an older set. No automatic pruning is included; deletion/retention changes require a separately reviewed operator process. Measure dump size and CV-history growth before adopting this estimate.

## Isolated recovery target

Recovery requires a **new, empty database and CV mount**, a Compose project beginning `nawah-recovery-`, `io.nawah.recovery=true` labels, internal-only Docker networks, no published ports, and stopped API containers. The tool rejects the source project/cluster/container and overlapping source storage. It never runs `--clean`, `DROP`, `TRUNCATE`, migrations, or application startup during restore.

The example `recovery.compose.yml` intentionally uses a sleeping storage carrier named `api`, not a Nest image. Creating it must not start the real application or migration entrypoint. It has no external network and uses new project-scoped volumes. PostgreSQL 17 is the existing deployment version; choose the same compatible major image. If moving to a later PostgreSQL major, separately validate that upgrade and adapt PGDATA/mount layout; that is not part of this procedure.

Prepare a **new recovery-only** env file with mode `0600`, outside Git:

```dotenv
RECOVERY_POSTGRES_IMAGE=postgres:17-alpine
RECOVERY_POSTGRES_USER=recovery_operator
RECOVERY_POSTGRES_PASSWORD=<new-recovery-only-random-password>
RECOVERY_POSTGRES_DB=nawah_recovered
```

Then:

```bash
NAWAH_RECOVERY_PROJECT=nawah-recovery-drill-unique-id
NAWAH_RECOVERY_COMPOSE="$PWD/scripts/backup/recovery.compose.yml"
NAWAH_RECOVERY_ENV=/absolute/private/path/to/recovery.env

# Does not select or start source services. Use a new project name every drill.
docker compose -f "$NAWAH_RECOVERY_COMPOSE" -p "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" up -d --pull never postgres

docker compose -f "$NAWAH_RECOVERY_COMPOSE" -p "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" create --pull never api

# Wait until the new PostgreSQL is ready; do not restore while it is initializing.
docker compose -f "$NAWAH_RECOVERY_COMPOSE" -p "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" exec -T postgres sh -ceu \
  'pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"'

python3 scripts/backup/backup.py restore "$NAWAH_BACKUP_SET" \
  --compose-file "$NAWAH_RECOVERY_COMPOSE" \
  --project "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" \
  --confirm-isolated-recovery
```

The restore uses `pg_restore --single-transaction --exit-on-error --no-owner --no-acl`; the target role owns restored objects. It preserves CV archive numeric ownership/modes. Check that those UIDs/GIDs match the application image before any later deployment; do not recursively change source ownership. Successful restore compares **all public-table row counts, representative user relationships, current/history references, and every CV filename/size/hash**, and leaves API stopped.

If any restore/verification step fails, the target remains **unapproved**; do not start it or rerun over its partly populated storage. Inspect only the disposable recovery target, create a fresh target, and retry after resolving the cause. There is no cross-filesystem transaction between PostgreSQL and CV extraction, so failure after DB commit can leave an incomplete recovery target. The source environment is never written by `restore`.

Actual failover to production is a separate, approved deployment procedure: validate application version/schema, authentication/SMTP/network settings, restore drill output and ownership first. Avoid running the real application on recovered records just to inspect a backup: existing startup/background logic may change data or send messages.

## Safe scheduling

An operator can schedule the backup command in an existing scheduler/cron, using absolute paths and private logs, **only inside a separately approved quiesced-writer window**. Example crontab entry (paths/project/env are placeholders to replace):

```cron
0 3 * * 0 /usr/bin/python3 /absolute/cms-back/scripts/backup/backup.py backup --compose-file /absolute/compose.yml --project actual-project --env-file /absolute/private/compose.env --output-dir /absolute/private/backups --confirm-quiesced >> /absolute/private/backup.log 2>&1
```

The flag records the operator's consistency declaration; it does not authorize the tool to stop services. If API writers are still running, the scheduled command must fail and alert the operator. Configure the scheduler to alert on exit 1/2 and on a stale last-success timestamp; an exit code swallowed by cron is not backup monitoring. This is not a zero-downtime scheduled backup solution. Arrange and test the maintenance/resumption process before enabling the schedule; no cron or production service was changed by this implementation.

## Regression commands

```bash
python3 scripts/backup/test_backup.py
```

This integration test creates uniquely named Compose projects, internal networks, temporary named volumes and synthetic records/files. It exercises backup verification, corrupt dumps, missing reference metadata, unsafe archive members, running-writer refusal, source-target refusal, nonempty CV/DB target refusal and a full roundtrip, including original-source invariance. It removes **only resources created by that test invocation**, even on failure. It uses the existing `postgres:17-alpine` image and refuses to pull a dependency.

Journey integration tests are separate: see `test/jest-phase1.json`. They require a freshly migrated disposable `cms_test` with no existing users/journey nodes, and refuse to reuse a populated test DB.

## Historical repairs are separate maintenance

Removing startup cleanup prevents future loss; it cannot reconstruct deleted records or restore overwritten administrator configuration. Do not infer corruption from ordinary Arabic/English words, do not renumber CV versions by `count(history)`, and do not automatically reset existing nodes to seed defaults. Recovery from an older backup or any historical repair needs explicit record-level evidence, a verified backup, an isolated rehearsal, and separate operator approval. No historical repair is run by these scripts.
