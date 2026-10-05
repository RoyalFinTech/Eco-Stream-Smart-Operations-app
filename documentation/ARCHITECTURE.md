# EcoStream — System Architecture

## Overview diagram

```
┌─────────────────────────┐        ┌─────────────────────────┐
│   EcoStream_Client_      │        │   EcoStream_Admin_       │
│   Portal.html             │        │   Operations.html         │
│   (standalone, static)    │        │   (standalone, static)    │
│                            │        │                            │
│   Vanilla JS · fetch()     │        │   Vanilla JS · fetch()     │
└─────────────┬──────────────┘        └─────────────┬──────────────┘
              │                                       │
              │   HTTPS/HTTP + JWT Bearer token        │
              └───────────────────┬───────────────────┘
                                   ▼
                    ┌───────────────────────────┐
                    │   ecostream-backend/        │
                    │   server.js (Node http)      │
                    │                               │
                    │   lib/router.js  — routing,   │
                    │     CORS, auth middleware      │
                    │   lib/auth.js    — scrypt      │
                    │     hashing, HS256 JWT          │
                    │   lib/validate.js — input       │
                    │     validation                   │
                    │   lib/audit.js   — audit log      │
                    │     helper                         │
                    │                                     │
                    │   routes/*.js — one file per         │
                    │     resource (auth, clients,          │
                    │     projects, bookings, payments,     │
                    │     notifications, tickets, staff,     │
                    │     equipment, documents, chat,         │
                    │     reports, cms, dashboard)             │
                    └───────────────┬───────────────────────────┘
                                    ▼
                    ┌───────────────────────────┐
                    │   lib/db.js                  │
                    │   Collection API over a       │
                    │   single JSON file             │
                    │   (data/store.json)             │
                    │   Atomic writes: tmp+rename       │
                    └───────────────────────────┘
```

## Why this shape

- **Two static HTML files, one API.** The brief asked for two *independent* applications. They're independent in the sense that neither references the other and either can be deployed/hosted separately — but both talk to the same backend and data, because a drilling company's clients and admins are necessarily looking at the same underlying projects/payments/tickets. Giving each portal its own copy of the data would mean they drift out of sync immediately.
- **No framework, no build step.** Both HTML files are single files you can open directly in a browser or drop on any static host (S3, GitHub Pages, a plain nginx directory). No `npm install`, no bundler.
- **The backend has no external dependencies** for the reason explained in the README (no internet access in the build environment) — but the design keeps a real driver swap cheap: every route talks to `db.collection(name)`, never to `fs` directly.

## Data model (collections in `data/store.json`)

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `id, role, staffRole?, name, email, phone, address?, password, status?` | `role` is `client`, `staff`, or `admin`. Password is `salt:hash` (scrypt). |
| `projects` | `id, clientId, location, status, depth, totalDepth, waterYield, soilType, assignedEngineerId, notes, timeline[]` | `status`: pending / ongoing / completed |
| `bookings` | `id, clientId, requestType, package, drillingLocation, status` | `status`: pending / approved / rejected |
| `payments` | `id, clientId, projectId?, amount, method, status, date` | Also serves as the invoice record — `/api/invoices` is a read alias |
| `notifications` | `id, userId?, type, title, message, read, date` | `userId` null = broadcast |
| `tickets` | `id, ticketNumber, clientId, subject, description, category, priority, status, replies[]` | |
| `documents` | `id, clientId, fileName, mimeType, base64Data, category` | category: report / water-test / contract / other |
| `chatMessages` | `id, clientId, sender, senderName, message, read` | `sender`: client / company |
| `equipment` | `id, type, name, status, lastMaintenance` | |
| `expenses` | `id, category, amount, note, date` | Fuel/maintenance/parts logs |
| `cms` | single row: `heroTitle, heroSubtitle, contactPhone, contactAddress, contactHours` | |
| `auditLogs` | `id, actorId, actorName, actorRole, action, details, date` | Append-only |

## Folder structure

```
ecostream-backend/
├── server.js              # entrypoint — wires routes, starts http.Server
├── lib/
│   ├── router.js           # minimal Express-alternative router + CORS + auth middleware
│   ├── auth.js              # scrypt password hashing, HS256 JWT sign/verify
│   ├── db.js                 # JSON-file collection API (atomic writes)
│   ├── validate.js            # requireFields, isEmail, sanitizeText
│   ├── audit.js                # audit-log insert helper
│   └── seed.js                  # demo data seeded on first run
├── routes/
│   ├── auth.js         ├── notifications.js
│   ├── clients.js      ├── tickets.js
│   ├── projects.js     ├── staff.js
│   ├── bookings.js     ├── equipment.js
│   ├── payments.js     ├── documents.js
│   ├── chat.js         ├── reports.js
│   ├── cms.js          └── dashboard.js
└── data/
    └── store.json        # created automatically on first run

EcoStream_Client_Portal.html       # standalone — no build step
EcoStream_Admin_Operations.html    # standalone — no build step
```

## Request flow example — client books drilling

1. Client Portal: `POST /api/bookings` with JWT → `lib/router.js` runs `authenticate` middleware → `routes/bookings.js` validates `drillingLocation` is present → inserts into `bookings` collection with `status: "pending"`.
2. Admin Portal: `GET /api/bookings` (admin/staff see all) → shows under **Projects → Booking Requests**.
3. Admin approves: `PUT /api/bookings/:id { status: "approved" }`.
4. Admin clicks **Create Project**: `POST /api/projects { clientId, location }` → new row in `projects`, visible to that client under **Project Tracking** with the depth gauge starting at 0%.

## Security model

- Passwords never stored in plaintext; `crypto.scryptSync` with a random 16-byte salt per user, timing-safe comparison on verify.
- JWTs are signed (HS256) and verified server-side on every authenticated route; a tampered or expired token is rejected with `401`.
- Role checks (`requireRole`) run *after* authentication on every admin/staff-only route — a client token can never reach `/api/clients`, `/api/staff`, etc.
- Ownership checks (e.g. a client can only see their own projects/payments/tickets) are enforced in the route handler, not just hidden in the UI — hitting the API directly with another client's ID still returns only your own data or a `403`.
- See `QA_AUDIT_REPORT.md` for the full security review.