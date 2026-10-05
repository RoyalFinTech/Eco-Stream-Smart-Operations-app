# EcoStream Backend

Zero-dependency Node.js API. See `/documentation` at the project root for full API reference, architecture, QA report, and deployment checklist.

## Run it

```bash
node server.js
```

Listens on port 4000 by default (override with the `PORT` environment variable). Seeds demo data into `database/store.json` on first run.

## Folders

- `database/` — `store.json`, the JSON-file datastore. Delete it and restart to reseed demo data. Back this up in production until/unless you migrate to a real database (see documentation/DEPLOYMENT_CHECKLIST.md).
- `uploads/` — actual uploaded files (borehole reports, water-test results, contracts), named `<documentId>.<ext>`. Only metadata lives in `database/store.json`; the bytes live here.
- `lib/` — router, auth (password hashing + JWT), datastore, validation, audit logging.
- `routes/` — one file per resource.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | HTTP port |
| `JWT_SECRET` | a hardcoded dev value | **Set this to a real random secret before deploying anywhere real** |
| `LOG_LEVEL` | info | error / warn / info / http / debug |
| `RATE_LIMIT_MAX` | 120 | Max requests per IP per 60s window |
| `ALLOWED_ORIGINS` | unset (allows any origin) | Comma-separated CORS whitelist |
| `STORAGE_PROVIDER` | local | local / s3 / r2 / supabase — see `lib/storage/` |

Full variable-by-variable test evidence: `../documentation/ENVIRONMENT_VARIABLES.md`.

## Before deploying

Read `../documentation/DEPLOYMENT_CHECKLIST.md`. The short version: set `JWT_SECRET`, lock down CORS, and decide whether JSON-file storage is enough for your scale or whether to move to Postgres first.