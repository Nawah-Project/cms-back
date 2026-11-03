# Founder workspace: ownership and operations

The founder workspace is a separate domain for the founder's planning and learning: cycles, tasks, capacity, evidence, and reviews. It creates no consulting case, research participation, consent, programme progress, or CV. Existing P0 research archives remain untouched and no retired controller or access override is reintroduced.

## Boundary

`FounderWorkspaceModule` imports only `PlatformAccessModule`. Its application service depends on `WorkspaceRepository`; only the infrastructure adapter uses Prisma. Domain validation has no Nest/Prisma/auth imports. Platform access contains the current-session adapter: its identity guard supports existing cookie refresh but does **not** invoke programme readiness. Existing programme routes retain their original guard and readiness rules.

Shared administrator policy/guard moved to `platform/access`, with compatibility exports in `admin` so existing controllers keep the same rules. IAM adapters still use the existing AuthModule internally; this is a replaceable integration boundary, not a claim that the entire backend has been refactored into independent services.

`scripts/architecture/check-boundaries.cjs` rejects reverse feature dependencies, foreign table access, domain framework imports, and arbitrary feature imports. Disable registration with `FOUNDER_WORKSPACE_ENABLED=false`; the rest of the platform does not call its services.

## API and permissions

All routes start `/admin/founder-workspace`, require a current authenticated administrator and `FOUNDER_WORKSPACE` READ/WRITE, and return private/no-store data. Root qualifies through the existing root rule. No other existing permission JSON is changed, so initial availability is Root only. Explicit later grants do not share another owner's private plan.

| Method | Path | Behavior |
|---|---|---|
| GET | `/access` | Actor identifier and actual write capability; no content. |
| GET | `/template` | Generic 24-cycle plan with first two cycles detailed; no invented outcomes. |
| GET | `/plans` | Current actor's plan summaries only. |
| GET | `/plans/:id` | Own document; Root may inspect a known ID; unauthorized ownership returns 404. |
| POST | `/plans` | Validated document and UUID `requestId`; idempotent creation. |
| PATCH | `/plans/:id` | Validated document, UUID `requestId`, and `expectedRevision`; optimistic transaction. |

READ denies POST/PATCH in Backend. Ownership is never accepted from the document. The server assigns plan ID/revision. JSON validation checks dates, references, prerequisite cycles, hours, levels/evidence, source protocols, and a 750 KB maximum below the global 1 MB request limit.

Successful mutation receipts contain a request hash and resulting revision, **not a duplicate private document snapshot**. Reusing a key with a different payload is a conflict. Replaying the same key returns current authorized content without reapplying an old write. Concurrent distinct writes permit one revision winner and return 409 to the loser. Account deletion can cascade to its owned workspace/receipts; no scheduled deletion job was added.

## Migration and compatibility

`20261103110000_founder_workspace` adds `founder_workspaces` and `founder_workspace_mutations`, indices and an owner FK. It updates no existing rows and changes no existing column or migration. The old API can continue operating with the additional tables after image rollback. New records must be preserved during rollback; do not drop tables to undo an application release.

Backups cover these tables automatically through full PostgreSQL dumps. No workspace attachments or dependency on private CV paths/cleanup exist. No content is sent to marketing, UX Lab, email, or operational audit events; ordinary aggregate HTTP metrics continue.

## Tests and release

New E2E fixtures use disposable `cms_test` only: unassigned admin/member denial, READ restriction, no-CV admin access, ownership, idempotent create/update retries, concurrent writes, nested validation, and unchanged programme/consulting/research/CV/permission snapshots. Never run the fixture/reset script against production.

Use verified backup/restore before deployment, build on GitHub, stage checksummed images, explicitly approve the additive API migration, then deploy API before admin frontend and member gateway. Preserve previous images and effective Compose settings. There is no change to repository visibility or automatic expansion of admin permissions.
