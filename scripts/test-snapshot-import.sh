#!/bin/bash
# =============================================================================
# Test script for stock snapshot import edge function
# =============================================================================
# Usage:
#   1. Set up test data first (run setup-test-snapshot.py via UI or psql)
#   2. Login to get JWT
#   3. Run this script with env vars set
#
# Required env vars:
#   SUPABASE_URL     - https://ituyoplyuhbdxkhabcpy.supabase.co
#   USER_JWT         - JWT token from browser (cookie sb-xxx-auth-token)
#   WAREHOUSE_ID     - 00000000-0000-0000-0000-000000000097
# =============================================================================

set -e

SUPABASE_URL="${SUPABASE_URL:-https://ituyoplyuhbdxkhabcpy.supabase.co}"

if [ -z "$USER_JWT" ]; then
  echo "❌ USER_JWT env var not set"
  echo "Get JWT: login via UI → DevTools → Application → Cookies → sb-xxx-auth-token"
  exit 1
fi

if [ -z "$WAREHOUSE_ID" ]; then
  echo "❌ WAREHOUSE_ID env var not set"
  exit 1
fi

REPORT_DATE="2026-06-10"

# Test 1: Dry-run (all 3 SKUs already exist)
echo "=== Test 1: Dry-run ==="
curl -s -X POST "$SUPABASE_URL/functions/v1/import-stock-snapshot" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"warehouseId\": \"$WAREHOUSE_ID\",
    \"reportDate\": \"$REPORT_DATE\",
    \"dryRun\": true,
    \"sheets\": [
      {
        \"sheetName\": \"Hóa chất\",
        \"rows\": [
          {
            \"productName\": \"Bông viên Fi 20mm M5, Fi 30mm M3, KVT (Danameco, VN) (Mã: VTYT.000003965, Hàm lượng: )\",
            \"unitCode\": \"GRAM\",
            \"batchNo\": \"5204041125\",
            \"quantity\": 3500,
            \"unitCost\": 116,
            \"supplierName\": \"Danameco\"
          },
          {
            \"productName\": \"Băng dính cá nhân (Mã: VTYT.000003845, Hàm lượng: )\",
            \"unitCode\": \"PIECE\",
            \"batchNo\": \"202107\",
            \"quantity\": 38760,
            \"unitCost\": 120,
            \"supplierName\": null
          }
        ]
      }
    ]
  }" | python -m json.tool

echo ""
echo "=== Test 2: Commit (real insert) ==="
curl -s -X POST "$SUPABASE_URL/functions/v1/import-stock-snapshot" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"warehouseId\": \"$WAREHOUSE_ID\",
    \"reportDate\": \"$REPORT_DATE\",
    \"dryRun\": false,
    \"sheets\": [
      {
        \"sheetName\": \"Hóa chất\",
        \"rows\": [
          {
            \"productName\": \"Bông viên Fi 20mm M5 (Mã: VTYT.000003965)\",
            \"unitCode\": \"GRAM\",
            \"batchNo\": \"5204041125\",
            \"quantity\": 3500,
            \"unitCost\": 116
          },
          {
            \"productName\": \"Băng dính cá nhân (Mã: VTYT.000003845)\",
            \"unitCode\": \"PIECE\",
            \"batchNo\": \"202107\",
            \"quantity\": 38760,
            \"unitCost\": 120
          }
        ]
      }
    ]
  }" | python -m json.tool

echo ""
echo "=== Test 3: Re-import (idempotent) ==="
curl -s -X POST "$SUPABASE_URL/functions/v1/import-stock-snapshot" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"warehouseId\": \"$WAREHOUSE_ID\",
    \"reportDate\": \"$REPORT_DATE\",
    \"dryRun\": false,
    \"sheets\": [
      {
        \"sheetName\": \"Hóa chất\",
        \"rows\": [
          {
            \"productName\": \"Bông viên Fi 20mm M5 (Mã: VTYT.000003965)\",
            \"unitCode\": \"GRAM\",
            \"batchNo\": \"5204041125\",
            \"quantity\": 3500,
            \"unitCost\": 116
          }
        ]
      }
    ]
  }" | python -m json.tool

echo ""
echo "=== Verification: query v_stock_levels ==="
curl -s "$SUPABASE_URL/rest/v1/v_stock_levels?warehouse_id=eq.$WAREHOUSE_ID&select=product_id,quantity,batch_no,weighted_avg_cost&limit=10" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" | python -m json.tool

echo ""
echo "✅ All tests complete"
