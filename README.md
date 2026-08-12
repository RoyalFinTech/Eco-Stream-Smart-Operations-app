# EcoStream Smart Operations

A borehole drilling services management system for EcoStream Ltd. (Banjul, The Gambia) — a customer-facing client portal, a staff/admin operations portal, and the API backing both.

## Project overview

EcoStream Ltd. drills boreholes and installs water systems (including solar-powered pumping) for residential, commercial, and agricultural customers in The Gambia. This system lets:
- **Customers** register, request drilling or a site survey, track a project's progress, pay invoices, upload/download documents (water-test results, contracts), raise support tickets, and chat with the company.
- **Staff and admins** manage clients, projects, equipment, finances, and support tickets from a single operations dashboard, with audit logging and role-based permissions.

## Architecture

Three independent pieces sharing one backend:

```
┌─────────────────────┐        ┌─────────────────────┐
│  client-portal/       │        │  admin-portal/         │
│  index.html            │        │  index.html             │
│  (static, no build)      │        │  (static, no build)       │
└──────────┬───────────────┘        └───────────┬─────────────┘
           │            HTTPS + JWT Bearer token              │
           └─────────────────────┬──────────────────────────┘
                                  ▼
                    ┌──────────────────────────┐
                    │  backend/                    │
                    │  Node.js, zero npm             │
                    │  dependencies (server.js,       │
                    │  lib/, routes/)                    │
                    └──────────────┬────────────────────┘
                                   ▼
                    ┌──────────────────────────┐
                    │  backend/database/            │
                    │  store.json (JSON file store)   │
                    └──────────────────────────┘
```

Full detail, data model, and request-flow walkthrough: [`documentation/ARCHITECTURE.md`](documentation/ARCHITECTURE.md).

**Why zero npm dependencies?** This project was built and audited in a sandboxed environment with no package-registry access, so the backend is deliberately dependency-free — `crypto.scrypt` for password hashing, a hand-rolled JWT implementation, a small custom HTTP router, and a JSON-file datastore instead of Express/bcrypt/jsonwebtoken/a SQL driver. It runs with nothing but `node server.js` — no `npm install` step. This is a real constraint the project was built around, not a shortcut; see [`documentation/ARCHITECTURE.md`](documentation/ARCHITECTURE.md) for the reasoning.

## Features

- **Auth**: registration, login, refresh tokens with rotation, password reset, email verification, account lockout after repeated failed attempts, device/session management, audit logging
- **Client portal**: dashboard, book drilling/site-survey, live project tracking (depth/status gauge + timeline), invoices & payment history, document upload/download, support tickets, chat with the company, notifications, profile & session settings, dark/light mode
- **Admin portal**: dashboard with revenue/project/client/equipment stats and an activity feed, client management (approve/suspend/edit/delete, search, CSV export), project management (approve bookings, assign engineers, update progress), staff management, equipment & expense tracking, financial reports (daily/weekly/monthly/annual), support ticket management, client chat, notification broadcast, site content (CMS) editor, roles & permissions reference, audit log viewer
- **API**: versioned (`/api/v1/...` alongside unversioned paths), rate-limited, CORS-whitelistable, security headers, structured logging, graceful shutdown, opt-in pagination/search on list endpoints, interchangeable file storage (local disk today; S3/R2/Supabase providers written and ready — see caveats below)

## Installation

Requirements: Node.js 18+ (built and tested on Node 22). No `npm install` needed for the backend.

```bash
git clone <your-repo-url>
cd EcoStream-System/backend
cp .env.example .env
# edit .env — at minimum, set JWT_SECRET (see below)
node server.js
```

Then open `client-portal/index.html` or `admin-portal/index.html` directly in a browser (no build/serve step required for a local look), or serve them from any static host.

## Environment variables

Full variable-by-variable list with test evidence for each: [`documentation/ENVIRONMENT_VARIABLES.md`](documentation/ENVIRONMENT_VARIABLES.md). Template with every variable and no real values: [`backend/.env.example`](backend/.env.example). The one you must not skip:

```bash
# Generate a real JWT secret before deploying anywhere real:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Running locally

```bash
cd backend
node server.js
# API on http://localhost:4000 — health check: GET /api/health
```

**Administrator account:** there is no seeded demo admin. Set `ADMIN_EMAIL`
and `ADMIN_PASSWORD` in `backend/.env` before starting the server — that's
the only way an admin account gets created, in any environment. See
[`documentation/ENVIRONMENT_VARIABLES.md`](documentation/ENVIRONMENT_VARIABLES.md).

**Demo data (local development only):** outside of `NODE_ENV=production`,
`node server.js` also seeds a demo staff engineer and two demo clients so
the portals have something to look at:

| Role | Email | Password |
|---|---|---|
| Staff (engineer) | engineer@ecostream.gm | Engineer@1234 |
| Client | lamin@example.com | Client@1234 |
| Client | fatou@example.com | Client@1234 |

This demo data is **off by default whenever `NODE_ENV=production`** (and can
be forced on/off anywhere with `SEED_DEMO_DATA=true`/`false`) — it will not
appear in a production deployment unless you explicitly opt in.

Then open either portal's `index.html` in a browser. Both default to `http://localhost:4000`; change this under each portal's **Settings** screen if your backend runs elsewhere.

