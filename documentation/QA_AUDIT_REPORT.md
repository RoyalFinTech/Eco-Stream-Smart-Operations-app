# EcoStream — QA Audit Report

**Method:** Every view in both portals was driven end-to-end with Playwright (headless Chrome) against a live instance of the real backend — not just read over as code. Console errors, page errors, and failed network requests were captured on every run. Where a flow looked wrong, it was fixed and re-tested from a clean database, not just patched and assumed fixed.

This is a real report of what was tested and found — it doesn't claim coverage it doesn't have. Gaps are listed explicitly at the bottom.

## Bugs found and fixed during this audit

| # | Where | Issue | Fix |
|---|---|---|---|
| 1 | Legacy JSX app | `AppProvider`/`CRMProvider` were re-mounted on every auth-state change (login/logout), because each of the three top-level render branches (`!auth`, client, admin) instantiated its own copy. A brand-new client account created during sign-up was silently wiped the instant login succeeded, since the provider holding that state was thrown away and replaced. | Hoisted both providers to wrap the entire app once, outside the auth-conditional branches, so state persists across login/logout. |
| 2 | Client Portal | The "Reset Password" screen had no way back to login — if a user started a password reset and changed their mind, they were stuck (no link, no back button). | Added a "Back to sign in" link. |
| 3 | Client Portal | `logout()` didn't reset `authMode`, so if you'd switched to the "Create Account" tab before logging out, you'd land back on the register form after signing out — not the login form, which is what a returning user expects. | `logout()` now resets `authMode` to `"login"`. |
| 4 | Admin Portal | Approving a pending booking (or creating a project from an approved one) called a reload that always defaulted back to the "Active Projects" tab, silently discarding the admin's place on "Booking Requests". Caught by an automated test that clicked Approve and then expected to still see the Create-Project button — it wasn't there because the tab had switched. | `loadProjects()` now takes the tab to render as a parameter; the approve/create-project handlers pass `"bookings"`/`"projects"` explicitly so the admin's context is preserved. |
| 5 | Invoice DOCX template (earlier deliverable) | The header row's table cells were generated with `.map()` wrapped in an extra array (`children: [ [...].map(...) ]` instead of `children: [ ...[...].map(...) ]`), which produced malformed `document.xml` — LibreOffice refused to open the file ("source file could not be loaded"). | Fixed the spread; verified the regenerated file opens and renders correctly (converted to PDF and visually inspected). |
| 6 | Legacy JSX app | Dead import (`useCallback`, never used). | Removed. |

## What was tested end-to-end (Playwright, live backend)

**Client Portal:** registration, login (correct and incorrect password), forgot/reset password (full loop, including using the returned dev token), logout, dark-mode toggle, navigation through all 9 views, booking submission, support ticket creation, chat send/receive, invoice viewing, document upload, profile editing.

**Admin Portal:** login, role rejection (a client account cannot log into the admin portal — verified, not assumed), navigation through all 13 views, client creation/suspend, booking approval → project creation → project update, staff creation, equipment creation, expense logging, payment recording, financial reports, ticket reply, CMS content update, client-chat reply.

**Backend:** every route was exercised directly with `curl` before the frontends were built against it — auth success/failure, expired/missing/malformed tokens, role rejection (client hitting admin-only routes → `403`), ownership scoping (a client only ever sees their own projects/payments/tickets, verified by checking the response contents, not just the status code), validation errors (missing required fields → `400` with a specific message), the full forgot/reset-password loop, suspended-account login rejection.

## Security review

- **Passwords:** never stored in plaintext. `crypto.scryptSync` with a random salt per user; verification uses `crypto.timingSafeEqual` (not `===`) to avoid timing side-channels.
- **Auth tokens:** real HS256 JWTs, signature-verified and expiry-checked on every request via the `authenticate` middleware. A request with no token, a garbage token, or an expired token is rejected with `401` before it reaches any route handler.
- **Authorization:** role checks run server-side (`requireRole`), not just hidden in the UI — confirmed by calling admin-only endpoints directly with a client token and getting `403`. Ownership checks (a client can only fetch/modify their own data) are likewise enforced in the handler, confirmed by fetching `/api/projects` as one seeded client and checking the other client's project doesn't appear.
- **Input validation:** every write endpoint validates required fields server-side (`lib/validate.js`) — the API does not trust client-side form validation, since that's trivial to bypass.
- **XSS:** all user-generated content is passed through an `esc()` helper before being interpolated into `innerHTML` in both frontends, so a client entering `<script>` in a name/ticket/chat field is rendered as inert text, not executed.
- **SQL injection:** not applicable — there is no SQL. The JSON datastore does key/property lookups only, no query string construction from user input.
- **CSRF:** the API uses `Authorization: Bearer` tokens rather than cookies, so there's no ambient credential for a third-party site to ride on — classic CSRF doesn't apply to this auth model.
- **Secrets:** `JWT_SECRET` has a hardcoded development fallback (`lib/auth.js`) — **this must be overridden with a real environment variable before any real deployment.** Flagged in the README and deployment checklist.
- **CORS:** currently `Access-Control-Allow-Origin: *` so the two static HTML files can call the API from anywhere during development/demo use. This is called out as a pre-production item to lock down.
- **Rate limiting / brute force:** not implemented. Login attempts are not throttled. Acceptable for a demo/small internal tool; add rate limiting before public internet exposure.

## Accessibility

- All interactive elements are real `<button>`/`<input>`/`<select>`/`<form>` elements (not `<div onclick>`), so they're keyboard-reachable and get default focus styling; a visible focus ring is additionally set via `:focus-visible`.
- `prefers-reduced-motion` is respected — animations collapse to near-zero duration for users who've asked for that.
- Color palette keeps text on background contrast reasonably high in both themes (dark charcoal-green text on off-white, and off-white text on deep charcoal in dark mode).
- **Not done:** a formal automated audit (e.g. axe-core) or a screen-reader pass. This is a real gap — flagged rather than glossed over. If accessibility compliance is a hard requirement, run axe-core against both files and do a manual VoiceOver/NVDA pass before relying on this claim further.

## Known gaps (explicitly not covered)

- No automated test suite is included (the Playwright scripts used during this audit were throwaway verification scripts, not a maintained regression suite). Worth formalizing if this codebase will keep evolving.
- No load/performance testing beyond normal interactive use.
- No penetration testing beyond the manual checks listed above.
- Chat and notifications use polling, not push — acceptable at small scale, listed in the README as an upgrade path.
- The JSON datastore has no migration tooling. Moving to a real database later means writing a one-time export script (straightforward, since the collection API already returns plain arrays of plain objects).