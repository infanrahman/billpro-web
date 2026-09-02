# Billing Pro Tracking Deployment

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
- `BILLING_TRACKING_BOOTSTRAP_ENABLED`: enable bootstrap owner/manager login in production only during first setup.
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
