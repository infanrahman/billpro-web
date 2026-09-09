# Billing Pro Django API

This is the relational backend for the Billing Pro web tracker. It provides:

- Django Admin at `/admin/`
- REST API under `/api/`
- bearer-token authentication for the POS sync client
- company and branch scoped access
- idempotent POS sync at `POST /api/sync/push/`
- typed reporting tables plus a complete `SyncedRecord` payload table

## Backend applications

The API is separated into domain applications while preserving the existing
public `/api/` routes and shared database schema:

- `accounts`: authentication, users, and managed access tokens
- `organizations`: companies, branches, and devices
- `inventory`: items and categories
- `relationships`: customers, suppliers, and customer payments
- `sales`: sales and sale items
- `purchases`: purchases, purchase items, and supplier payments
- `finance`: expenses, cash book, parties, and transactions
- `reports`: overview, audit, notifications, shifts, scales, and activity
- `sync`: desktop synchronization batches and synced records
- `zatca`: Saudi e-invoicing Phase 2 readiness endpoints
- `system`: service health

The legacy `tracking` app remains the compatibility data layer so existing
POS sync clients and deployed databases continue to work during the domain
split.

## Local setup

From this directory:

```powershell
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The health endpoint is `http://127.0.0.1:8000/api/health/` and the admin panel is
`http://127.0.0.1:8000/admin/`.

## Railway deployment

Create a Railway PostgreSQL service and a Python service pointed at this
`backend` directory. Railway supplies `DATABASE_URL`. Set
`DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, and `CORS_ALLOWED_ORIGINS` in the
service variables. `railway.toml` runs migrations before Gunicorn starts.

Create the first owner with a one-off command:

```powershell
python manage.py createsuperuser
```

For automated Railway startup, set `DJANGO_SUPERUSER_USERNAME`,
`DJANGO_SUPERUSER_PASSWORD`, and `DJANGO_SUPERUSER_EMAIL`. The deployment
command runs `ensure_admin` before starting Gunicorn.

Then create a normal tracking user in Django Admin, assign the user to a
company and branches, and use `/api/auth/login/` to obtain a managed token.

## Connecting existing desktop records

Deploy the current backend and website, and rebuild/restart the desktop POS
with the current sync service before uploading older records.

1. Sign in to the website with an account assigned to the POS company. A
   superuser is required for the initial sync if the POS company does not yet
   exist in Django.
2. In web Settings, create a desktop sync token.
3. In desktop Settings → Data Backup → Web Tracking Sync, save the Railway
   service URL and that token. The service accepts a URL with or without `/api`.
4. Run Test Connection, then Sync All Data for the selected company. Full sync
   includes records from older versions without an update timestamp. Rejected
   records produce an error and do not advance the incremental sync cursor.
5. Assign ordinary web users to the imported company in Django Admin, select
   that company in the website, and refresh.

POS employee identities are mapped to company-specific Django records with
numeric IDs and unusable passwords. Desktop sync does not overwrite existing
web account passwords or permissions. Web access is provisioned separately.

Regression checks use a temporary test database:

```powershell
python manage.py test tracking --noinput
```
