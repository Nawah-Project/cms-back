# Development and production deployment

## Local development

Run the API and its isolated PostgreSQL database from this repository:

```bash
docker compose -f compose.dev.yml up --build
```

The API is available at `http://localhost:3001`, and the development database
is bound to `127.0.0.1:5433`. Its named volumes are separate from production.
The API applies committed Prisma migrations only to this development database.

In a second terminal, start the frontend from the sibling repository:

```bash
cd ../cms-front
docker compose -f compose.dev.yml up --build
```

Open `http://localhost:5173`. The frontend's `DEV_VITE_API_URL` defaults to
`http://localhost:3001`. Override it when the API is hosted elsewhere.

Stop either development stack with `docker compose -f compose.dev.yml down`.
Do not add `-v` unless you intend to delete that development stack's database
and uploaded files.

## Branch and deployment flow

- Push development work to `dev`; its workflow validates the development stack
  and does not connect to production.
- Open a pull request from `dev` to `main` and merge it after CI passes.
- A push to `main` deploys only the changed repository's service through the
  existing production Compose file: `api` for this repository, `frontend` for
  `cms-front`.
- Deployment runs on the production server's self-hosted Actions runner. It
  syncs the checked-out source locally and excludes the server `.env`, Git
  metadata, build outputs, and mounted private storage. It never runs Compose
  `down` and never removes named volumes.

Register an online self-hosted Linux x64 Actions runner for **both** repositories
or for their GitHub organization. The runner account must be able to write to
`/data/cms-back` and `/data/cms-front`, run Docker Compose, and use `rsync`.
CI validation runs on GitHub-hosted runners; only the deploy job is assigned to
the production server runner.
