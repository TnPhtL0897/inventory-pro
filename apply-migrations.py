"""
Apply Khoa XN migrations qua psycopg2 (Direct DB connection).
Tự động chạy các file theo thứ tự, bỏ qua file test scenarios.
"""
import os
import sys
import time
import psycopg2
from pathlib import Path

# Lấy DB URL từ env
db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    print("ERROR: Set SUPABASE_DB_URL env var first")
    print('  $env:SUPABASE_DB_URL = "postgresql://postgres:PASS@db.xxx.supabase.co:5432/postgres"')
    sys.exit(1)

# Danh sách file theo thứ tự (bỏ test scenarios)
MIGRATIONS = [
    # Module 1
    "20260614120000_khoa_xn_warehouse_role.sql",
    "20260614130000_khoa_xn_product_group.sql",
    "20260614140000_khoa_xn_helper_functions.sql",
    "20260614150000_update_rls_for_khoa_xn.sql",
    # Module 2
    "20260615090000_khoa_xn_lots.sql",
    "20260615100000_khoa_xn_open_vial_recall.sql",
    "20260615110000_khoa_xn_disposal_alerts.sql",
    "20260615120000_khoa_xn_lot_functions.sql",
    "20260615130000_khoa_xn_cron_schedules.sql",
    # Module 3
    "20260616080000_khoa_xn_replenishment_runs.sql",
    "20260616090000_khoa_xn_replenishment_functions.sql",
    # Module 4
    "20260617090000_khoa_xn_stocktake.sql",
]

migrations_dir = Path("supabase/migrations")

print(f"Connecting to DB...")
try:
    conn = psycopg2.connect(db_url, connect_timeout=30)
    conn.autocommit = True
    cur = conn.cursor()
    print(f"  ✓ Connected")
except Exception as e:
    print(f"  ✗ Failed: {e}")
    sys.exit(1)

print(f"\nApplying {len(MIGRATIONS)} migrations...")
print("=" * 70)

success_count = 0
failed = []

for i, filename in enumerate(MIGRATIONS, 1):
    filepath = migrations_dir / filename
    if not filepath.exists():
        print(f"[{i}/{len(MIGRATIONS)}] SKIP (not found): {filename}")
        continue

    print(f"[{i}/{len(MIGRATIONS)}] Applying: {filename} ...", end=" ", flush=True)
    start = time.time()

    try:
        sql = filepath.read_text(encoding="utf-8")
        cur.execute(sql)
        elapsed = time.time() - start
        print(f"OK ({elapsed:.1f}s)")
        success_count += 1
    except Exception as e:
        elapsed = time.time() - start
        print(f"FAIL ({elapsed:.1f}s)")
        # In lỗi đầy đủ
        err_msg = str(e).strip()
        print(f"  Error: {err_msg[:500]}")
        failed.append((filename, err_msg))

print("=" * 70)
print(f"\nResult: {success_count}/{len(MIGRATIONS)} succeeded")
if failed:
    print(f"\nFailed files:")
    for fname, err in failed:
        print(f"  ✗ {fname}")
        print(f"    {err[:200]}")

cur.close()
conn.close()
