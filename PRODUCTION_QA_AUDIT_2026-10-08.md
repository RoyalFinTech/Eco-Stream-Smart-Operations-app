# EcoStream Production QA Audit — 2026-10-08

## Scope
Production QA pass covering the Render deployment, authentication architecture, public/client/admin auth flows, Supabase security posture, RLS, deployment events, and recently reported client-registration failure.

## Deployment verification
- Repository: `RoyalFinTech/Eco-Stream-Smart-Operations-app`
- Branch: `main`
- Render service: `ecostream`
- Production URL: `https://ecostream-m2sy.onrender.com`
- Latest verified deployment: `87eebbe050bc1d3e6c52bb403c920fb622d35826`
- Deployment status: **LIVE**
- Build status: **SUCCEEDED**
- Render service auto-deploy: enabled
- Render region: Frankfurt
- Runtime: Node

## Critical defect found and fixed
### Client registration provisioning used the obsolete privileged-key variable
The registration flow correctly moved Supabase Auth administration to the current server Secret-key architecture, but `backend/routes/auth.js` still used only `SUPABASE_SERVICE_ROLE_KEY` when inserting the newly created client's `profiles` row.

This could produce the exact production failure previously observed: **Invalid API key** during account creation.

### Fix
Changed profile provisioning to prefer:
1. `SUPABASE_SECRET_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY` as backward-compatible fallback

Commit:
`98ea354f8abe981a43db01b8deb7a6020a547c22`

Deployment verified live before the next frontend hardening commit.

## Admin authentication hardening
The admin portal public authentication requests now avoid attaching a stale administrator access token to:
- `/api/auth/login`
- `/api/auth/admin-login`
- `/api/auth/refresh`

Commit:
`87eebbe050bc1d3e6c52bb403c920fb622d35826`

This is defense-in-depth and prevents an old local session from contaminating a fresh authentication request.

## Current authentication architecture
- Customer-facing identifier: Gambian phone number + 6-digit PIN
- No SMS verification dependency
- Supabase Auth remains the identity/session provider
- Customer internal Auth identity uses deterministic email mapping
- Supabase publishable key is used for public Auth/PostgREST operations
- Supabase Secret key is used only server-side for privileged administration
- Access/refresh tokens are revoked through the logout endpoint before local credentials are cleared

## Supabase security verification
All 12 application tables were re-checked in production and have RLS enabled:
- profiles
- projects
- bookings
- payments
- notifications
- tickets
- documents
- chat_messages
- equipment
- expenses
- cms
- audit_logs

The production `prevent_profile_privilege_escalation` trigger is enabled on `public.profiles`.

## Supabase Advisor findings
### Security
One warning remains:
- **Leaked Password Protection Disabled**

This is an Auth configuration setting and should be enabled in the Supabase Auth dashboard. It is not safely changed through the application's normal SQL schema workflow.

### Performance
The advisor reports 14 currently unused indexes. These are informational findings only. They should **not** be dropped during this QA pass because the application is still evolving and several indexes are intentionally aligned with expected query patterns.

## Render operational finding
The Render service currently reports an empty service-level health-check path even though the repository's `render.yaml` declares `/api/health`.

This does not prevent the service from starting, and the latest deployment reached **LIVE**, but the Render service should be configured to use:
`/api/health`

This is an operational hardening item because it allows Render to detect an unhealthy application process automatically.

## Production verification limitation
The current tool environment cannot directly fetch the public Render URL from the external network, so browser-level HTTP verification against the public hostname was not claimed as passed. Render itself confirmed the latest deployment as LIVE and emitted the primary service URL.

A real-device/browser pass is still recommended for:
- client registration
- client login/logout
- admin login/logout
- passkey registration/login
- GPS booking flow
- file upload/download
- mobile responsive layout

## QA disposition
**Status: CONDITIONAL PASS**

The previously identified production registration blocker was traced to a real backend key-variable mismatch and fixed in source and deployed.

Remaining release-hardening items:
1. Enable Supabase Leaked Password Protection.
2. Configure Render health check to `/api/health`.
3. Perform final real-browser/mobile click-through against the live hostname.
