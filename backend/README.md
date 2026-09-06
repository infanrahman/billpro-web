# Billing Pro Django API

This is the relational backend for the Billing Pro web tracker. It provides:

- Django Admin at `/admin/`
- REST API under `/api/`
- bearer-token authentication for the POS sync client
- company and branch scoped access
- idempotent POS sync at `POST /api/sync/push/`
- typed reporting tables plus a complete `SyncedRecord` payload table

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

Then create a normal tracking user in Django Admin, assign the user to a
company and branches, and use `/api/auth/login/` to obtain a managed token.
