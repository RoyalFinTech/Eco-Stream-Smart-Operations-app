# Remaining Blockers — Consolidated

## Hard blockers before real customer launch

1. **Transactional email must be configured and verified.** Set `EMAIL_WEBHOOK_URL` to a real trusted provider endpoint and test registration verification plus password reset delivery. The application now refuses to start in production without it and never returns reset/verification tokens in API responses.
2. **Production database decision.** The current JSON datastore is suitable only for a single-instance/small deployment. Complete and execute the PostgreSQL/Prisma migration before scaling horizontally or handling significant customer volume.

## Important production gaps

3. **Cloud storage providers are not live-tested.** S3/R2/Supabase require real credentials and an end-to-end upload/download test before selecting one for production.
4. **Shared rate limiting is required before horizontal scaling.** The current limiter is process-local.
5. **Log rotation/shipping is required for sustained production volume.**
6. **Automated regression tests should be added to CI.** `scripts/smoke-test.sh` now provides a lightweight local smoke test.

## Fixed in this engineering pass

- Hardcoded production JWT fallback removed; startup validates the secret.
- Reset/verification token disclosure removed; tokens are hashed at rest.
- Request body size and malformed-JSON handling hardened.
- Upload file-signature validation added.
- Predictable demo accounts disabled in production by default.