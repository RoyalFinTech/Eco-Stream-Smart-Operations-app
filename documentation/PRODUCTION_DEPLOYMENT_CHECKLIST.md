# Production Deployment Checklist

Each item is tagged **[Verified]** (tested this pass or a prior pass against a live server — see linked reports), **[Verified gap]** (tested and confirmed to be a real problem, not yet fixed), or **[Unverified/Assumption]** (standard practice, not testable from this sandbox).

## Before you deploy

- [ ] **[Verified]** Generate and set a real `JWT_SECRET` (48+ characters). Production startup now fails if it is missing or too short.
- [ ] **[Verified]** Set `ALLOWED_ORIGINS` to your real portal domains. Confirmed a non-whitelisted origin is correctly refused when this is set.
- [ ] **[Verified]** Keep `SEED_DEMO_DATA` disabled in production. Production no longer seeds predictable demo administrator accounts.
- [ ] **[Verified]** Decide your `RATE_LIMIT_MAX`. Default (120/min/IP) was verified to trigger correctly; raise it if you expect legitimate burst traffic (e.g., a shared office IP), lower it if you want tighter brute-force protection.
- [ ] **[Verified]** Leave `STORAGE_PROVIDER=local` unless you have separately, actually tested S3/R2/Supabase against a real account — this project's cloud storage code has never completed a real request to any of those services (sandbox network restrictions blocked the only attempt made). See `ENVIRONMENT_VARIABLES.md`.

## Deploying

- [ ] **[Verified]** The backend needs no `npm install` step — confirmed by extracting the packaged zip fresh and running `node server.js` with nothing else.
- [ ] **[Unverified/Assumption]** Follow `DEPLOYMENT_GUIDE.md` for your chosen host (Render config included and structurally reviewed, not live-deployed from here).
- [ ] **[Verified gap]** After deploying, run the step-4 smoke test in `DEPLOYMENT_GUIDE.md` (login + document upload) — confirmed this is necessary because an invalid `STORAGE_PROVIDER` value does **not** fail at startup, only on first document operation.
- [ ] **[Unverified/Assumption]** Confirm the persistent disk/volume is actually mounted at the database path on your host — I can't click through your hosting provider's UI, but I did confirm (see `DATABASE_MIGRATIONS_STATUS.md`) that a plain process restart with the data file intact preserves all data correctly.

## Data safety

- [ ] **[Verified]** Data survives a normal process restart without duplication or loss — tested directly (create record → kill process → restart → confirm record present, seed not re-run).
- [ ] **[Unverified]** Data survives a *host-level* failure (disk loss, container rebuilt from a fresh image) — this depends entirely on your hosting platform's disk/volume persistence, which is outside what this sandbox can test. Treat backups as mandatory, not optional, until you've personally confirmed your host's volume survives a redeploy.
- [ ] **[Verified]** `scripts/backup.sh` runs correctly and produces a timestamped backup of the database file and any uploaded documents — actually executed and its output inspected.
- [ ] **[Unverified/Assumption]** Schedule `scripts/backup.sh` via cron or your host's scheduled-jobs feature. I wrote and tested the script; I can't set up a cron job on infrastructure that doesn't exist yet.

## Security

- [ ] **[Verified]** Security headers (CSP, X-Frame-Options, etc.), CORS whitelist, and rate limiting are all live and were tested with real requests hitting real thresholds, not just present in code.
- [ ] **[Verified]** Role-based access control (client vs staff vs admin) was re-tested exhaustively this pass across every restricted endpoint — see prior `PRODUCTION_READINESS_REPORT.md`.
- [ ] **[Verified gap]** No rate limiting on password reset requests specifically beyond the global limit — acceptable at small scale, worth revisiting if abuse appears.
- [ ] Configure and verify `EMAIL_WEBHOOK_URL` with a real transactional email provider before launch. Password-reset and verification tokens are never returned by the API.
- [ ] Keep `SEED_DEMO_DATA` disabled in production and create real admin/staff accounts through a controlled provisioning process.

## After launch

- [ ] **[Unverified/Assumption]** Monitor `/api/health` from an uptime service.
- [ ] **[Verified]** Structured JSON logs are written to `backend/logs/app.log` at `LOG_LEVEL=info` or more verbose — confirmed the level filtering works correctly in both directions (raising and lowering verbosity).
- [ ] **[Unverified/Assumption]** Set up log rotation or shipping if you expect meaningful volume — `logs/app.log` currently grows unbounded (append-only, no rotation built in). Not tested at volume.

## Explicit go/no-go blockers

These are the items I would not personally consider a production system "ready" against, based only on what's been verified:

1. **No email service** — password reset is a real security hole without one (see above).
2. **`JWT_SECRET` unset** — silent, no warning, verified.
3. **Demo credentials still active and documented in this repo.**
4. **Cloud storage (S3/R2/Supabase) selected without having personally tested it** — the code has never completed a real request to any of these services.