# CMS API

NestJS 11 API using Prisma ORM 6 and PostgreSQL. The SQLite/TypeORM runtime has been removed. Password and refresh-token hashes stay private; JWT access and refresh tokens are sent only in HttpOnly cookies.

## Local PostgreSQL

1. Copy `.env.example` to `.env`, use `NODE_ENV=development`, and set `DATABASE_URL` to `localhost` for the API running on the host. Keep `.env` out of Git.
2. Start PostgreSQL only: `docker compose -f docker-compose.yml up -d`.
3. Apply schema migrations: `npm run prisma:migrate:deploy`.
4. Generate Prisma Client: `npm run prisma:generate`.
5. Run the API: `npm run start:dev`.

The local Compose service persists data in the `cms-postgres-data` Docker volume and binds PostgreSQL to loopback only. For schema development, use `npm run prisma:migrate:dev -- --name describe_change` and commit the generated `prisma/migrations` files. Never use `prisma db push` or `prisma migrate reset` in production.

## Production deployment

The production stack is in `compose.yml`; it builds the API and frontend, starts PostgreSQL with persistent database storage, deploys Prisma migrations before starting the API, and mounts private CV storage. PostgreSQL and app ports bind to `127.0.0.1` only. Put a TLS reverse proxy in front of the frontend and API; set its public frontend origin and API URL in `.env`.

1. Copy `.env.example` to `.env` and replace every placeholder. Generate different secrets with `openssl rand -hex 32`; use an URL-safe hex password for PostgreSQL and use that exact password in both `POSTGRES_PASSWORD` and the two database URLs.
2. Set `FRONTEND_ORIGIN` to the public HTTPS frontend origin and `VITE_API_URL` to the public HTTPS API URL. Set `TRUST_PROXY` to the actual proxy hop count (the default `1` assumes one trusted local proxy).
3. Back up the production database before the first deployment or any schema change.
4. Build and start the stack: `docker compose -f compose.yml up --build -d`.
5. Check readiness with `curl http://127.0.0.1:3000/health` and inspect startup output with `docker compose -f compose.yml logs api`.

The API rejects production startup if database configuration, HTTPS CORS origins, persistent CV storage, or distinct 32-byte JWT secrets are missing/invalid. `prisma migrate deploy` runs at API startup. Journey initialization creates missing default nodes without overwriting administrator changes; it does not delete submissions or normalize CV versions. Back up PostgreSQL and CV files together at a quiesced consistency point; see [backup and isolated recovery instructions](scripts/backup/README.md). Rate limits use in-process memory, and CV files use a local persistent volume; this deployment is intended for a single API instance on one host. Multiple API replicas need shared CV storage and a shared rate-limit store.

The container images could not be built in this environment because the Docker CLI cannot access `/var/run/docker.sock`; `docker compose config` validation is available without daemon access.

## Import the existing SQLite data

The previous `applications.sqlite` file is intentionally retained as a read-only migration source and ignored by Git. First apply the PostgreSQL migrations to an empty target database. Review a dry run:

```bash
npm run db:import:dry-run
```

The dry run reports counts and detected invalid/duplicate relationship rows without showing emails, password hashes, or tokens, and does not write to PostgreSQL. Import only after reviewing the counts:

```bash
npm run db:import
```

The importer refuses non-empty PostgreSQL tables, preserves UUIDs where valid, remaps malformed IDs while retaining relationships, validates enum values and foreign-key ownership, caps memberships at 10, assigns users missing a group, and verifies imported row counts. Invalid records are skipped and counted; duplicated user memberships after the oldest one are skipped and counted. It does not invent application stage history. Keep a separate backup of the SQLite file until imported counts and application behavior have been checked.

## Tests

Tests use PostgreSQL, not SQLite. Set `TEST_DATABASE_URL` in `.env` to a dedicated empty database named `cms_test`; the test setup refuses to run without it and switches the app's `DATABASE_URL` to that database. Create it once:

```bash
docker compose -f docker-compose.yml exec postgres sh -c 'createdb -U "$POSTGRES_USER" cms_test'
```

Apply migrations to the test database and run the suite:

```bash
npm run prisma:migrate:test
npm test -- --runInBand
npm run test:e2e
```

The e2e suite truncates application tables in `cms_test` between suites. Never point `TEST_DATABASE_URL` at a development or production database. The example `DATABASE_URL` is for running the API on the host; `DATABASE_URL_DOCKER` uses the Compose `postgres` service name.

## Data model and behavior

