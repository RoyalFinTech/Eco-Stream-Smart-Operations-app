# Engineering Change Log — 2026-10-05

## Supabase production route integration
1. Added request-scoped Supabase PostgREST repository.
2. Added production schema field translation boundary.
3. Added Supabase Auth HTTP adapter.
4. Added provider-aware authentication middleware.
5. Added provider validation and disabled demo seeding when `AUTH_PROVIDER=supabase`.
6. Migrated projects, bookings, payments and invoices to request-scoped Supabase persistence.
7. Added Supabase Auth register/login/refresh/logout/recovery/profile flows.
8. Preserved the legacy JSON provider for local compatibility.
9. Hardened `handle_new_user()` so application role defaults to `client` rather than trusting user-editable metadata.
10. Verified JavaScript syntax and adapter mapping locally; verified the live Auth trigger and execute privileges through Supabase SQL.
11. Migrated notifications to request-scoped Supabase persistence so RLS controls recipients and staff/admin access.
12. Migrated tickets to request-scoped Supabase persistence and removed count-based ticket numbering that could collide under row-level visibility.
13. Migrated documents to request-scoped Supabase persistence and aligned metadata with production `storage_path`/UUID fields; storage bytes remain handled by the configured storage provider.
14. Verified production `document_category` and `ticket_status` enum values against the live PostgreSQL schema.

## Source-of-truth rule
These changes belong to the current v1.3 engineering line. Do not mix them with v1.2 archives or the rejected archive containing accidental `.git` metadata.

15. Replaced legacy embedded frontend logo payloads with the supplied official EcoStream branding path in client/admin authentication and authenticated shells; added portal favicon and mobile top-bar branding.
16. Added canonical EcoStream logo assets to both standalone portal folders and kept the asset self-contained per portal.
17. Migrated chat, equipment/expenses, dashboard, reports, clients, staff, CMS, audit-log, and session routes onto the request-scoped Supabase data boundary while retaining JSON-provider compatibility.
18. Added privileged Supabase Auth admin provisioning/deletion for staff/client management and documented SUPABASE_SERVICE_ROLE_KEY as required only for those server-side administrative operations.
19. Added Supabase Auth logout/session handling and public CMS read support without bypassing RLS for normal authenticated data access.
20. Frontend QA passed: no legacy embedded logo payloads remain, referenced branding assets resolve, both portal script blocks pass Node syntax validation, all backend JavaScript files pass node --check, and the JSON-provider smoke test passes.

21. Deployment architecture decision: Render is the target application host, with Supabase remaining the production identity/database/storage platform. No Render PostgreSQL database will be created.
22. Added root-level Render Blueprint with a single Node web service rooted at backend/. The service auto-deploys from main, exposes /api/health, and keeps Supabase secrets as Render-managed sync:false environment variables.
23. Unified production serving: backend/server.js now serves the client portal at / and /portal/ and the admin portal at /admin/, while /api/* remains the API surface. This removes unnecessary frontend-to-API cross-origin configuration for the default deployment.
24. Production storage hardening: STORAGE_PROVIDER=supabase is now part of the Render deployment contract, using the verified private Supabase Storage bucket named documents.
25. Frontend deployment hardening: client/admin API-base selection now uses the browser origin when served over HTTP(S), while retaining localhost behavior for local development. Stale localhost API settings are ignored when the portal is hosted remotely.
26. Deprecated the old backend/render.yaml manifest in favor of the root render.yaml so the monorepo deploys as one coherent application.
27. Recorded the Render rollout runbook, required owner-provided production inputs, secret-handling rules, and Free-plan acceptance versus paid-plan live-operation guidance.
28. QA direction: no production deployment should be declared certified until Render /api/health, client login/registration, admin login, Supabase Auth provisioning, RLS-protected CRUD, private document upload/download, tickets, chat, payments, and responsive portal flows are exercised against the live service.

29. Repository-state correction: verified that the earlier binary-tree logo object was not attached to the current main branch after subsequent Contents API commits. No branch history was force-overwritten.
30. Added the verified official EcoStream logo as a self-contained SVG asset containing the original PNG artwork, committed independently under both client-portal/assets/ecostream-logo.svg and admin-portal/assets/ecostream-logo.svg.
31. Updated both portals to reference the canonical SVG logo asset. Verified both assets exist on the current main branch and have identical content SHA.
32. Deployment QA remains gated on live Render testing; source-side deployment configuration and security checks are complete, but no live Render service exists yet.

33. Render production service created under Royal's workspace as `ecostream`, connected to `RoyalFinTech/Eco-Stream-Smart-Operations-app` on `main`, with Supabase production configuration and automatic deploys enabled.
34. First Render build exposed a corrupted `backend/lib/supabaseSchemaMap.js` whose contents had been replaced by a tool error string. Restored the complete production schema mapping module and committed the repair as `34c18fd05041bc6484156a0da238361d62b81e74`.
35. Verified Render build success and live process startup on commit `34c18fd05041bc6484156a0da238361d62b81e74`. Render reports the service live at `https://ecostream-m2sy.onrender.com`; runtime logs confirm the application is listening on Render's assigned port and exposes /portal/, /admin/, and /api/health.
36. Verified the follow-up deployment with tightened `ALLOWED_ORIGINS=https://ecostream-m2sy.onrender.com` reached LIVE and replaced the prior instance cleanly. Render service remains auto-deploying from `main`.
37. Supabase production verification checkpoint: security advisor returns zero findings; all 11 public application tables have RLS enabled; expected client/staff/admin policies are present; performance advisor reports only unused-index INFO notices because all application tables currently contain zero rows.
38. Render service metadata verified: service `ecostream` is active, unsuspended, on the Free plan in Frankfurt, with one instance, automatic deployment enabled, and primary URL `https://ecostream-m2sy.onrender.com`.
39. Full production certification remains gated on authenticated end-to-end request tests and private Storage/Auth-admin operations. External HTTP probing from the current engineering tool environment is unavailable, so no unsupported HTTP success claim is recorded.

40. Production runtime verification checkpoint: Render service metadata remains active/unsuspended, auto-deploys from `main`, and the latest deployment for commit `dfbd47730c25062752f687674e973596aed303e1` is LIVE. Render telemetry currently reports no HTTP request samples, so external endpoint success is not asserted.

41. Private document-storage verification checkpoint: Supabase contains the `documents` Storage bucket, configured as private. Storage policies exist for owner upload/read and staff/admin read/delete. The application storage provider intentionally uses the server-side Supabase service-role credential and never exposes it to portal code.

42. Deployment configuration gap recorded: the repository root `render.yaml` declares `healthCheckPath: /api/health`, but the currently provisioned Render service metadata reports an empty health-check path. This must be reconciled through Render service configuration/Blueprint management before final production certification; no destructive service recreation is being performed while the live service is healthy.

