# EcoStream Smart Operations — Render deployment

## Production topology

One Render Web Service runs the EcoStream API and serves both static portals from the same origin:

- Client portal: `/portal/`
- Admin portal: `/admin/`
- API: `/api/*`
- Health: `/api/health`

Production data and identity remain in Supabase:

- Supabase Auth for identity/session/password operations.
- `public.profiles` for application roles/profile data.
- Supabase PostgreSQL + RLS for application data.
- Private `documents` Supabase Storage bucket for uploaded files.

This deployment intentionally does **not** create a Render PostgreSQL database and does **not** use the legacy JSON datastore in production.

## Render service

The root `render.yaml` is the canonical Blueprint.

- Runtime: Node
- Root directory: `backend`
- Build: `npm install --omit=dev`
- Start: `node server.js`
- Health check: `/api/health`
- Branch: `main`
- Auto-deploy: enabled

## Required Render environment variables

Set these in the Render Dashboard. Never commit their values to GitHub:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `AUTH_PROVIDER` | `supabase` |
| `STORAGE_PROVIDER` | `supabase` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret |
| `SUPABASE_BUCKET` | `documents` |
| `ALLOWED_ORIGINS` | Render service URL, plus custom portal/admin domains when added |
| `LOG_LEVEL` | `info` |
| `RATE_LIMIT_MAX` | `120` |

The service-role key is server-only. It is required for privileged Auth administration and private document storage. It must never be placed in the browser code.

## First deployment

1. Create a Render account and connect the GitHub repository.
2. Create a Blueprint from the repository root.
3. Render reads `render.yaml`.
4. Enter the three Supabase secrets and the allowed-origin value when prompted.
5. Deploy.
6. Verify:
   - `/api/health`
   - `/portal/`
   - `/admin/`
7. Register a client and test login.
8. Test admin provisioning, project flow, documents, tickets, chat and payments.

Render automatically redeploys linked services when new commits land on the configured branch.


## What the project owner needs to provide

Do not send secret keys through chat or commit them to GitHub. The values below should be entered directly into Render's Environment Variables:

1. **SUPABASE_URL** — the Eco Stream Borehole Drilling project URL.
2. **SUPABASE_ANON_KEY** — Supabase project's public anon key.
3. **SUPABASE_SERVICE_ROLE_KEY** — Supabase project's server-only service-role secret. This must stay in Render and must never be exposed to the browser.
4. **ALLOWED_ORIGINS** — initially the Render service URL; when custom domains are added, include those origins as a comma-separated list.

No Render PostgreSQL database is required. Supabase PostgreSQL is already the production database.

## Recommended rollout

**Phase 1 — acceptance:** deploy the unified service on Render's Free plan, complete end-to-end testing, and confirm the public client/admin flows.

**Phase 2 — live operations:** move the Render service to a paid plan before relying on it for continuous business operations. Render documents that Free web services can spin down after 15 minutes of inactivity, which is undesirable for a customer-facing operational system. The application architecture itself does not need to change when the plan changes.

## Security rules

- Never put SUPABASE_SERVICE_ROLE_KEY in client HTML/JavaScript.
- Never put Supabase secrets in render.yaml values.
- Do not create a second production database in Render.
- Do not run the standalone Prisma migration against the existing Supabase production schema.
- Keep Supabase RLS enabled.
