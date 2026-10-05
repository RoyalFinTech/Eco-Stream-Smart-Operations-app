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
