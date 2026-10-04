# Supabase Production Integration Status

## Verified

- Project: Eco Stream Borehole Drilling
- Project ref: ozvpxgtpsebatjzoixfz
- Region: eu-west-1
- PostgreSQL: 17.6
- Migration history: 12 migrations present
- Public tables: profiles, projects, bookings, payments, notifications, tickets, documents, chat_messages, equipment, expenses, cms, audit_logs
- RLS enabled across application tables
- Security advisor: 0 findings
- Performance advisor: 0 findings
- Database currently contains no application records

## Important architecture decision

Do not apply the standalone Prisma/JSON application's old `User`, `Session`, or duplicate table schema to this Supabase project.

Supabase Auth owns identities through `auth.users`, while application profile data lives in `public.profiles`. Existing RLS policies and storage policies are part of the project's established migration history.

The next application engineering task is to replace the custom JWT identity layer with Supabase Auth-aware server-side access while preserving the existing API contract where practical.

## Security

Production secrets must remain outside GitHub. Use deployment environment variables/secret management for Supabase credentials and application secrets.
