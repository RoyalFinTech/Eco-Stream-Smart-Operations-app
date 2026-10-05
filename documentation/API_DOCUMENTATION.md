# EcoStream API Documentation

Base URL (default): `http://localhost:4000`

All request/response bodies are JSON. Authenticated routes require:
```
Authorization: Bearer <token>
```
Tokens are returned by `/api/auth/login` or `/api/auth/register` and expire after 12 hours.

Roles: `client`, `staff`, `admin`. Routes marked **admin/staff** reject client tokens with `403`. Routes marked **admin** reject both client and staff tokens.

---

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | none | Client self-registration. Body: `name, email, phone, address?, password` |
| POST | `/api/auth/login` | none | Body: `email, password` → `{ token, user }` |
| POST | `/api/auth/logout` | any | Client-side token discard (stateless JWT) |
| POST | `/api/auth/forgot-password` | none | Body: `email`. Sends a one-time reset token through the configured transactional email webhook; the token is never returned by the API |
| POST | `/api/auth/reset-password` | none | Body: `token, newPassword` |
| GET | `/api/auth/profile` | any | Returns the current user |
| PUT | `/api/auth/profile` | any | Body: `name?, phone?, address?` |

## Clients — admin/staff unless noted

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/clients` | admin/staff | List all clients |
| POST | `/api/clients` | admin/staff | Create a client manually (returns a temp password) |
| PUT | `/api/clients/:id` | admin/staff | Edit name/email/phone/address |
| PATCH | `/api/clients/:id/status` | admin | Body: `status: active\|suspended\|pending` — approve/suspend |
| DELETE | `/api/clients/:id` | admin | Permanently delete a client |

## Projects

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/projects` | any | Clients see only their own; staff/admin see all |
| POST | `/api/projects` | admin/staff | Body: `clientId, location, totalDepth?, soilType?, assignedEngineerId?` |
| PUT | `/api/projects/:id` | admin/staff | Body: any of `location, status, depth, totalDepth, waterYield, soilType, notes, assignedEngineerId` |
| DELETE | `/api/projects/:id` | admin | |
| GET | `/api/projects/status/:id` | any (owner or staff) | `{ status, depth, totalDepth, percentComplete }` |
| GET | `/api/projects/timeline/:id` | any (owner or staff) | Timeline events array |
| POST | `/api/projects/:id/timeline` | admin/staff | Body: `label` — appends a timestamped event |

## Bookings (drilling requests / site surveys)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/bookings` | client | Body: `drillingLocation, package?, areaType?, purpose?, paymentPlan?, requestType?` |
| GET | `/api/bookings` | any | Clients see only their own |
| PUT | `/api/bookings/:id` | admin/staff | Body: `status: pending\|approved\|rejected` |
| DELETE | `/api/bookings/:id` | owner or admin/staff | Cancel a request |

## Payments & Invoices

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/payments` | any | Clients see only their own |
| POST | `/api/payments` | admin/staff | Body: `clientId, amount, method, projectId?` — records a paid payment |
| GET | `/api/invoices` | any | Same data as payments, with `invoiceNumber` added |
| POST | `/api/invoices` | admin/staff | Creates an unpaid invoice ahead of payment |

## Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | any | Clients see only notifications addressed to them |
| POST | `/api/notifications` | admin/staff | Body: `title, message, type?, userId?` (omit `userId` to broadcast) |
| PATCH | `/api/notifications/:id/read` | any | Mark as read |

## Support Tickets

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/tickets` | any | Body: `subject, description, category?, priority?, location?` |
| GET | `/api/tickets` | any | Clients see only their own |
| PUT | `/api/tickets/:id` | owner (client) or admin/staff | Body: `reply?` and/or `status?` (status changes require staff/admin) |
| DELETE | `/api/tickets/:id` | admin/staff | |

## Staff

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/staff` | admin | |
| POST | `/api/staff` | admin | Body: `name, email, phone, staffRole: engineer\|technician\|driver\|administrator` (returns temp password) |
| PUT | `/api/staff/:id` | admin | Body: `name?, phone?, staffRole?` |
| DELETE | `/api/staff/:id` | admin | |

## Equipment & Expenses

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/equipment` | admin/staff | |
| POST | `/api/equipment` | admin | Body: `type, name` |
| PUT | `/api/equipment/:id` | admin/staff | Body: `status?, lastMaintenance?, name?` |
| DELETE | `/api/equipment/:id` | admin | |
| GET | `/api/expenses` | admin/staff | Fuel/maintenance/parts logs |
| POST | `/api/expenses` | admin/staff | Body: `category, amount, note?` |

## Documents (reports, water tests, contracts)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/documents` | any | Body: `fileName, mimeType, base64Data, category?: report\|water-test\|contract\|other, clientId?` (staff can upload on behalf of a client) |
| GET | `/api/documents` | any | Metadata only (no file bytes); clients see only their own |
| GET | `/api/documents/:id` | owner or admin/staff | Includes file bytes for download |
| DELETE | `/api/documents/:id` | admin/staff | |

## Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/chat/conversations` | admin/staff | List clients with message threads, unread counts |
| GET | `/api/chat/:clientId` | owner or admin/staff | Use `me` as `:clientId` for the client's own thread |
| POST | `/api/chat/:clientId` | owner or admin/staff | Body: `message` |

## Reports

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/reports?range=daily\|weekly\|monthly\|annual&date=YYYY-MM-DD` | admin/staff | Revenue/expenses/profit/new-projects aggregated over the period |

## CMS

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/cms` | none | Public site content (hero text, contact info) |
| PUT | `/api/cms` | admin | Update site content |

## Audit Logs

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/audit-logs` | admin | Last 500 events: logins, registrations, client status changes, deletions, CMS edits |

## Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard/stats` | admin/staff | Revenue, project counts by status, client/staff/equipment/ticket totals |
| GET | `/api/dashboard/client` | client | Own project/payment/ticket summary |

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | `{ status: "ok", time }` |

---

## Error format

All errors return `{ "error": "human-readable message" }` with an appropriate status code:

- `400` — validation error (missing/invalid fields)
- `401` — missing or invalid/expired token
- `403` — valid token, wrong role, or ownership mismatch
- `404` — resource not found
- `500` — unexpected server error