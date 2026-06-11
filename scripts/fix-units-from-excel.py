"""
Fix unit_id in products + goods_receipt_lines based on ĐVT from Excel.

Bugs to fix:
1. products.base_unit_id = f3a2c382 (CÁI) for all 32 products - should match ĐVT
2. goods_receipt_lines.unit_id = f3a2c382 (CÁI) for all 53 lines - should match unit_code (G, ML, etc)

Source of truth: BaoCaoTonKho Excel file ĐVT column + map_unit() function.
"""
import os
import sys
import json
import re
import urllib.request
import urllib.error
from urllib.parse import quote
from pathlib import Path
import pandas as pd

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

if not SUPABASE_SERVICE_ROLE_KEY:
    print("[!] Set SUPABASE_SERVICE_ROLE_KEY env var")
    sys.exit(1)

EXCEL_PATH = "C:/Users/HAPPY/Downloads/Copy of BaoCaoTonKho_20260610142711.xlsx"


def rest(method, path, body=None):
    encoded_path = quote(path, safe="/?&=.,")
    url = f"{SUPABASE_URL}/rest/v1/{encoded_path.lstrip('/')}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    req.add_header("Content-Type", "application/json")
    if method == "POST":
        req.add_header("Prefer", "return=representation")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode()) if resp.length != 0 else None
    except urllib.error.HTTPError as e:
        print(f"[!] {method} {path} -> {e.code}: {e.read().decode()[:300]}")
        raise


def extract_sku(name: str) -> str | None:
    if not name:
        return None
    m = re.search(r"M[ãa]\s*:\s*([A-Z0-9][A-Z0-9.\-_]+)", name)
    return m.group(1) if m else None


def map_unit(dvt: str) -> str:
    """Map Vietnamese unit name → DB unit code (Vietnamese with diacritics).
    Same logic as bootstrap-stock-snapshot.py.
    """
    if not dvt:
        return "CÁI"
    norm = dvt.strip()
    table = {
        "Cái": "CÁI", "cái": "CÁI", "cai": "CÁI", "Chiếc": "CÁI", "chiếc": "CÁI",
        "Gram": "G", "g": "G",
        "Lọ": "LÍT", "lọ": "LÍT", "Chai": "LÍT", "chai": "LÍT",
        "Ống": "ML", "ống": "ML",
        "Lít": "LÍT", "lít": "LÍT", "lit": "LÍT", "L": "LÍT", "ml": "ML", "ML": "ML",
        "Hộp": "HỘP", "hộp": "HỘP",
        "Miếng": "CÁI", "miếng": "CÁI",
        "Đôi": "CÁI", "đôi": "CÁI",
        "Túi": "CÁI", "túi": "CÁI",
        "Sợi": "CÁI", "sợi": "CÁI", "Cây": "CÁI", "cây": "CÁI",
        "Gói": "CÁI", "gói": "CÁI",
        "Viên": "CÁI", "viên": "CÁI",
        "Túi (500 cái)": "CÁI",
        "Lít (chai 1 lít)": "LÍT",
    }
    return table.get(norm, "CÁI")


