# Hosted builds and manually approved production releases

Production is not built by a GitHub self-hosted runner. Both repositories use standard GitHub-hosted Ubuntu 24.04 / Node 24. Pull requests and pushes to `dev` verify only. Successful `main` builds produce an immutable, unapproved prerelease containing the **tested image**, `release.json`, and SHA-256 checksums. No production credentials, database dumps, or CVs enter CI or the release.

## Approve an already built candidate

1. Open the successful **Hosted CI and release candidate** run. Copy its `build-<commit>-<run>-<attempt>` tag from the job summary or Releases.
2. Open Actions → **Approve production** → Run workflow, on `main`, and paste that exact tag.
3. For a backend release with changed migration metadata, confirm that its migrations are backward compatible with the previous API. The first API approval also requires this acknowledgment.

Approval verifies the successful original `main` push run, writes a matching `approval.json`, and promotes the existing release. It never rebuilds. The server sees the approved release at its next five-minute check.

## Server setup

Run `python3 scripts/deployment/install.py` once from a trusted checkout. It captures the running Compose file chain and current images, compares the effective environment against live containers without logging values, and writes private state under `/data/cms/deployment`. It does **not** restart anything. The initial configuration is `enabled: false`.

Install the supplied service/timer as systemd user units, run `systemctl --user daemon-reload`, and ensure lingering is enabled for the service user. The timer may be enabled before activation: disabled config makes it log that it is waiting, without polling or deploying.

Before first activation:

```sh
python3 /data/cms/deployment/agent.py check
python3 /data/cms/deployment/agent.py stage --component frontend --tag BUILD_TAG
python3 /data/cms/deployment/agent.py stage --component api --tag BUILD_TAG
```

Staging downloads and verifies the archive and Docker image identity, without starting the candidate against production. Confirm the first image's configuration and smoke result from CI. Only then set `enabled` to `true` in `config.json` and approve the chosen release. There is no implicit first production approval.

The server uses outbound HTTPS only. Downloads are serialized globally, capped at **1 MiB/s**, resumed after interruptions and verified before `docker load`. Metadata checks stay below unauthenticated GitHub's 60 requests/hour when there is no new release. Each repository is checked every five minutes. Release downloads are complete compressed images of the changed component, not registry layer deltas; only actual compressed archive sizes should be used for bandwidth estimates.

## Deployment and rollback

`agent.py poll` applies only a non-prerelease with matching approval. `check` only inspects metadata; `stage` can inspect unapproved candidates. All replacement commands use `--no-build --pull never --no-deps`, and the existing environment, networks, ports and volumes remain in the captured Compose chain. Only the target service is replaced. Frontend deployments verify the API and database container IDs remain unchanged. API CV mount identity is verified too.

Before any API replacement the agent checks the database migration history against the image manifest, requires explicit compatibility approval for pending migrations, and creates and verifies a private PostgreSQL custom-format backup. Deployment rollback changes the image only; **it does not undo schema migrations**. Destructive/non-compatible migrations need a separate maintenance procedure and must not be acknowledged as compatible.

The rollout discovered one historical checksum mismatch already present between the production database and its currently running image. Installation captures that **exact database/image checksum pair**, without modifying the database or rewriting migration history. The exception permits only the unchanged installed baseline; either checksum changing, an absent migration, or a different proposed file remains blocked. The one-time capture option is refused after activation or after the initial API image has changed.

The agent saves recovery state before replacing a container. Failed health checks restore the saved local image. An interrupted replacement is recovered on the next apply/poll. A candidate that fails permanently is not retried each poll; `--retry` explicitly allows another attempt. Network failures retain the partial download for a later check. No database reset, volume deletion or global Docker prune is used. Cleanup retains current/previous managed images and five database backups.

## Observe

```sh
systemctl --user status nawah-release-agent.timer
journalctl --user -u nawah-release-agent.service
python3 /data/cms/deployment/agent.py check
```

Private `state.json` records current/previous versions and pending recovery. `events.jsonl` records download bytes, duration, release ID, health failures and rollback outcomes, without environment values. A replacement may briefly interrupt its target service; this is not a blue/green deployment.

## Tests

`python3 -m unittest discover -s scripts/deployment -p 'test_*.py' -v` tests resume, checksum rejection, repository/origin validation, failed-health rollback, independent service deployment, consecutive releases, crash recovery, migration compatibility and approval gates. These tests use temporary state and mocked Docker commands; they cannot touch production.

The companion frontend has the same `release.py` under `scripts/release`; keep both copies byte-identical when changing the release protocol. CI smoke tests execute the built runtime with disposable CI state. The GitHub token is limited to read-only checks, candidate publication, or explicit manual approval as appropriate; no server access token or SSH ingress is required.
