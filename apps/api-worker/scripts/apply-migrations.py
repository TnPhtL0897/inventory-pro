#!/usr/bin/env python3
"""Apply all migrations to Supabase via Worker admin endpoint."""
import os
import sys
import json
import urllib.request
import urllib.error

WORKER_URL = "https://quankho-api.letanphatptt.workers.dev"
KEY = "MIGRATE_2026_06_21"
MIG_DIR = r"D:\Tự động hóa\Quản kho vật tư Pro\supabase\migrations"

# Skip test scenarios
SKIP_PATTERNS = ["9999999"]

def main():
    files = sorted(f for f in os.listdir(MIG_DIR) if f.endswith(".sql"))
    files = [f for f in files if not any(p in f for p in SKIP_PATTERNS)]

    print(f"Found {len(files)} migration files")

    success = 0
    failed = 0
    for f in files:
        path = os.path.join(MIG_DIR, f)
        with open(path, "r", encoding="utf-8") as fp:
            sql = fp.read()

        print(f"  [{success + failed + 1}/{len(files)}] {f}...", end=" ", flush=True)
        payload = json.dumps({"key": KEY, "sql": sql}).encode("utf-8")
        req = urllib.request.Request(
            f"{WORKER_URL}/admin/migrate",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Quankho-Migration-Tool)",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read().decode("utf-8")
                data = json.loads(body) if body else {}
                if resp.status == 200 and data.get("success"):
                    print("OK")
                    success += 1
                else:
                    print(f"FAIL ({resp.status}): {data.get('message', body[:100])}")
                    failed += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")[:200]
            print(f"HTTP {e.code}: {body}")
            failed += 1
        except Exception as e:
            print(f"ERR: {e}")
            failed += 1

    print(f"\nDone. {success} success, {failed} failed.")
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
