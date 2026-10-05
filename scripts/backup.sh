#!/bin/bash
# scripts/backup.sh — backs up the JSON datastore + uploaded files.
# Run this on a schedule (cron/systemd timer) until/unless you migrate to a
# managed Postgres database with its own backup story (see
# documentation/POSTGRES_MIGRATION.md).
#
# Usage: ./scripts/backup.sh [backup-directory]
# Default backup directory: ./backups

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"
BACKUP_DIR="${1:-$SCRIPT_DIR/../backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DEST="$BACKUP_DIR/ecostream_backup_$TIMESTAMP"

mkdir -p "$DEST"

if [ -f "$BACKEND_DIR/database/store.json" ]; then
  cp "$BACKEND_DIR/database/store.json" "$DEST/store.json"
  echo "Backed up database/store.json"
else
  echo "Warning: database/store.json not found — has the server been started at least once?"
fi

if [ -d "$BACKEND_DIR/uploads" ] && [ "$(ls -A "$BACKEND_DIR/uploads" 2>/dev/null)" ]; then
  tar -czf "$DEST/uploads.tar.gz" -C "$BACKEND_DIR" uploads
  echo "Backed up uploads/ ($(du -sh "$DEST/uploads.tar.gz" | cut -f1))"
else
  echo "No uploads to back up"
fi

# Keep the last 14 backups, delete anything older.
ls -1dt "$BACKUP_DIR"/ecostream_backup_* 2>/dev/null | tail -n +15 | xargs -r rm -rf

echo "Backup complete: $DEST"