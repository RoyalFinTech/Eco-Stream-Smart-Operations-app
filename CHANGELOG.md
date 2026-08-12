# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Every entry below reflects work actually done and tested in this project's history, not a projected roadmap.

## [Unreleased] — Production hardening audit

### Security
- Removed the hardcoded JWT signing-secret fallback (`lib/auth.js`). The app now refuses to start in production without a real `JWT_SECRET`, and generates a random per-process secret (with a clear warning) for local development instead of using a known string that was visible in this repository.
- Fixed the same class of issue in `docker-compose.yml`, which had its own hardcoded `JWT_SECRET` default (`change-me-in-production`) — removed.
- Added `NODE_ENV=production` to `backend/render.yaml` so the JWT fail-fast protection above is active by default on Render deployments, rather than depending on the operator setting it themselves.
- Added defense-in-depth path traversal protection to the local file storage provider (`lib/storage/local.js`). Not currently exploitable through any existing endpoint (verified — every caller already generates safe keys server-side), but the storage layer no longer depends solely on callers remembering that.

### Fixed
- Removed an unused `genId` import in `lib/seed.js` (dead code — verified via static analysis that it was never referenced after import).

### Added
- `SECURITY.md`, this `CHANGELOG.md`, and `RELEASE_NOTES.md`.

## [1.2.0] — GitHub readiness

### Added
- Root `.gitignore`, tested rule-by-rule against real files (`git check-ignore`) rather than written and assumed correct — this caught and fixed one real bug (a `.gitkeep` file being wrongly excluded by a blanket directory rule).
- Root `README.md` covering overview, architecture, features, setup, environment variables, Docker usage, deployment, and folder structure.

### Fixed
- Corrected a stale Dockerfile comment referencing a vendored dependency that had already been removed.
- Completed `.env.example` and `backend/README.md` — both were missing the `NODE_ENV` variable, which is genuinely read by `repositories/prismaClient.js`.

### Removed
- `backend/node_modules/` (a vendored copy of `zod`) — confirmed unused by searching the entire active codebase for any `require("zod")` call, then verified by physically removing it and running the full test suite with it absent.
- `backend/logs/app.log` — a generated runtime log file that had been committed; `.gitkeep` preserves the empty folder instead.

## [1.1.0] — Backend hardening & feature completion

### Added
- Refresh tokens with rotation, device/session tracking and revocation, account lockout after repeated failed logins, email verification flow.
- Security headers, CORS allow-list, rate limiting, structured JSON logging, graceful shutdown.
- `/api/v1/...` versioned route aliases alongside the original unversioned paths; opt-in pagination and search on list endpoints (backward-compatible — verified the original response shape is unchanged when no query parameters are sent).
- Interchangeable file storage abstraction (local disk — tested; S3, Cloudflare R2, Supabase Storage — written against each service's documented API, not yet verified against a real account).
- Prisma schema and hand-authored initial migration SQL for a future PostgreSQL migration, plus a Postgres-backed repository layer and one fully converted example route — none of this wired into the running app yet (no reachable database or package-registry access in this project's development environment; see `documentation/POSTGRES_MIGRATION.md`).
- Admin portal: client search, CSV export (clients and invoices), a dashboard activity feed sourced from the audit log.
- Client portal: signed-in devices panel (list/revoke sessions).
- `Dockerfile`, `docker-compose.yml`, `nginx.conf`, Render and Railway deployment configs, `scripts/backup.sh`.

## [1.0.0] — Two-portal split

### Added
- Split the original single-file React prototype into three independent pieces: a zero-dependency Node.js backend, a standalone client portal, and a standalone admin operations portal.
- Full REST API covering auth, clients, projects, bookings, payments/invoices, tickets, staff, equipment, documents, chat, notifications, CMS, and audit logs.

## [0.x] — Original prototype

- Single-file React application with an in-memory (non-persistent) data layer, later audited for bugs, split, and rebuilt into the architecture described above.
