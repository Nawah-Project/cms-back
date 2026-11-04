# Private learning library

The approved integrated reader is backed by `LearningLibraryModule`, its own repository
port and ten additive tables. PostgreSQL stores separate validated resource rows for
books, editions, notes, maps, goals, reading events and positions; library revisions
and mutation receipts provide CAS and idempotency. No shared AdminService business
logic or direct access to another domain’s data. Architecture checks enforce this.

Session + administrator + verified-email guards apply before all endpoints under
`/admin/learning-library`. LEARNING_LIBRARY READ/WRITE is independent; no migration
grants existing administrators access. Every read/write/transfer/export uses the
current actor as owner, including Root. READ never registers visits or uploads.

Local PDFs remain the default; registering metadata does not upload a book.
Optional private server files use LEARNING_STORAGE_DIR (default
/app/private-storage/learning), and the SSH/SFTP inbox uses LEARNING_INBOX_DIR
(default /app/private-storage/learning-inbox). Keep both independent from CV storage
and backed by persistent mounts owned by the runtime user (uid1000). They are not
public asset directories. Full books and notes must never enter git or Docker.

Files reserve their full declared size against a separate20GiB quota, max500MiB/book.
Chunks are at most1MiB, offset-checked and SHA-256 checked, with fsync before accepting
a new offset. Server pacing limits transfer rate to1MiB/s; interrupted requests resume
from the server-accepted offset. Completion validates full size, signature and hash
before READY. Private GET/Range rechecks owner, sends no-store, and streams through
rate limiting. Removal preserves metadata, notes and progress. Symlink and arbitrary
path adoption are rejected. Inbox adoption is explicit and reuses transfer validation.
Use uuid-named account subdirectories in the inbox; list/import never accept a path.

The module currently runs in the existing single API process. Its request scheduler
serializes transfers per owner there; database locks protect reservation/chunk/metadata
races. Extracting the service or adding replicas requires distributed transfer leases
and shared or object storage, rather than assuming process-local scheduling is global.

Backup tooling captures both configured private mounts, checks READY references and
hashes, retains incomplete upload offsets and files, and verifies isolated recovery.
See scripts/backup/README.md. Recovery mounts must be distinct from every source mount.
Application-image rollback is separate from migration/data recovery. Existing CV cleanup
only targets its CV mount and cannot discover these independent library roots.

Metadata export/restore is owner-scoped, validated, merges existing identities and
keeps other records. It does not restore file bytes or silently replace an edition's
fingerprint, page count, size or book identity. Large metadata restore has its own
bounded32MiB parser; ordinary requests remain bounded1MiB.

Founder integration uses its generic authorized `POST /admin/founder-workspace/plans/:id/tasks`
contract. The library never imports Founder internals or edits Founder tables. A user
explicitly chooses dates, effort and cycle; a new task stays planned, without automatic
rescheduling or completion. Its create idempotency protects repeated confirmation.

Disable the module with LEARNING_LIBRARY_ENABLED=false; existing domains continue to
boot. Do not enable Production until fresh backup+isolated recovery, migration/old-image
rehearsal, actual-image browser tests and hosted CI are verified. No reset/seed in Production.
