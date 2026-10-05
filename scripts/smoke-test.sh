#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4199}"
BASE="http://127.0.0.1:${PORT}"
TMP_DB="backend/database/store.json"
rm -f "$TMP_DB" "$TMP_DB.tmp"

SEED_DEMO_DATA=true PORT="$PORT" node backend/server.js >/tmp/ecostream-smoke.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true' EXIT
sleep 0.7

curl -fsS "$BASE/api/health" >/tmp/ecostream-health.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/ecostream-health.json'))
assert x['status']=='ok'
PY

LOGIN=$(curl -fsS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  --data '{"email":"admin@ecostream.gm","password":"Admin@1234"}')
python3 - "$LOGIN" <<'PY'
import json,sys
x=json.loads(sys.argv[1])
assert x.get('token') and x.get('user',{}).get('role')=='admin'
PY

STATUS=$(curl -sS -o /tmp/ecostream-bad.json -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' --data '{bad')
test "$STATUS" = 400

printf 'EcoStream smoke test: PASS\n'