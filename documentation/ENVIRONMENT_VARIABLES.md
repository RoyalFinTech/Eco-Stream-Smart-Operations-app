# Environment Variables — Validation Report

**Method:** every variable below was tested by actually starting the live server with different values and observing real behavior — not inferred from reading the code. Where a test isn't possible (S3/R2/Supabase credentials, a real Postgres connection), that's stated explicitly rather than assumed.

## Verified — actually tested against the running server

| Variable | Default if unset | Verified behavior |
|---|---|---|
| `PORT` | `4000` | Started server with `PORT=5555`; confirmed port 4000 stopped responding and 5555 served the API. **Works as documented.** |
| `JWT_SECRET` | hardcoded dev string (see risk below) | Issued a token under one secret, restarted the server under a *different* secret, confirmed the old token is rejected (`401`). This proves the variable actually signs/verifies tokens rather than being read and ignored. |
| `LOG_LEVEL` | `info` | Set to `error`; confirmed `info`/`http`-level log lines (including the routine "server listening" message) were correctly suppressed. |
| `RATE_LIMIT_MAX` | `120` | Set to `5`; sent 6 requests from the same source and confirmed the request that pushed the count past 5 got a real `429`, not just a header showing it should have. |
| `ALLOWED_ORIGINS` | unset → reflects `*` (any origin) | Set to a two-origin whitelist; confirmed a request from an allowed origin gets that origin reflected back, and a request from a non-whitelisted origin gets the *first whitelisted origin* reflected instead of its own — which is what actually makes a browser block the non-whitelisted page from reading the response. |
| `STORAGE_PROVIDER` | `local` | Set to an invalid value (`dropbox`); confirmed the server **starts up successfully and `/api/health` reports healthy** — the invalid value is not caught until the first document upload/download is attempted, at which point it fails with a clear `500` error message and the server remains healthy afterward. **This is a real gap, not a strength — see Blockers below.** |

## Verified as having **zero effect** on the running app

| Variable | Finding |
|---|---|
| `DATABASE_URL` | Listed in `.env.example` for the future Postgres migration, but **the running `server.js` never reads this variable** — it's only referenced in `repositories/prismaClient.js` and `prisma/schema.prisma`, neither of which is wired into `server.js`. Setting this today does nothing. Confirmed by grepping the actual route registration in `server.js` and finding no reference to `repositories/` or `DATABASE_URL`. |

## Verified as reachable but untestable end-to-end (no credentials, no network)

| Variable | Finding |
|---|---|
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Set to placeholder values and attempted a document upload. The request-signing code ran without crashing and produced a request; it failed at the network layer (**this sandbox's own egress restrictions blocked the outbound call to `amazonaws.com`**, not an AWS response) and the server returned a clean `500` and stayed healthy. This confirms the failure path doesn't crash the process — it does **not** confirm the signing is correct against a real bucket, since no real AWS request ever completed. |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Not separately tested this pass (shares the same signing code path as S3, exercised above). Same caveat applies. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | Not exercised this pass — no Supabase project available to test against. |

## Assumptions clearly flagged (not verified)

- That the S3/R2/Supabase signing code is *correct* against a real endpoint — only that it fails cleanly when it can't reach one.
- That `DATABASE_URL` will work once the Postgres migration (see `POSTGRES_MIGRATION.md`) is completed — the connection string format is standard Postgres/Prisma syntax, but has never been used against a live database.

## Action required before production (verified gap, not a recommendation)

1. **Set `JWT_SECRET` explicitly.** Verified: the app runs with zero warning or error if this is left unset, silently using a hardcoded string that's visible in this very repository (`lib/auth.js` line 7). This is the single highest-priority item in this whole report — an unset `JWT_SECRET` in production means anyone who reads this codebase can forge valid login tokens.
2. **Validate `STORAGE_PROVIDER` at deploy time, not just at first use.** Verified gap: a typo'd or unsupported value won't surface until someone uploads a document, which could be hours or days after a deploy. Until this is changed in code (not done here, per "no new features"), add a manual smoke-test step to your deployment process — see the checklist.