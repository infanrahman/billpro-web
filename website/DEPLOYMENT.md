# Billing Pro Tracking Deployment

## Vercel

Vercel is the recommended host for the Next.js dashboard and API routes.

1. Push this repository branch to GitHub.
2. In Vercel, create a new project and select the `website` folder as the root directory.
3. Use Node.js `24.x`. The project also declares this in `package.json`.
4. Add environment variables from `.env.example`.
5. Deploy.

Important storage note: the current repository uses SQLite for local testing. On Vercel, SQLite defaults to `/tmp/tracking.sqlite` so the API can be tested, but that file is ephemeral and can disappear between function instances or deployments. Before using this with real company data, migrate `website/lib/tracking/repository.ts` to a hosted database such as Vercel Postgres, Neon, or Supabase.

Recommended free-test path:

- Deploy the dashboard to Vercel first.
- Keep `BILLING_TRACKING_BOOTSTRAP_ENABLED=true` only for first setup.
- Use it to validate pages, login, permissions, and API reachability.
- Then connect hosted Postgres before syncing real POS data.

## Local Production Check

```bash
npm run build
npm run start
```

## Environment

Copy `.env.example` to `.env.local` for local overrides or configure the same variables in the host environment.

- `NEXT_PUBLIC_BILLING_TRACKING_URL`: public dashboard URL.
- `BILLING_TRACKING_SQLITE_PATH`: SQLite database file path.
- `BILLING_TRACKING_LEGACY_JSON_PATH`: optional old JSON backup path for one-time import.
- `BILLING_TRACKING_BOOTSTRAP_ENABLED`: opt in to bootstrap owner/manager login only during first setup.
- `BILLING_TRACKING_BOOTSTRAP_OWNER_PASSWORD`: bootstrap owner password.
- `BILLING_TRACKING_BOOTSTRAP_MANAGER_PASSWORD`: bootstrap manager password.

## First Setup

1. Start production once with `BILLING_TRACKING_BOOTSTRAP_ENABLED=true`.
2. Sign in as `owner` with the configured bootstrap owner password.
3. Create a real owner/admin user with a strong password.
4. Create a managed token for desktop sync.
5. Disable bootstrap login and restart the app.

## Health Check

Use:

```http
GET /api/health
```

The response reports auth bootstrap status, SQLite readiness, and row counts without exposing secrets or token values.

## Backups

Use the dashboard sidebar or:

```http
GET /api/tracking/backup
POST /api/tracking/backup
```

Backup export requires `backup.create`; restore requires `backup.restore`.
