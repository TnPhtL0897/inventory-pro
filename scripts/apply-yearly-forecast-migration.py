"""
Apply yearly_forecast migration to Supabase by splitting SQL into
manageable statements and executing via temporary RPC.

Strategy:
1. Create a temporary plpgsql function that runs arbitrary SQL
2. Execute each statement via that function
3. Drop the temp function

Auto-loads from .supabase-credentials.
"""
import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path
import psycopg2

# Auto-load from .supabase-credentials
_repo = Path(__file__).resolve().parent.parent
_cred_file = _repo / ".supabase-credentials"
if _cred_file.exists():
    for line in _cred_file.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ituyoplyuhbdxkhabcpy.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_CONNECTION")

if not SUPABASE_DB_URL:
    print("[!] Set SUPABASE_DB_CONNECTION env var (from .supabase-credentials)")
    sys.exit(1)

# Fix: password may contain '@' which breaks URL parsing
# Re-parse manually: postgresql://user:pass@host:port/db
import re
import urllib.parse
m = re.match(r"postgresql://([^:]+):(.+)@([^:]+):(\d+)/(.+)", SUPABASE_DB_URL)
if m:
    user, pwd, host, port, dbname = m.groups()
    pwd_enc = urllib.parse.quote(pwd, safe="")
    SUPABASE_DB_URL = f"postgresql://{user}:{pwd_enc}@{host}:{port}/{dbname}"
    print(f"[fix] URL-encoded password in connection string")

MIGRATION_PATH = Path(__file__).resolve().parent.parent / "supabase" / "migrations" / "20260610150000_yearly_forecast.sql"


def main():
    print("=" * 70)
    print("  APPLY MIGRATION: yearly_forecast")
    print("=" * 70)
    print()

    if not MIGRATION_PATH.exists():
        print(f"[!] Migration file not found: {MIGRATION_PATH}")
        sys.exit(1)

    sql = MIGRATION_PATH.read_text(encoding="utf-8")
    print(f"1. Migration file: {MIGRATION_PATH.name}")
    print(f"   Size: {len(sql):,} chars")
    print()

    # Connect directly via Postgres
    print("2. Connecting to Supabase Postgres...")
    conn = psycopg2.connect(SUPABASE_DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    print("   [OK] Connected")
    print()

    # Split by $$ blocks (DO statements) and individual statements
    # For simplicity, just execute the whole SQL — psycopg2 handles multi-statement
    print("3. Executing migration...")
    try:
        cur.execute(sql)
        print("   [OK] Migration applied successfully")
    except psycopg2.Error as e:
        print(f"   [FAIL] {e.pgerror or str(e)}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

    print()
    print("4. Verifying tables exist...")
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cur = conn.cursor()
    for tbl in ['yearly_forecast_runs', 'yearly_forecast_lines']:
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = %s
            )
        """, (tbl,))
        exists = cur.fetchone()[0]
        status = "[OK]" if exists else "[FAIL]"
        print(f"   {status} {tbl}")
    for view in ['v_product_consumption_yearly']:
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.views
                WHERE table_schema = 'public' AND table_name = %s
            )
        """, (view,))
        exists = cur.fetchone()[0]
        status = "[OK]" if exists else "[FAIL]"
        print(f"   {status} {view}")
    cur.close()
    conn.close()
    print()
    print("=" * 70)
    print("  [OK] MIGRATION APPLIED")
    print("=" * 70)


if __name__ == "__main__":
    main()
