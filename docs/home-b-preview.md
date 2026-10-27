# Home B preview boundary

`GET /admin/ux-lab/v2/home-preview` accepts START (default), WEEK_ONE, AFTER_WEEK_TWO, FINISHED and WAITING. The controller uses JwtAuthGuard and AdminGuard. HomePreviewService only reads configured JourneyNode rows, falling back to the existing catalog if empty. No user state is initialized or evaluated. All progress and people are explicitly synthetic, not live participant analytics.

`GET .../stations/:code/members` takes scenario, GROUP/SPECIALTY/ALL scope, includeGroup, and a validated page. The union is selected and deduplicated before 20-item pagination. Unauthorized identities are excluded before pagination; separate locked counts can be displayed without leaking their names/IDs. Unknown station/member IDs return 404.

`GET .../members/:id` and `GET .../members/:id/cv` apply the same Task zero / W2_REVIEW gates to synthetic profiles. CVs are tiny valid generated PDFs with private/no-store headers. No live CV storage or profile API is used or modified. There is no endpoint for another user's applications or historical CVs in this preview.

The home registry entry is preview-only. Release resolution forces A even if a stale B release exists, assignment skips any stale home experiment, and create/publish/RUNNING transitions reject it. Ordinary-user telemetry for home is rejected; admins remain excluded. These checks intentionally prevent a client query, accidental configuration or old assignment from exposing B to members. Enabling a live home experiment later is a separate change requiring real audience/progress plumbing and an explicit rollout.

No schema migration, production fixture insertion, account reassignment or progress reset is required for this release.
