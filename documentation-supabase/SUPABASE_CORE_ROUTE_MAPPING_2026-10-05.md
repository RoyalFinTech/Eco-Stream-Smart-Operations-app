# Supabase Core Route Mapping — 2026-10-05

## Scope

The v1.3 application keeps its existing route-facing camelCase field names while production persistence uses the existing Supabase `public` schema.

This change adds a dedicated translation boundary for the first production-critical tables:

- `profiles`
- `projects`
- `bookings`
- `payments`

## Mapping rules

| Application field | Supabase field |
|---|---|
| `clientId` | `client_id` |
| `assignedEngineerId` | `assigned_engineer_id` |
| `totalDepth` | `total_depth` |
| `waterYield` | `water_yield` |
| `soilType` | `soil_type` |
| `startDate` | `start_date` |
| `drillingLocation` | `drilling_location` |
| `requestType` | `request_type` |
| `areaType` | `area_type` |
| `paymentPlan` | `payment_plan` |
| `submittedAt` | `submitted_at` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `staffRole` | `staff_role` |

## UUID policy

The production tables use PostgreSQL UUID primary keys with `gen_random_uuid()` defaults. The adapter therefore does not send the legacy v1.3 generated string IDs during inserts.

This avoids invalid IDs such as `p_xxx` or `pay_xxx` entering the production schema.

## Security boundary

The PostgREST adapter remains request-scoped and requires the authenticated user's Supabase access token. It uses the publishable/anon key plus the user's bearer token and does not use the service-role key for normal application data access. Existing Supabase RLS remains the authorization boundary.

## Verification

Local Node syntax checks and schema-map round-trip tests passed on 2026-10-05.

The local engineered workspace currently contains 77 files. The full local source tree has **not** been pushed from this environment; this documentation commit records the engineering decision only.
