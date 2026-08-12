# Security Policy

## Reporting a vulnerability

This is an internal business application for EcoStream Ltd., not a public open-source project with a bug bounty program. If you find a security issue, report it directly to the project owner rather than opening a public GitHub issue — treat any suspected vulnerability as confidential until it's fixed.

## Current security posture (verified, not aspirational)

The claims below were each individually tested against a live instance of this backend — see `documentation/PRODUCTION_READINESS_REPORT.md` and `documentation/BLOCKERS.md` for the full evidence trail. This file summarizes; those files are the source of truth.

**In place and verified:**
- Passwords hashed with `crypto.scrypt` (salted, timing-safe comparison on verify)
- JWT access tokens (HS256) + opaque, hashed, revocable refresh tokens with rotation
- Account lockout after repeated failed logins
- Role-based access control (client / staff / admin) enforced server-side on every route, not just hidden in the UI
- Ownership scoping — a client can never read another client's data via the API, confirmed by direct testing, not just code review
- Rate limiting, CORS whitelisting, standard security headers (CSP, X-Frame-Options, HSTS, etc.)
- Path traversal protection on file storage (defense in depth — the only current caller already generates safe keys, but the storage layer independently refuses to resolve a path outside its directory)
- No hardcoded secrets — `JWT_SECRET` has no fallback to a known string; the app either uses a real configured secret, refuses to start in production without one, or generates a random one for local development only

**Known gaps (not fixed, honestly documented — see `documentation/BLOCKERS.md` for full detail):**
- No email service is connected. Password reset and email verification return their token directly in the API response instead of emailing it. **This means anyone who can call the API and knows an account's email can reset that account's password.** Treat this as a hard blocker before allowing untrusted/public user signups.
- Demo accounts (`admin@ecostream.gm` / `Admin@1234` etc.) are seeded automatically and documented in plain text in this repository's own docs. Change or remove them before real use.
- S3 / Cloudflare R2 / Supabase storage providers are written but have never completed a real request against any of those services in this project's development environment — verify independently before relying on them.
- No automated dependency scanning is configured (there are currently no npm dependencies to scan — see `documentation/ARCHITECTURE.md` for why).

## Reporting format

Include: what you found, how to reproduce it, and what you'd expect to happen instead. If it involves account takeover, data exposure across users, or auth bypass, flag it as high-priority.
