# Supabase Core Route Migration — 2026-10-05

## Scope
This change moves the first application route group to the production Supabase architecture without replacing the existing RLS schema.

### Migrated routes
- `/api/auth/*` — Supabase Auth provider path
- `/api/projects/*`
- `/api/bookings/*`
- `/api/payments/*`
- `/api/invoices`

## Architecture
- Supabase Auth owns passwords, sessions, refresh tokens, verification and recovery.
- `auth.users.id` is the canonical identity.
- `public.profiles` supplies role, status and application profile data.
- Authenticated request access tokens are passed to PostgREST through the `Authorization: Bearer` header.
- No service-role key is used for normal application data access.
- `backend/lib/requestDb.js` creates a request-scoped repository so an access token can never become global mutable database state.
- `backend/lib/supabaseSchemaMap.js` translates route-facing camelCase fields to the production snake_case schema.
- Production UUID primary keys remain database-generated; legacy `p_*`, `b_*`, and `pay_*` IDs are not inserted.

## RLS alignment
The production policies remain authoritative. Client reads are constrained by `auth.uid()` and staff/admin access is controlled by the existing private helper functions. The migrated routes therefore do not fetch all rows and perform client-side authorization filtering in Supabase mode.

## Auth trigger hardening
`public.handle_new_user()` was adjusted so a newly created Supabase Auth user is always created as the `client` application role. User-editable metadata is no longer trusted to select an elevated application role.

The live database was verified after the change:
- `handle_new_user()` remains `SECURITY DEFINER` because it creates the profile row during Auth signup.
- `anon` cannot execute the function.
- `authenticated` cannot execute the function.
- The Auth trigger remains attached to `auth.users`.

## Compatibility
`AUTH_PROVIDER=json` remains available for the legacy local/demo path. `AUTH_PROVIDER=supabase` activates the new production path.

## Verification performed
- Node syntax checks passed for all changed JavaScript files.
- Supabase repository field translation test passed.
- Live Supabase schema and RLS policies were inspected before route migration.
- Live Auth trigger and function execute privileges were rechecked after the trigger update.

## Not yet claimed
The full engineered source has **not** been pushed to GitHub from this environment. GitHub history therefore must not be described as containing these source changes until the source synchronization is actually performed and verified.