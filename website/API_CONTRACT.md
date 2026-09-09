# Billing Web Tracking API

This is the first foundation for company-wise and branch-wise tracking from the desktop POS into the web dashboard.

## Authentication

Login creates a managed bearer token:

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "username": "owner",
  "password": "configured-password"
}
```

Send the returned token with protected requests:

```http
Authorization: Bearer bt_generated_token_value
```

Optional bootstrap users are available only when explicitly enabled with
`BILLING_TRACKING_BOOTSTRAP_ENABLED=true` and configured passwords. Disable
bootstrap login after creating real users and managed tokens. No demo bearer
tokens or static business records are accepted.

Token management:

- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/tracking/tokens`
- `POST /api/tracking/tokens`
- `DELETE /api/tracking/tokens?id=token-id`

## Scope

Every synced record must include `companyId`. Branch-level records should include `branchId`.

Master/dashboard views can request:

```http
GET /api/dashboard/summary?companyId={companyId}
```

Branch views can request:

```http
GET /api/dashboard/summary?companyId={companyId}&branchId={branchId}
```

## Sync Push

```http
POST /api/sync/push
Content-Type: application/json
Authorization: Bearer bt_generated_token_value
```

```json
{
  "deviceId": "desktop-pos-01",
  "batchId": "desktop-pos-01-2026-09-01T10:00:00.000Z",
  "scope": {
    "companyId": "11111111-1111-1111-1111-111111111111",
    "branchId": "00000000-0000-0000-0000-000000000000"
  },
  "changes": {
    "sales": [
      {
        "id": "invoice-id",
        "companyId": "11111111-1111-1111-1111-111111111111",
        "branchId": "00000000-0000-0000-0000-000000000000",
        "updatedAt": "2026-09-01T10:00:00.000Z",
        "invoiceNumber": "INV-001",
        "customerName": "Walk-in Customer",
        "grandTotal": 115,
        "paidAmount": 115,
        "remainingAmount": 0,
        "paymentStatus": "paid",
        "createdAt": "2026-09-01T10:00:00.000Z"
      }
    ]
  }
}
```

Response:

```json
{
  "batchId": "desktop-pos-01-2026-09-01T10:00:00.000Z",
  "accepted": 1,
  "rejected": 0,
  "auditIds": ["audit-id"],
  "serverTime": "2026-09-01T10:00:01.000Z"
}
```

## Current Endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/sync/push`
- `GET /api/dashboard/summary`
- `GET /api/audit`
- `GET /api/tracking/overview`
- `GET /api/tracking/permissions`
- `GET|POST|DELETE /api/tracking/tokens`
- `GET|POST /api/tracking/backup`
- `POST|PUT|DELETE /api/tracking/companies`
- `POST|PUT|DELETE /api/tracking/branches`
- `POST|PUT|DELETE /api/tracking/users`
- `POST|PUT|DELETE /api/tracking/inventory`
- `POST|PUT|DELETE /api/tracking/customers`
- `POST|PUT|DELETE /api/tracking/suppliers`
- `POST|PUT|DELETE /api/tracking/transactions`
- `GET /api/tracking/zatca?id={invoiceId}`

## Storage

The current foundation persists tracking data and auth tokens to SQLite at `website/.data/tracking.sqlite` through `website/lib/tracking/repository.ts`.

If the old JSON file exists at `website/.data/tracking-db.json`, the repository imports it once into SQLite and marks the migration in the `meta` table.

The SQLite and legacy JSON paths can be configured with:

- `BILLING_TRACKING_SQLITE_PATH`
- `BILLING_TRACKING_LEGACY_JSON_PATH`

See `DEPLOYMENT.md` and `.env.example` for production setup notes.

## Multi-application workspace

The web client exposes separate applications at `/overview`, `/pos`, `/sales`,
`/purchases`, `/inventory`, `/customers`, `/suppliers`, `/expenses`,
`/cashbook`, `/reports`, `/zatca`, `/users`, and `/settings`. They share the
same authenticated scope and repository, so a POS sale is immediately
available to Sales, Reports, and the ZATCA readiness view after refresh.
