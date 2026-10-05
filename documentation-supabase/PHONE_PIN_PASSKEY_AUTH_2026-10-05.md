# Phone + PIN + Passkey Authentication — 2026-10-05

## Implemented

- Client registration: full name + Gambian phone number + 6-digit PIN.
- Client sign-in: phone + 6-digit PIN.
- Staff/admin sign-in: phone + 6-digit PIN.
- Gambian UI: 🇬🇲 +220 plus an in-field 87 mobile prefix.
- Landing page: restricted 🛡️ Staff / Admin Portal route.
- Authenticated pages: Powered by Royal Fintech footer.
- Legacy Banjul/The Gambia footer wording removed.
- Supabase Auth adapter uses phone/password credentials in production.
- Staff/client administration creates Supabase Auth users with phone identities and 6-digit PINs.
- Profile phone changes synchronize the Supabase Auth phone identity.
- Browser passkey integration uses Supabase Auth WebAuthn APIs; supported devices can use biometrics, device PIN, or another passkey authenticator.
- Client and admin portals provide passkey sign-in and enrollment.
- Browser passkey configuration receives only the Supabase URL and publishable/anon key; service-role remains server-only.

## Supabase Dashboard prerequisites

The application code is ready, but hosted Supabase Auth provider configuration must be enabled in the Supabase Dashboard:

1. Enable Phone authentication.
2. If phone confirmation is desired, configure an SMS/WhatsApp provider and enable phone confirmations.
3. Enable Passkey authentication under Authentication → Passkeys.
4. Configure WebAuthn with:
   - RP display name: EcoStream
   - RP ID: ecostream-m2sy.onrender.com
   - RP origin: https://ecostream-m2sy.onrender.com
5. Keep the RP ID stable after passkeys are registered.

## Existing-account migration

Production currently contains one existing Auth user with an email identity and a matching profile phone value. The existing Auth record was not manually mutated with SQL. Supabase Auth identities should be changed through supported Auth Admin operations.

A safe migration requires an authorized account-management operation that sets the phone identity and a new PIN. No PIN was invented or committed to source control.

## Security

The requested six-digit PIN is weaker than a long password. Supabase recommends stronger password policies and MFA for phone/password authentication. Passkeys are the preferred returning-user security/convenience option where supported.

The staff/admin footer link is not a security boundary; server-side role authorization remains mandatory.
