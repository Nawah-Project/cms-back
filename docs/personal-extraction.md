# Personal domains extracted from Nawah

Founder workspace, strategic relationships and the learning library belong to a
separate personal application at https://personal.nawah-project.com, with private
source repositories, independent identity, PostgreSQL, files and releases.
Nawah administrators do not gain access to that application through their role.

Nawah retains consulting/participants, Journey, mentoring, marketing, operations
and platform/member management. Product accounts, grants, progress and CV storage
are not migrated or reset. Historical Prisma migrations are retained; the old
personal tables remain as empty compatibility structures after verified transfer.

Old personal UI bookmarks redirect to the new host, preserving only supported
navigation parameters. No Nawah cookies/tokens are transferred. Product runtime
builds exclude the extracted implementation and assets; API endpoints are removed.

Deployment is sequenced after independent personal runtime/backup/restore tests,
owner password/TOTP setup and a final frozen owner-scoped export/import comparison.
Source personal rows are cleaned only after that comparison; private encrypted
rollback evidence is kept for 14 days. Docker rollback does not reverse data changes.

The extraction does not rewrite historical public Git commits. Personal records,
book files, backups and credentials must never be committed to either codebase.
