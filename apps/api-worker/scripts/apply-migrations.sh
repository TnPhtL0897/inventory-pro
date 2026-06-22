#!/bin/bash
# Apply all migrations to Supabase via Worker admin endpoint
set -e
WORKER_URL="https://quankho-api.letanphatptt.workers.dev"
KEY="MIGRATE_2026_06_21"
MIG_DIR="../../supabase/migrations"

cd "$(dirname "$0")"

# Apply migrations in order, skip test scenarios (9999999)
for f in $(ls $MIG_DIR | grep -E "^[0-9]" | sort | grep -v "9999999"); do
  echo "=== Applying: $f ==="
  SQL=$(cat "$MIG_DIR/$f" | jq -Rs .)
  PAYLOAD=$(jq -n --arg key "$KEY" --arg sql "$SQL" '{key: $key, sql: $sql}')
  RESP=$(curl -sS -X POST "$WORKER_URL/admin/migrate" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")
  echo "$RESP" | head -c 200
  echo ""
done
echo "=== ALL DONE ==="