def main():
    print("=" * 70)
    print("  FIX UNITS: products.base_unit_id + goods_receipt_lines.unit_id")
    print("=" * 70)
    print()

    # 1. Load all units
    print("1. Loading units_of_measure...")
    units = rest("GET", "units_of_measure?select=id,code,name")
    units_map = {u["code"]: u["id"] for u in units}
    print(f"   ✓ {len(units_map)} units:")
    for code, uid in units_map.items():
        print(f"      {uid[:8]} → {code}")
    print()

    # 2. Read Excel to get correct ĐVT per SKU
    print("2. Reading Excel file (source of truth)...")
    df = pd.read_excel(EXCEL_PATH, sheet_name="Sheet1", header=None)
    sku_to_dvt = {}
    for i, row in df.iterrows():
        if i < 5:
            continue
        stt = row.iloc[0]
        if pd.isna(stt):
            continue
        try:
            stt_num = int(float(str(stt).strip()))
        except (ValueError, TypeError):
            continue
        if stt_num <= 0:
            continue
        product_name = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ""
        dvt = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ""
        sku = extract_sku(product_name)
        if sku and dvt:
            # Take first occurrence (all rows for same SKU should have same ĐVT)
            if sku not in sku_to_dvt:
                sku_to_dvt[sku] = dvt
    print(f"   ✓ {len(sku_to_dvt)} SKUs with ĐVT mapping")
    print()

    # 3. Get all products + their current base_unit_id
    print("3. Loading products...")
    products = rest("GET", "products?select=id,sku,base_unit_id&sku=like.VTYT.*")
    print(f"   ✓ {len(products)} VTYT products")
    print()

    # 4. Check products needing fix
    print("4. Identifying products needing unit fix...")
    products_to_fix = []
    for p in products:
        sku = p["sku"]
        dvt = sku_to_dvt.get(sku)
        if not dvt:
            print(f"   [!] {sku}: no ĐVT in Excel, skipping")
            continue
        expected_unit_code = map_unit(dvt)
        expected_unit_id = units_map.get(expected_unit_code)
        current_unit_id = p["base_unit_id"]
        if expected_unit_id and expected_unit_id != current_unit_id:
            products_to_fix.append({
                "id": p["id"],
                "sku": sku,
                "dvt": dvt,
                "expected_unit": expected_unit_code,
                "expected_unit_id": expected_unit_id,
                "current_unit_id": current_unit_id,
            })
    print(f"   Products to fix: {len(products_to_fix)}")
    for fix in products_to_fix[:5]:
        cur_code = next((c for c, i in units_map.items() if i == fix["current_unit_id"]), "?")
        print(f"      {fix['sku']}: {cur_code} → {fix['expected_unit']} (ĐVT: {fix['dvt']})")
    if len(products_to_fix) > 5:
        print(f"      ... +{len(products_to_fix) - 5} more")
    print()

    # 5. Update products
    print("5. Updating products.base_unit_id...")
    for fix in products_to_fix:
        try:
            rest("PATCH", f"products?id=eq.{fix['id']}", {"base_unit_id": fix["expected_unit_id"]})
        except Exception as e:
            print(f"   [!] Failed to update {fix['sku']}: {e}")
    print(f"   ✓ Updated {len(products_to_fix)} products")
    print()

    # 6. Get goods_receipt_lines + check unit_id vs unit_code
    print("6. Checking goods_receipt_lines for unit_id consistency...")
    lines = rest("GET", "goods_receipt_lines?select=id,product_id,unit_id,unit_code")
    print(f"   Total lines: {len(lines)}")

    # Map product_id → sku → expected_unit
    pid_to_sku = {p["id"]: p["sku"] for p in products}

    lines_to_fix = []
    for line in lines:
        pid = line["product_id"]
        sku = pid_to_sku.get(pid)
        if not sku:
            continue
        dvt = sku_to_dvt.get(sku)
        if not dvt:
            continue
        expected_unit_code = map_unit(dvt)
        expected_unit_id = units_map.get(expected_unit_code)
        current_unit_id = line["unit_id"]
        if expected_unit_id and expected_unit_id != current_unit_id:
            lines_to_fix.append({
                "id": line["id"],
                "sku": sku,
                "current_unit_id": current_unit_id,
                "expected_unit_id": expected_unit_id,
                "expected_unit_code": expected_unit_code,
                "current_unit_code": line["unit_code"],
            })
    print(f"   Lines to fix: {len(lines_to_fix)}")
    for fix in lines_to_fix[:5]:
        print(f"      {fix['sku']}: unit_id {fix['current_unit_id'][:8]} → {fix['expected_unit_id'][:8]} ({fix['expected_unit_code']})")
    if len(lines_to_fix) > 5:
        print(f"      ... +{len(lines_to_fix) - 5} more")
    print()

    # 7. Update goods_receipt_lines
    print("7. Updating goods_receipt_lines.unit_id...")
    for fix in lines_to_fix:
        try:
            rest("PATCH", f"goods_receipt_lines?id=eq.{fix['id']}", {"unit_id": fix["expected_unit_id"]})
        except Exception as e:
            print(f"   [!] Failed to update line {fix['id']}: {e}")
    print(f"   ✓ Updated {len(lines_to_fix)} lines")
    print()

    # 8. Verify
    print("8. Verifying...")
    products_after = rest("GET", "products?select=sku,base_unit_id&sku=like.VTYT.*&limit=3")
    print("   Sample products after fix:")
    for p in products_after:
        sku = p["sku"]
        unit_code = next((c for c, i in units_map.items() if i == p["base_unit_id"]), "?")
        dvt = sku_to_dvt.get(sku, "?")
        match = "[OK]" if unit_code == map_unit(dvt) else "[MISMATCH]"
        print(f"      {match} {sku}: unit={unit_code}, expected={map_unit(dvt)} (ĐVT: {dvt})")

    lines_after = rest("GET", "goods_receipt_lines?select=unit_id,unit_code&limit=3")
    print("   Sample lines after fix:")
    for l in lines_after:
        unit_code = next((c for c, i in units_map.items() if i == l["unit_id"]), "?")
        match = "[OK]" if unit_code == l["unit_code"] else "[MISMATCH]"
        print(f"      {match} unit_id={unit_code}, unit_code={l['unit_code']}")
    print()

    print("=" * 70)
    print("  [OK] FIX COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
