# EcoStream Engineering Changelog

## v1.3 — Data-layer engineering

- Introduced a single asynchronous storage boundary shared by JSON and PostgreSQL.
- Converted all API route database operations to asynchronous calls.
- Converted session and audit helpers to asynchronous storage operations.
- Added PostgreSQL driver selection through `DB_DRIVER=postgres`.
- Added PostgreSQL startup validation for `DATABASE_URL`.
- Added Prisma repository input/output normalization for dates, BigInt and Decimal values.
- Preserved API enum values such as `in-progress` and `water-test` when Prisma uses mapped enum identifiers.
- Added optional PostgreSQL demo seed through `prisma/seed.js`.
- Added backend `package.json` and Prisma install/generate scripts.
- Updated Docker and Render configuration so the Prisma dependency can actually be installed/generated during deployment.
- Added a PostgreSQL production runbook.

## v1.2 — Security hardening

- Production JWT secret validation.
- Password-reset and email-verification token hashing.
- Request-body limits and malformed JSON handling.
- Upload file-signature validation.
- Production demo-data protection.

## Verification

- All backend JavaScript files pass `node --check`.
- JSON-driver health/login smoke tests pass.
- Admin clients and dashboard endpoints pass after the async storage migration.
- Remaining PostgreSQL verification requires a reachable PostgreSQL service and npm registry access.