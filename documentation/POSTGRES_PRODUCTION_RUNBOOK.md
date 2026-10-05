# EcoStream PostgreSQL Production Runbook

## 1. Provision
Create a managed PostgreSQL database and record its `DATABASE_URL`. Keep it in the deployment secret store; never commit it.

## 2. Configure
Set:
```text
NODE_ENV=production
DB_DRIVER=postgres
DATABASE_URL=postgresql://...
JWT_SECRET=<48+ random bytes>
ALLOWED_ORIGINS=https://client.example,https://admin.example
```
Do not set `SEED_DEMO_DATA=true` in production.

## 3. Install and validate
From `backend/`:
```bash
npm ci
npx prisma validate
npx prisma generate
npx prisma migrate deploy
```

## 4. Smoke test
Start the API and verify `/api/health`, login, profile, clients, projects, bookings, payments, tickets, documents and sessions.

## 5. Cutover
Keep the JSON `database/store.json` backup from the last working version. Do not copy demo JSON data into a production customer database without an explicit data migration.

## 6. Rollback
If the application fails after cutover, set `DB_DRIVER=json` only for an isolated emergency instance. Do not point multiple production instances at the JSON datastore. Restore PostgreSQL from the managed backup if data was written after cutover.