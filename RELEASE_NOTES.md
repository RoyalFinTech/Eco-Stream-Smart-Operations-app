# Release Notes

## Current build: Production Hardening Release

This release focused on closing real security gaps found by testing, not adding features. Full detail in `CHANGELOG.md`; this page is the short version for anyone deciding whether to deploy this build.

### What changed and why it matters

- **The JWT signing secret can no longer silently default to a known string.** Previously, if `JWT_SECRET` wasn't set, the app would run fine using a hardcoded value visible in this repository — meaning anyone who read the code could forge valid login tokens against a deployment that forgot to configure it. Now: production deployments (with `NODE_ENV=production` set) refuse to start without a real secret, and local development gets a random one generated per run instead.
- **`docker-compose.yml` and `render.yaml` had related gaps, independently fixed.** Compose's own hardcoded default (`change-me-in-production`) has been removed; Render's config now sets `NODE_ENV=production` explicitly so the new protection actually applies there by default.
- **File storage now independently defends against path traversal**, rather than relying entirely on every current and future caller generating safe file keys.
- **Dead code was removed**, not just left alongside working code: one unused import, confirmed via static analysis.

### What you need to do before deploying this build

1. Set a real `JWT_SECRET` — see `documentation/ENVIRONMENT_VARIABLES.md`. The app will tell you clearly if you forget, in production.
2. Read `documentation/BLOCKERS.md`. The top item — no email service, meaning password reset has no real delivery mechanism — has not changed in this release and remains the primary reason not to open this system to untrusted public signups yet.
3. Change or remove the seeded demo accounts before real users arrive.

### What was verified for this release

Every change above was tested against a live running server, not just reviewed by reading the code:
- All three `JWT_SECRET` code paths (production-missing → fails; dev-missing → warns and works; explicitly set → silent) were individually exercised.
- The path traversal fix was tested with both a legitimate file operation (still works) and a real traversal attempt (`../../../../etc/passwd`, correctly blocked).
- Both edited YAML configs (`docker-compose.yml`, `render.yaml`) were re-parsed to confirm they're still syntactically valid.

### What was not changed

No business logic, no API contracts, no UI behavior. This release is hardening and cleanup only, per an explicit "do not add features, do not break anything" directive for this pass.

### A note on this release's process

Partway through this audit, the sandboxed environment this work was done in was reset, and the in-progress working copy of the repository was lost. Rather than silently continuing (which risked losing track of what had actually been re-verified versus assumed), the last known-good packaged release was recovered and every fix in this document was re-applied and re-tested from that verified checkpoint. Mentioned here in the interest of the same transparency this whole audit was conducted under.
