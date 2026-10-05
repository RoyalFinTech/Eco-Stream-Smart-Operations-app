# EcoStream — Deployment Checklist

> **Superseded by `PRODUCTION_DEPLOYMENT_CHECKLIST.md`**, which tags every item as verified-by-actual-testing, verified-gap, or assumption, based on a live audit against the running backend. This file is kept for its original recommendations but doesn't distinguish what was tested from what wasn't — use the newer one as the authoritative checklist.

Work through this before putting the system in front of real customers.

## Backend

- [ ] Set a strong, random `JWT_SECRET` environment variable (do not use the hardcoded dev fallback in `lib/auth.js`)
- [ ] Lock down CORS in `lib/router.js` to your actual frontend origin(s) instead of `*`
- [ ] Decide on a real database if you expect concurrent write load or multiple server instances; swap `lib/db.js` (route code is unaffected — see `ARCHITECTURE.md`)
- [ ] Wire up a real email provider (SendGrid, SES, Postmark, etc.) for password reset instead of returning reset tokens in the API response — remove that field once email is live
- [ ] Move file uploads from base64-in-JSON to real object storage (S3-compatible) if you expect meaningful document volume
- [ ] Add rate limiting on `/api/auth/login` and `/api/auth/register` to blunt brute-force/spam
- [ ] Run the server behind HTTPS (a reverse proxy like Caddy/nginx with a TLS cert, or your host's built-in HTTPS)
- [ ] Set `PORT` via environment variable if 4000 conflicts with anything in your hosting environment
- [ ] Decide on a process manager (pm2, systemd, or your host's equivalent) so the server restarts automatically on crash/reboot
- [ ] Back up `data/store.json` on a schedule until/unless you migrate to a managed database with its own backups

## Frontends

- [ ] Update the default `apiBase` in both HTML files (or just leave the in-app Settings screen for whoever deploys them) to point at your real backend URL
- [ ] Host both HTML files on any static host — S3 + CloudFront, GitHub Pages, Netlify, or a plain nginx directory all work since there's no build step
- [ ] Confirm Google Fonts loads from your deployment environment (it's fetched from fonts.googleapis.com — blocked only in network-restricted sandboxes, not in normal production hosting)

## Data & accounts

- [ ] Change or remove the seeded demo accounts (<your-admin-email> / <your-admin-password> etc.) before going live — anyone who reads this README knows those credentials
- [ ] Decide your client-approval policy: right now new registrations are status "active" immediately; if you want manual approval first, default new signups to "pending" in routes/auth.js and have staff approve via the Clients page

## Security & compliance

- [ ] Review QA_AUDIT_REPORT.md — action the "Known gaps" section for anything relevant to your regulatory environment
- [ ] If you handle payment card data directly (this system currently just records payment amounts/methods, it doesn't process cards), that's a PCI-DSS conversation — don't bolt on real card processing without going through a compliant processor (Stripe, Paystack, etc.)
- [ ] Run an automated accessibility audit (axe-core or similar) if accessibility compliance is a requirement in your jurisdiction

## Monitoring

- [ ] Add basic uptime monitoring against /api/health
- [ ] Decide where server logs go in production (currently just console.log/console.error — fine for pm2 logs or journalctl, but pipe to a real log aggregator if you need history/search)