# Supabase Auth Request Context — 2026-10-05

## Decision

The v1.3 backend now supports a controlled `AUTH_PROVIDER=supabase` authentication path without changing the default runtime.

`AUTH_PROVIDER=json` remains the default until the complete route/data migration is validated.

## Request flow

1. Client sends `Authorization: Bearer <Supabase access token>`.
2. Central `authenticate` middleware calls Supabase Auth `/auth/v1/user` to validate the token.
3. Middleware loads `public.profiles` using the same end-user token through the request-scoped PostgREST adapter.
4. Existing route code receives a compatible `req.user` containing the canonical Supabase UUID, application role, name, email, status, and access token.
5. Existing Supabase RLS remains responsible for database authorization.

## Security properties

- No password hashes are stored or verified by the Supabase authentication path.
- No service-role key is used for normal request authentication or data access.
- A valid Auth identity without a `public.profiles` row is rejected as unprovisioned.
- Suspended profiles are rejected centrally.
- Existing `requireRole()` checks continue to enforce application role gates.
- The legacy JSON authentication path remains available during migration.

## Runtime safety

The server validates `AUTH_PROVIDER` at startup. Supported values are `json` and `supabase`.

When `AUTH_PROVIDER=supabase`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` are mandatory.

This change does **not** switch `DB_DRIVER` to Supabase/PostgREST globally. Route persistence still requires the separate data-driver integration and field-level route migration.

## Verification

Node syntax checks passed for the modified authentication and server modules on 2026-10-05.

The Supabase authentication provider remains opt-in and has not been enabled in production by this change.
