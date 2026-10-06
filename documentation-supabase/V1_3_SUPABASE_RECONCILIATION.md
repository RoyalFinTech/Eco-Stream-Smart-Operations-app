# v1.3 Application ↔ Supabase Reconciliation

Date: 2026-10-06

## Finding

The engineered v1.3 source contains a Prisma/PostgreSQL repository layer, but its Prisma schema is **not equivalent to the live Supabase production schema**.

The live architecture is:

- Supabase Auth `auth.users` for identity/password/session management
- `public.profiles` for application user profile/role data
- Existing RLS policies as the production authorization boundary
- Existing public application tables for projects, bookings, payments, tickets, documents, chat, notifications, equipment, expenses, CMS, and audit logs

The v1.3 Prisma schema instead models a private `User` table containing password hashes, verification/reset tokens, login counters, and session relations.

## Do not do this

Do **not**:
- run the standalone v1.3 Prisma migrations against the production Supabase database;
- create a duplicate `users` table;
- copy password hashes into `profiles`;
- enable `DB_DRIVER=postgres` with the current Prisma schema;
- bypass Supabase RLS using a broad service-role credential in normal client requests.

## Production integration now in place

Production requests use Supabase Auth plus a request-scoped Supabase REST repository:

1. Supabase access token is validated by the backend.
2. The corresponding `public.profiles` row supplies application role/status/name/phone.
3. Normal database operations use the authenticated user's bearer token with the Supabase publishable/anon key.
4. RLS remains the database authorization boundary.
5. Service-role access is reserved for legitimate privileged Auth/storage operations.

Customer login remains phone + 6-digit PIN with deterministic internal Auth email identities. SMS/OTP is intentionally not used.

## Current authorization audit — 2026-10-06

Production RLS was rechecked for:

- `projects`: clients see only their own projects; staff/admin see all.
- `payments`: clients see only their own payments; staff/admin see all.
- `documents`: clients see only their own metadata; staff/admin see all.
- `tickets`: clients see only their own tickets; staff/admin see all.
- `bookings`: clients see/create/delete only their own bookings; staff/admin can operate across bookings.
- `notifications`: clients see only their own/broadcast notifications; staff/admin see all.
- `chat_messages`: clients are restricted to their own thread; staff/admin can access all threads.
- `equipment` and `expenses`: staff/admin only.
- `audit_logs`: admin only.
- `cms`: public read, admin update.
- `profiles`: owner/self or staff/admin access as defined by RLS.

All application tables above have RLS enabled in production.

The Supabase repository sends the user's bearer token on GET/POST/PATCH/DELETE requests, so route handlers cannot turn a client request into an unrestricted database request.

### Profile privilege hardening

On 2026-10-06, production received a defense-in-depth trigger on `public.profiles`:

- clients can update their own allowed profile fields;
- clients cannot change their own `role`;
- clients cannot change their own `status`;
- staff/admin can perform the managed role/status changes required by the application.

The trigger function is in the private schema and is executable by authenticated users only.

### Storage audit

The private `documents` bucket was rechecked:

- upload is limited to the authenticated user's own folder;
- reads are limited to the owner or staff/admin;
- deletion is staff/admin only;
- the backend uses server-side storage operations for document lifecycle management.

## Auth hardening completed

Phone identity synchronization is now centralized. Customer self-service, managed-client, and managed-staff phone changes update the deterministic internal Auth email and phone metadata together, preserving phone + PIN login without SMS.

Customer/admin login endpoints also have tighter route-specific rate limits, and duplicate phone numbers are rejected during self-service profile changes.

## Security status

- Production RLS ownership audit: passed for the reviewed application tables.
- Production profile privilege-escalation guard: applied and verified.
- Production storage ownership audit: passed for the private documents bucket.
- Service-role ordinary-request bypass: not used by the request-scoped repository.
- Supabase Security Advisor should continue to be checked after schema/security changes.

No production secrets are stored in this repository.
