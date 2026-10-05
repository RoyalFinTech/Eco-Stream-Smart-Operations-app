# Rollback Plan

## Data rollback — verified end-to-end this pass

This is not a theoretical procedure — it was actually executed: took a backup, made a change, restored the backup, and confirmed the change was correctly undone with no side effects.

**Verified procedure:**
```bash
# 1. Stop the server
kill <server-pid>   # or your platform's stop/restart command

# 2. Restore the most recent backup
BACKUP_DIR=$(ls -d backups/ecostream_backup_* | tail -1)
cp "$BACKUP_DIR/store.json" backend/database/store.json
# if uploads were also backed up:
tar -xzf "$BACKUP_DIR/uploads.tar.gz" -C backend/

# 3. Restart
node backend/server.js   # or your platform's start command

# 4. Verify (see verification steps below)
```
**[Verified]** — this exact sequence was run: created a client record, backed up, created a second record (simulating a bad change), restored, and confirmed the database was back to exactly its pre-backup state (2 clients, not 3; the specific added record correctly absent).

**Caveat, stated plainly:** this proves the *file-copy* mechanics work. It does not account for anything that happened *between* the backup and the rollback that you'd want to keep (e.g., legitimate new client signups during the bad period) — restoring a backup is a full point-in-time revert, not a selective undo. There's no merge tooling here; if that distinction matters for your situation, you'd need to manually reconcile records after restoring, which is a manual data-entry task, not something this system automates.

## Backend code rollback

**[Unverified/Assumption — standard practice, not executed from this sandbox:]**
- If deployed via git-connected platform (Render/Railway): use the platform's own rollback-to-previous-deploy feature, or `git revert` the bad commit and push — both trigger a redeploy of the prior working code.
- Because the backend is genuinely zero-dependency (**[Verified]** — no `npm install` step), a rollback redeploy has no dependency-resolution surprises to worry about; it's exactly the previous version of the same handful of `.js` files.
- The data file is **not** part of the code deploy (it lives on a separate persistent volume per `render.yaml`), so rolling back code does not touch data — you'd only additionally restore data (above) if the bad deploy also wrote bad data, not just bad code.

## Frontend rollback

**[Unverified/Assumption]** — both portals are single static HTML files with no build step, so "rollback" is just re-uploading the previous version of that one file to your static host. Keep the previous version of each file (e.g., tag releases in git) before overwriting.

## When to roll back — decision criteria

Roll back immediately (don't try to hotfix in production first) if, after a deploy:
- `/api/health` stops returning `200`
- The step-4 smoke test in `DEPLOYMENT_GUIDE.md` fails (login or document upload broken)
- Any existing user reports being unable to log in or seeing another user's data (a scoping regression — verified extensively in `PRODUCTION_READINESS_REPORT.md`, but a code change could reintroduce this class of bug)

Consider a fix-forward instead of rollback if:
- The issue is cosmetic (UI styling, wording) and doesn't affect data integrity or access control
- The issue only affects a feature explicitly marked unverified in this documentation set (e.g., a cloud storage provider you already knew wasn't tested)

## Verification steps after any rollback

Run the same step-4 smoke test from `DEPLOYMENT_GUIDE.md` (login + document upload), then additionally:
```bash
# Confirm client record count matches your last known-good backup
curl -s $API/api/clients -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['clients']))"
```
Compare against the count in your backup's `store.json` (`python3 -c "import json;print(len(json.load(open('store.json'))['users']))"` counts all users including staff — filter by `role=="client"` for a client-only count matching the API response).

## What this plan does not cover

- Rolling back a partially-completed Postgres migration — not applicable, since that migration has never been started against a real database (see `DATABASE_MIGRATIONS_STATUS.md`).
- Automated/one-click rollback — everything above is manual. Given the current scale (JSON file, single process), automating this wasn't attempted since it would be new tooling, not verification of what exists.