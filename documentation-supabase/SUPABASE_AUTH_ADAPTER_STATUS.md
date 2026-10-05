# Supabase Auth Adapter Status

Date: 2026-10-04

A dependency-light Supabase Auth adapter has been engineered in the verified v1.3 workspace at:

`backend/lib/supabaseAuth.js`

It supports:
- email/password signup;
- password login;
- access-token refresh;
- current-user lookup;
- authenticated user attribute updates;
- password-reset email requests.

The adapter uses the Supabase Auth HTTP API and does not store passwords, reset tokens, verification tokens, or refresh sessions in the application database.

## Feature flag

The adapter is intentionally disabled by default:

`AUTH_PROVIDER=json`

Supabase configuration is documented in `backend/.env.example`.

## Why it is not enabled yet

The existing v1.3 repository layer still targets the standalone Prisma `User` model. Enabling Supabase Auth before migrating the data repository would produce two identity systems.

The correct next step is:

1. migrate repository access to the existing Supabase tables;
2. map `auth.users.id` to `profiles.id`;
3. update authentication middleware to validate Supabase access tokens and load the corresponding profile;
4. test all client/staff/admin routes against RLS;
5. enable `AUTH_PROVIDER=supabase` only after those tests pass.

No production secret is stored in the repository.