- A user has at most one membership; a database trigger serializes membership writes per group and enforces the 10-member limit.
- Registration uses a PostgreSQL advisory lock and a serializable transaction with conflict retries to assign each user atomically.
- Application updates and stage-transition records share one transaction. Non-stage edits create no transition.
- Application queries, dashboard counts, member progress, and recent progress are scoped and aggregated in PostgreSQL.
- Group capacity is reused in oldest-first order. Removing a membership preserves its user, applications, and stage history; administrators can later assign an unassigned user to the oldest group with space.
- Admin monitoring calculates activity from application creation/update timestamps and stage-transition history. User profile/authentication timestamps are excluded. Inactivity thresholds are centralized: warning at 3 days, critical at 7 days.
- Deleting a user cascades to their memberships, applications, and stage transitions. Deleting a group with memberships is restricted.
- Search uses PostgreSQL case-insensitive matching; existing API paths and response shapes remain compatible.

## Social authentication

Google sign-in uses a server-side authorization-code flow and returns to the frontend with the existing access and refresh HttpOnly cookies. Provider tokens are never returned to the frontend or stored in the database. New provider users receive the same automatic group assignment as email/password registrations.

Configure the social-login variables in the backend `.env` using the placeholders in `.env.example`. Register these exact callback URLs with the providers:

- `GOOGLE_REDIRECT_URI` → `http://localhost:3000/auth/google/callback`
The frontend can begin a flow by navigating to `/auth/google` on the API. Production callback URLs must use HTTPS and exactly match the provider console configuration. Keep the Google client secret on the backend only.

Provider identities are keyed by the verified provider subject, never by email. If a verified provider email already belongs to a password account without that provider identity, the callback returns to `/auth/login` with `socialError=account_link_required`; it does not merge the accounts.

## API

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`
- `GET /auth/google`, `GET /auth/google/callback`
- `GET|POST /applications`, `GET|PATCH|DELETE /applications/:id`, `GET /applications/dashboard`
- `GET /members/progress`, `GET /members/progress/recent`
- `GET /profile`, `PATCH /profile` with `{ "portfolioUrl": "https://..." }`, and `POST /profile/cv` with multipart field `file` (PDF only)
- Authenticated `GET /users/:userId/cv` streams the CV for its owner, an active same-group member, or an administrator
- Admin-only: `DELETE /admin/groups/:groupId/members/:userId`, `POST /admin/users/:userId/group-assignment` (optional JSON body `{ "groupId": "..." }` to choose an available group; without it, the backend selects the oldest available group)
- Admin-only monitoring: `GET /admin/monitoring/overview`, `GET /admin/monitoring/users?page=1&limit=20&activityStatus=WARNING`, `GET /admin/monitoring/groups`, `GET /admin/monitoring/activity?limit=20`, `GET /admin/monitoring/users/:userId`

New accounts receive the `USER` role. After applying migrations, grant administrator access through a trusted database session, for example: `UPDATE users SET role = 'ADMIN' WHERE email = 'admin@example.com';`. Admin routes verify this database role on every request; client-supplied role data is never trusted.

Credentialed CORS uses the comma-separated `FRONTEND_ORIGIN` allowlist (for example `http://localhost:5173,http://localhost:5174`). Restart the backend after changing it. Production requires distinct random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.

CV files are stored outside public/static serving under `private-storage/cvs` by default. Set `CV_STORAGE_DIR` to a private persistent volume in production. `CV_MAX_FILE_SIZE_BYTES` configures the PDF upload limit (5 MiB default, capped at 25 MiB). PostgreSQL stores only the CV metadata and private storage key.

### Stabilization verification (Phase 2)

Use Node **24.9+** (the tested cached image runs 24.21.0). `npm test` and
`npm run test:e2e` enable Node VM modules so Jest loads the real ESM dependencies;
only TypeScript source is transformed. No sanitizer mock is used in the sanitizer
regression test. E2E fixtures use a disposable `cms_test` database and suppress
scheduled no-response startup work; the processor has separate tests.

With migrations applied **only to that disposable database**:

```bash
npm run prisma:generate
npm run build
npx tsc --noEmit --incremental false
npm test -- --runInBand
npm run test:e2e
node --test test/stabilization.stage-a.cjs test/stabilization.stage-b.cjs
node --test test/stabilization.stage-c.cjs
```

`TEST_DATABASE_URL` is mandatory; the native integration tests refuse other DB
names and `NODE_ENV` values. The Phase 1 integration config additionally requires
a fresh empty schema. See `docs/NAWAH_PHASE_2_MANUAL_QA.md` for browser checks.
Registration now always requires email verification: verify SMTP delivery in the
intended deployment before admitting pilot members. SMTP failure retains the
pending authenticated account and supports fresh-code resend; it never marks the
email verified automatically. Test mode alone captures synthetic OTPs in memory.
