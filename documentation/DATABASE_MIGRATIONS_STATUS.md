# Database Migration Status

## Current architecture

EcoStream now has one asynchronous storage contract used by all routes:

- `DB_DRIVER=json` — local/single-instance fallback datastore.
- `DB_DRIVER=postgres` — Prisma/PostgreSQL repository layer.

The route layer no longer contains a separate PostgreSQL implementation. This avoids API drift between database drivers.

## PostgreSQL readiness

Implemented:

- Prisma schema for all application collections.
- Initial SQL migration.
- Prisma repository adapter.
- Date/BigInt/Decimal API normalization.
- Mapped enum compatibility for existing HTTP values.
- PostgreSQL-aware application bootstrap.
- Optional Prisma demo seed.
- Production Docker dependency installation and Prisma generation.

Still requires deployment-environment verification:

1. `npm install` / `prisma generate` with registry access.
2. `prisma validate`.
3. `prisma migrate deploy` against the actual PostgreSQL instance.
4. API smoke tests against PostgreSQL.
5. Backup/restore test.
6. Data migration if existing customer records are to be retained.

No claim should be made that PostgreSQL is production-verified until those steps have been run against a real database.