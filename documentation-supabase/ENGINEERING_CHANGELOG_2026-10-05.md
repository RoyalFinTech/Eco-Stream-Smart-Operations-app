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

43. Latest deployment verification: commit `098dc118d67f65020caffbf2e1e62d4d43db24ff` triggered a Render build/deploy automatically from `main`; Render event history reports both build and deploy succeeded. No Render service update operation is exposed by the current engineering connector for changing `healthCheckPath`, so the live service was not recreated or otherwise disrupted to force that setting.
44. Document upload consistency hardening: `backend/routes/documents.js` now removes the newly written private-storage object when the subsequent Supabase metadata insert fails. This prevents the common RLS/database failure path from leaving an orphaned document object. The cleanup remains server-side and uses the configured storage provider; the service-role credential is never exposed to the client. The unavoidable crash window between a successful storage write and process termination before the metadata insert remains a transactional limitation of the two-system design and is not falsely certified as eliminated.

45. Latest production deployment verification: Render auto-deployed current `main` commit `65374cb005fea57a434bd452d5d658bc2fe966ea`; deployment `dep-db20khohjjls73f68eug` is LIVE. Service metadata remains active, unsuspended, one instance, auto-deploy enabled, Frankfurt region. The provisioned service still reports an empty `healthCheckPath` despite the canonical root `render.yaml` declaring `/api/health`; this remains an infrastructure-configuration gate and is not being bypassed or falsely marked resolved. External HTTP smoke testing remains unavailable from the current engineering environment.

46. Supabase production structure verification: direct read-only SQL confirmed all 12 application tables exist with RLS enabled, the `documents` Storage bucket exists and is private, and the three expected document Storage object policies exist (owner upload, owner/staff-admin read, staff-admin delete). Auth/profile wiring was also confirmed: the `on_auth_user_created` trigger exists on `auth.users`, `public.handle_new_user()` exists, and both private RLS helper functions exist. This is a metadata/schema checkpoint only; authenticated live HTTP CRUD, Storage upload/download, and privileged Auth-admin operations remain untested from the current engineering environment.


47. Phone/PIN/passkey authentication migration: production-facing client and staff/admin authentication now uses Gambian phone identities with six-digit PINs; email was removed from user-facing flows. Added restricted staff/admin footer access, Royal Fintech footer branding, passkey enrollment/sign-in integration, phone identity synchronization, and a documented Supabase Auth configuration gate. Existing Auth users were not directly mutated through SQL; safe migration remains an authorized Auth Admin operation.


## 47. Phone + PIN authentication and protected staff entry — 2026-10-05
- Reworked Supabase Auth application flows toward Gambian phone-number identity with a 6-digit PIN as the user credential.
- Client registration/login UI now uses name + Gambian phone (+220) + 6-digit PIN; email fields were removed from the client portal.
- Admin/staff portal now uses Gambian phone (+220) + 6-digit staff PIN, with restricted-access/shield messaging.
- Client landing/auth footer includes the protected staff/admin portal route and retains the business phone number; footer branding uses “Powered by Royal Fintech”.
- Added Supabase phone signup/login/verification adapter support and aligned staff/client provisioning to Supabase Auth phone identities.
- Added safe public passkey configuration endpoint and retained native WebAuthn/passkey UI as the returning-user biometric/device-auth option.
- Normalized Gambian phone numbers at the Supabase Auth boundary.
- Important deployment prerequisite: Supabase Phone provider/SMS and Passkeys/WebAuthn must be enabled/configured in the Supabase Auth dashboard; those provider settings are not exposed through the connected engineering API.
- Existing production user rows were not rewritten automatically because changing live authentication identifiers/credentials requires a controlled migration; no destructive user migration was performed.

