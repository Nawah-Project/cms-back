# Strategic relationships

Independent domain module, initially available only through Root's existing access. The new `STRATEGIC_RELATIONSHIPS` permission supports READ/WRITE for explicit future assignment; this migration grants nobody additional permissions.

## Ownership and API

`/admin/strategic-relationships`: `GET access`, `GET template`, `GET workspaces`, `GET workspaces/:id`, `POST workspaces`, `PATCH workspaces/:id`.

SessionGuard authenticates identity without programme/CV requirements. AdministratorGuard checks the independent section and READ versus WRITE at every request. Repository queries are **owner-scoped, including Root**. Root's ability to manage administrator grants does not bypass somebody else's personal-data ownership. Out-of-scope resources return404; unavailable section access returns403. Responses are private/no-store.

Each account has one personal workspace. Creation is race-safe; updates use an expected revision and payload-bound idempotency receipt. Concurrent different updates cannot overwrite each other silently. Receipt rows carry hashes/revisions, not copies of private notes. The frontend keeps pending drafts in page memory and offers retry/export; there is no private localStorage snapshot.

Documents are server-validated, bounded750KB, with typed references, calendar/URL checks, evidence gates, consent checks for completed introductions, and separate interpretation/source fields. Only `personal` documents are accepted; fictional training data remain a temporary client-only exercise. An empty account is not seeded with contacts, partnerships or success claims.

## Domain boundaries

The module owns contacts, organizations, relationship context, goals, interactions, commitments, events, collaboration charters, reviews, analysis snapshots and the owner's learning evidence. It does not write Journey, consulting, CV, research or marketing records. It publishes no private analytics events and logs no note text. Generic operational route/latency counters remain available without content.

The repository port isolates Prisma in `infrastructure/`; no domain/application import of AdminService or another feature's services. `scripts/architecture/check-boundaries.cjs` checks outgoing imports, incoming feature imports and foreign access to the tables. `STRATEGIC_RELATIONSHIPS_ENABLED=false` removes module registration and routes while preserving data. Physical extraction later also requires its data/operation contracts; container separation alone does not accomplish it.

Founder owns schedule/effort; relationships owns private context and learning evidence. The initial integration consumes an explicitly exported Founder document through a versioned file contract and returns a capacity-previewed proposal. It never silently imports or modifies the plan and does not put contact notes in Founder tasks.

## Deployment and rollback

Migration `20261103180000_strategic_relationships` adds two tables and their constraints/indexes. Existing records and grants are untouched. Take a verified PostgreSQL/CV backup and rehearse restoration/migration before production. A previous application image can ignore these additional tables; application rollback does not reverse migration. Preserve relationship data during rollback.

Use the established GitHub build/approval and rate-limited deployment agent. Runtime security pins and independent API/admin/member images remain in force. Books/PDFs and private backup/QA credentials must never enter a release or public source.

Validation: new domain and real PostgreSQL integration tests cover identity/permission/ownership, Root isolation, READ, malformed documents, idempotency, concurrent writes and unchanged programme/consulting/founder/research/CV state. Actual-image browser checks add contextual capture, training isolation, network/lessons, retry/lost response, two-window drafts, member gates and bilingual responsive views.
