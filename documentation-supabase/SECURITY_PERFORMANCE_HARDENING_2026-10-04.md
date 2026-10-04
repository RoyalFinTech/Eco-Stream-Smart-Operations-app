# Supabase Security & Performance Hardening — 2026-10-04

## Scope

This record documents verified hardening applied to the existing Eco Stream Borehole Drilling Supabase project. The existing production schema and RLS model were preserved; no standalone Prisma schema was deployed.

## Security hardening

1. Revoked API execution privileges for trigger/event-trigger functions:
   - `public.handle_new_user()`
   - `public.prevent_client_status_change()`
   - `public.rls_auto_enable()`

2. Moved RLS authorization helper functions out of the exposed `public` schema:
   - `public.is_admin()` -> `private.is_admin()`
   - `public.is_staff_or_admin()` -> `private.is_staff_or_admin()`

3. Updated existing RLS policies to reference the private helper functions.

4. Granted the private helper functions to `authenticated` only. Anonymous API execution is not permitted.

5. Consolidated profile-update authorization into one policy:
   - `profiles: admin or owner can update`
   - Uses both `USING` and `WITH CHECK` so owners cannot reassign their profile identity.

## Performance hardening

Added covering indexes for foreign keys identified by the advisor:
- `documents(uploaded_by)`
- `payments(project_id)`
- `projects(assigned_engineer_id)`

Updated RLS expressions to use init-plan-safe forms such as `(select auth.uid())` and `(select private.is_staff_or_admin())`.

## Verification

- Supabase security advisor: **0 findings**
- RLS init-plan warnings: cleared
- Multiple permissive profile-update policy warning: cleared
- Remaining performance notices are **INFO**-level unused-index notices because the application database currently has zero rows/traffic. The indexes are intentionally retained for expected production query patterns.

## Migration records applied

- `harden_trigger_function_execute_privileges`
- `isolate_rls_security_definer_helpers`
- `optimize_rls_policies_and_foreign_keys`
- `complete_rls_initplan_optimization_retry`
- `consolidate_profile_update_policy`

## Source-of-truth rule

These database changes are part of the live Supabase production integration. The application source still must be synchronized from the verified v1.3 workspace into GitHub before application-code changes are layered on top. No production secrets were added to the repository.