## 48. Authentication/biometric QA checkpoint — 2026-10-05
- Audited the live main-branch client and admin authentication source after the protected administrator credential change.
- Confirmed customer registration/login uses Gambian phone identity plus a six-digit PIN, with SMS phone verification handled by the Supabase Auth boundary.
- Confirmed the customer verification screen calls /api/auth/verify-phone after registration when Supabase requires confirmation; the server does not fabricate or bypass the verification step.
- Confirmed both portals use Supabase's current experimental passkey client opt-in and call signInWithPasskey/registerPasskey; the browser dynamically loads supabase-js 2.117.2, which satisfies the current documented passkey minimum of 2.105.0.
- Confirmed passkey registration is only exposed after authentication and passkey sign-in obtains a Supabase Auth session before the application profile request, preserving the existing RLS/session boundary.
- Confirmed the administrator login is isolated to the server-side ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD environment contract and provisions/verifies an admin profile before returning a session; no administrator password is stored in the repository.
- Current external prerequisite remains: Supabase Auth Phone/SMS and Passkeys/WebAuthn must be enabled and configured for the production project, including the stable WebAuthn relying-party ID/origin. The connected engineering interface does not expose those provider settings, so this is recorded as a deployment prerequisite rather than falsely certified.
- Reference checked against current Supabase passkey documentation: passkey support is experimental, requires explicit client opt-in, requires an existing confirmed user for registration, and uses discoverable credentials for sign-in.


## 49. SMS-independent customer authentication + in-app support chat
- Customer self-registration no longer depends on Supabase Phone/SMS being enabled.
- The customer-facing identifier remains the Gambian phone number plus six-digit PIN.
- Server-side Supabase Auth uses a confirmed internal email identity mapped deterministically from the normalized phone number; the internal identity is never shown as the customer's email and no SMS is sent.
- Customer registration provisions the production `public.profiles` record and signs the customer in immediately.
- Customer login resolves the phone number to the corresponding Supabase Auth identity and authenticates with the PIN.
- The phone verification endpoint remains only as a compatibility response and explicitly reports that SMS verification is disabled; it does not call the SMS provider.
- Existing passkey/biometric capability remains available after normal sign-in; it does not depend on SMS.
- In-app client↔company chat is retained as the immediate communication channel. The client portal already exposes Chat with Company, while the admin portal exposes client conversation lists and reply threads.
- Supabase Phone/SMS can be enabled later as an optional verification layer without changing the customer-facing phone + PIN account model.
- Certified source changes: `backend/lib/supabaseAuth.js`, `backend/routes/auth.js`, `client-portal/index.html`.


## 50. Chat read-receipt RLS hardening — 2026-10-05
- Verified the production `chat_messages` SELECT/INSERT policies against the SMS-independent client/admin chat route.
- Found that the client route intentionally marks unread company messages as read, but production had no UPDATE policy for `chat_messages`.
- Added a narrowly scoped UPDATE policy: clients may update only company messages belonging to their own `auth.uid()` thread; staff/admin may update chat rows as operationally required.
- No change to message visibility: clients remain restricted to their own thread and staff/admin retain cross-client access.
- Migration: `allow_chat_read_receipts`.


## 51. Admin-managed accounts also SMS-independent — 2026-10-05
- Removed the remaining Supabase Phone Auth creation path from admin-created clients and staff.
- Admin-created accounts now use the same deterministic internal Auth email identity mapped from the normalized phone number, with the six-digit PIN remaining the user-facing credential.
- Phone changes update Auth user metadata rather than invoking phone confirmation or SMS delivery.
- Centralized the internal identity mapping in `backend/lib/supabaseAuth.js` as `internalAuthEmail()` to keep customer/admin provisioning consistent.
- Result: SMS/Phone Auth provider is not required for normal customer, client-management, or staff-management account creation.


## 52. Auth identity helper and SMS-independent phone-update correction — 2026-10-05
- Verified `backend/lib/supabaseAuth.js` on `main` and confirmed `internalAuthEmail()` contains valid JavaScript with no accidental literal newline corruption.
- Removed the duplicate internal identity helper from `backend/routes/auth.js` so customer registration uses the centralized `supabaseAuth.internalAuthEmail()` implementation.
- Corrected authenticated customer phone updates to modify Supabase Auth user metadata only; they no longer invoke Supabase Phone Auth confirmation/SMS behavior.
- Preserved the deterministic internal Auth email identity so existing phone/PIN accounts remain addressable without SMS.

## 53. Authentication hardening: login throttling and atomic Auth metadata updates — 2026-10-05
- Added a dedicated in-memory limit of 10 customer login attempts per minute and 5 administrator login attempts per minute, in addition to the existing global API limit.
- Kept the production implementation SMS-independent: no SMS, OTP, or Supabase Phone Auth flow was added.
- Corrected profile updates so name and phone Auth metadata are merged once from the current metadata snapshot, preventing a simultaneous name + phone update from overwriting either field.
\n