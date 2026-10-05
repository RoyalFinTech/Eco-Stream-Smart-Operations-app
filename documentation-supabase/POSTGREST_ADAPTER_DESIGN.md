# Supabase/PostgREST Adapter Design

Date: 2026-10-04

A request-scoped PostgREST adapter has been added to the verified v1.3 engineering workspace as:

`backend/lib/supabaseData.js`

## Security model

The adapter requires the end-user Supabase access token for every database operation and sends it as:

- `apikey: SUPABASE_ANON_KEY`
- `Authorization: Bearer <user access token>`

This intentionally preserves the existing Supabase RLS boundary.

The adapter does **not** accept or use the service-role key.

## Supported operations

- list rows
- find by equality / `in`
- find one
- find by UUID id
- insert
- update by id
- delete by id

Bulk replacement is explicitly unsupported.

## Integration status

The adapter is currently isolated and not wired into `lib/db.js`. This is deliberate: the existing route field names and v1.3 Prisma model names still require a table-by-table mapping to the live Supabase schema.

Next engineering task:

1. create explicit field mappings for each production table;
2. normalize UUID/date/enum differences;
3. make authentication middleware attach the Supabase access token and profile;
4. pass request scope into repositories;
5. migrate routes incrementally;
6. run integration tests against the controlled Supabase project;
7. only then enable the Supabase data driver.

This prevents a partial migration from creating a mixed JSON/Prisma/Supabase runtime.
