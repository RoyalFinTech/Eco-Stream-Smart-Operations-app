# EcoStream Frontend Branding & QA — 2026-10-05

## Official branding

The supplied EcoStream branding is now the canonical portal logo. Each standalone portal contains:

- `assets/ecostream-logo.png` — canonical logo asset.
- The browser favicon points to the same canonical asset so the portal has one source of branding truth.

The logo is used in:

- Client authentication/registration/reset entry screen.
- Client authenticated sidebar and mobile top bar.
- Admin authentication entry screen.
- Admin authenticated sidebar and mobile top bar.
- Browser favicon for both portals.

No legacy base64 logo payload remains in either portal HTML.

## Responsive/UI checks

The existing premium EcoStream visual system remains intact: water-green, blue, charcoal, glass/card surfaces, rounded controls, focus states, dark mode, responsive grids, and mobile navigation.

Branding hardening:

- Auth logo scales down cleanly on small screens.
- Mobile top bar exposes EcoStream branding when the sidebar is hidden.
- Logo plates preserve aspect ratio and prevent stretching/cropping.
- Logo assets are displayed with `object-fit: contain`.
- Reduced-motion support remains enabled.

## Functional verification

- Both portal JavaScript blocks: `node --check` PASS.
- All backend JavaScript files: `node --check` PASS.
- JSON-provider API smoke test: PASS.
- Canonical logo asset exists in both portal trees.

## Production Supabase note

The production data boundary remains Supabase Auth + `public.profiles` + RLS-protected application tables. Legacy JSON/Prisma code remains only for compatibility and local/demo operation; it is not the production Supabase source of truth.


### Repository asset verification

The official supplied artwork is now stored as a self-contained SVG asset in both portal trees:

- client-portal/assets/ecostream-logo.svg
- admin-portal/assets/ecostream-logo.svg

Both files were fetched from the current main branch and have the same content SHA. The portal HTML references the SVG asset rather than an embedded base64 logo payload.
