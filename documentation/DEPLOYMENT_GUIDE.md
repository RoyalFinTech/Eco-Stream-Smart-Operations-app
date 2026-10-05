# EcoStream — Production Deployment Guide

This supersedes `DEPLOY_TODAY.md` as the complete reference; that file remains as a quick-start subset for the impatient. Every claim in this guide is labeled **[Verified]** (actually tested this pass or a prior pass, evidence in the linked report) or **[Unverified/Assumption]** (standard practice or vendor documentation, not something I could test from this sandbox).

## 1. What you're deploying

Three independent pieces, per `ARCHITECTURE.md`:
- `backend/` — a zero-dependency Node.js API (no `npm install` required — **[Verified]**, confirmed by extracting the packaged zip fresh and starting it with nothing but `node server.js`)
- `client-portal/index.html` — static file, no build step
- `admin-portal/index.html` — static file, no build step

## 2. Pre-deployment: environment variables

Full detail and test evidence in `ENVIRONMENT_VARIABLES.md`. The one you cannot skip:

```bash
# Generate a real secret — do not deploy with the default
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Set the output as `JWT_SECRET` in your hosting platform's environment variable settings. **[Verified]** the app runs with zero warning if you skip this, silently using a hardcoded value visible in this repository.

Recommended production values, based on verified behavior:
```
JWT_SECRET=<the random value you just generated>
LOG_LEVEL=info
RATE_LIMIT_MAX=120
ALLOWED_ORIGINS=https://portal.yourdomain.com,https://admin.yourdomain.com
STORAGE_PROVIDER=local
```
Leave `DATABASE_URL` and the S3/R2/Supabase variables unset unless you've completed the corresponding migration (see `DATABASE_MIGRATIONS_STATUS.md`) — **[Verified]** `DATABASE_URL` currently has no effect either way.

## 3. Deploy the backend (Render — recommended path)

Steps 1–5 are the same as `DEPLOY_TODAY.md`; repeated here for completeness. **[Unverified/Assumption]** — I cannot create a Render account or click through their UI from this sandbox; these steps follow Render's standard, documented Blueprint flow.

1. Push `backend/` to its own GitHub repo.
2. On [render.com](https://render.com): **New → Blueprint**, connect the repo. Render reads `render.yaml` (already in `backend/`) automatically.
3. Before clicking Apply, add the environment variables from step 2 above under the service's **Environment** tab.
4. Click **Apply**. Render builds (there's nothing to build — **[Verified]** zero dependencies) and starts the service.
5. Confirm the disk is mounted: service → **Disks** tab should show a volume mounted at the database path. Without this, Render's filesystem resets on every redeploy and you lose all data — this is described in `render.yaml`'s own comments.
6. Verify: `curl https://<your-service>.onrender.com/api/health` should return `{"status":"ok",...}`. **[Verified]** this exact endpoint and response shape locally; the deployed behavior should match since it's the same unmodified code, but the live network round-trip itself is **[Unverified]** from this sandbox.

## 4. Post-deploy smoke test — do this every time, not just once

Because of the verified gap in `ENVIRONMENT_VARIABLES.md` (invalid `STORAGE_PROVIDER` isn't caught at startup), run this after every deploy before considering it healthy:

```bash
API=https://your-deployed-url

# 1. Health check
curl -s $API/api/health

# 2. Login works (proves JWT_SECRET and the datastore are functioning)
curl -s -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"<your-admin-email>","password":"<your-admin-password>"}'
# — change/remove this demo account per the checklist before real users arrive

# 3. Document upload actually reaches your configured storage provider
#    (catches a bad STORAGE_PROVIDER value immediately instead of days later)
TOKEN=$(curl -s -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"<your-admin-email>","password":"<your-admin-password>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST $API/api/documents -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"fileName":"smoketest.txt","mimeType":"text/plain","base64Data":"c21va2UgdGVzdA=="}'
# expect a 201 with a document id — a 500 here means STORAGE_PROVIDER is misconfigured
```

## 5. Deploy the two frontends

Both are static files — host them anywhere that serves static HTML: the same Render account as a Static Site, Netlify, GitHub Pages, or your own nginx (see `nginx.conf`, included).

1. Upload/point your static host at `admin-portal/index.html` and `client-portal/index.html` respectively.
2. Open each in a browser once deployed, go to **Settings → API Server** (client) or **Settings** (admin), and set it to your real backend URL from step 3.
3. This preference is stored in that browser's local storage — repeat per device/browser the first time someone uses it, or bake the URL in by editing the `apiBase` default in the HTML before deploying if you'd rather not rely on manual configuration. (Editing that default is a one-line config change, not a new feature — consistent with "no new features" for this pass, this guide doesn't do it for you.)

## 6. HTTPS / domain

**[Unverified/Assumption]** — standard, well-documented steps, not executable from this sandbox:
1. Buy a domain from any registrar.
2. Point `api.yourdomain.com` at your Render service (or your nginx box) via the CNAME Render/your host provides.
3. If self-hosting behind nginx: `sudo certbot --nginx -d api.yourdomain.com -d admin.yourdomain.com -d portal.yourdomain.com` — Certbot rewrites `nginx.conf` for you and sets up auto-renewal. Render/Netlify/GitHub Pages issue HTTPS certificates automatically without this step.

## 7. What "done" looks like

- [ ] `/api/health` returns 200 from the public URL
- [ ] The step-4 smoke test passes (login + document upload)
- [ ] Both portals load and can reach the backend (check the browser console for CORS errors — if you set `ALLOWED_ORIGINS`, confirm it includes the exact origin your portals are served from)
- [ ] `JWT_SECRET` is a real random value, confirmed by checking the platform's environment variable settings (not just that you meant to set it)
- [ ] Demo accounts are removed or their passwords changed (see `PRODUCTION_DEPLOYMENT_CHECKLIST.md`)

See `PRODUCTION_DEPLOYMENT_CHECKLIST.md` for the full pre-launch checklist and `ROLLBACK_PLAN.md` for what to do if something goes wrong after this.