## Docker usage

```bash
docker-compose up          # backend only, on its default JSON datastore
docker-compose --profile with-nginx up   # backend + nginx reverse proxy for both static portals
docker-compose --profile postgres up     # also starts a Postgres container for when the Prisma migration (see below) is completed
```

See [`docker-compose.yml`](docker-compose.yml), [`backend/Dockerfile`](backend/Dockerfile), and [`nginx.conf`](nginx.conf).

## Deployment

Full guide with a post-deploy smoke test: [`documentation/DEPLOYMENT_GUIDE.md`](documentation/DEPLOYMENT_GUIDE.md). Pre-launch checklist: [`documentation/PRODUCTION_DEPLOYMENT_CHECKLIST.md`](documentation/PRODUCTION_DEPLOYMENT_CHECKLIST.md). If something goes wrong after deploying: [`documentation/ROLLBACK_PLAN.md`](documentation/ROLLBACK_PLAN.md). Consolidated list of what still needs attention before real users arrive: [`documentation/BLOCKERS.md`](documentation/BLOCKERS.md) — in short, **no email service is connected yet**, which matters for password reset.

Ready-to-use configs are included for Render (`backend/render.yaml`), Railway (`backend/railway.json`), Docker (above), and Vercel (`vercel.json` — static portals only; see [`documentation/VERCEL_DEPLOYMENT.md`](documentation/VERCEL_DEPLOYMENT.md) for why the backend specifically does *not* deploy to Vercel and what to do instead).

## Folder structure

```
EcoStream-System/
├── .gitignore
├── README.md                    ← you are here
├── docker-compose.yml
├── nginx.conf
├── backend/
│   ├── server.js                 entrypoint
│   ├── .env.example
│   ├── Dockerfile
│   ├── render.yaml / railway.json
│   ├── lib/                      router, auth, logging, security, rate limiting, storage abstraction
│   ├── routes/                   one file per API resource
│   ├── prisma/                   schema + migration SQL for a future Postgres migration (not yet connected — see documentation/POSTGRES_MIGRATION.md)
│   ├── repositories/             Postgres-backed data layer (written, not yet wired in)
│   ├── database/                 JSON datastore (git-ignored; .gitkeep preserves the folder)
│   ├── uploads/                  uploaded documents (git-ignored; .gitkeep preserves the folder)
│   └── logs/                     app logs (git-ignored; .gitkeep preserves the folder)
├── client-portal/index.html
├── admin-portal/index.html
├── scripts/backup.sh
└── documentation/                 architecture, API reference, QA/audit history, deployment & rollback guides
```

## Supabase migration path (parallel, not yet cut over)

A complete Supabase-native architecture (Postgres schema with RLS, Auth, Storage, Edge Functions) has been written in `supabase/` as a reviewed, ready-to-verify migration path — **not yet wired in**, since none of it has been tested against a real Supabase project (no account/credentials available while writing it) and the existing `backend/` remains the only actually-verified, working system. See `documentation-supabase/DEPLOYMENT.md` for the reasoning and the incremental cutover path if you want to complete this migration for real.

## Documentation index

| Doc | Covers |
|---|---|
| [`ARCHITECTURE.md`](documentation/ARCHITECTURE.md) | System diagram, data model, request-flow example |
| [`API_DOCUMENTATION.md`](documentation/API_DOCUMENTATION.md) / [`openapi.yaml`](documentation/openapi.yaml) / [`api-docs.html`](documentation/api-docs.html) | Every endpoint |
| [`ENVIRONMENT_VARIABLES.md`](documentation/ENVIRONMENT_VARIABLES.md) | Every variable, with test evidence |
| [`DEPLOYMENT_GUIDE.md`](documentation/DEPLOYMENT_GUIDE.md) | Step-by-step deploy + smoke test |
| [`PRODUCTION_DEPLOYMENT_CHECKLIST.md`](documentation/PRODUCTION_DEPLOYMENT_CHECKLIST.md) | Pre-launch checklist, verified vs. assumed |
| [`ROLLBACK_PLAN.md`](documentation/ROLLBACK_PLAN.md) | Tested backup/restore procedure |
| [`BLOCKERS.md`](documentation/BLOCKERS.md) | What still needs attention, consolidated |
| [`DATABASE_MIGRATIONS_STATUS.md`](documentation/DATABASE_MIGRATIONS_STATUS.md) / [`POSTGRES_MIGRATION.md`](documentation/POSTGRES_MIGRATION.md) | Postgres/Prisma migration status and path |
| [`QA_AUDIT_REPORT.md`](documentation/QA_AUDIT_REPORT.md) / [`PRODUCTION_READINESS_REPORT.md`](documentation/PRODUCTION_READINESS_REPORT.md) | QA history and findings |

## License

No license file is currently included, which by default means all rights are reserved to the project owner (EcoStream Ltd.) — no one else may copy, modify, or redistribute this code without permission. If you intend to open-source this project, add a `LICENSE` file (e.g., MIT, Apache 2.0) at the repository root; the choice of license is a business decision this document doesn't make for you.
