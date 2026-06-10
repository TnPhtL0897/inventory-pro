"""
End-to-end bootstrap: setup test data + parse Excel + call edge function.

Steps:
1. Read BaoCaoTonKho Excel
2. Connect to Supabase via REST (avoid service_role in Python)
3. Use existing tenant from supabase (or create one)
4. Insert all 53 products via PostgREST
5. Call import-stock-snapshot edge function with dryRun=false
6. Verify v_stock_levels

Run: python scripts/bootstrap-stock-snapshot.py
(Credentials auto-loaded from .supabase-credentials in repo root.)
"""
import os
import sys
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
import pandas as pd
import datetime
import uuid

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
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_SERVICE_ROLE_KEY:
    print("[!] Set SUPABASE_SERVICE_ROLE_KEY env var")
    sys.exit(1)

EXCEL_PATH = "C:/Users/HAPPY/Downloads/Copy of BaoCaoTonKho_20260610142711.xlsx"
REPORT_DATE = "2026-06-10"  # match file timestamp prefix


def rest(method, path, body=None):
    from urllib.parse import quote
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
        print(f"❌ {method} {path} → {e.code}: {e.read().decode()[:300]}")
        raise


def rest_function(name, body):
    url = f"{SUPABASE_URL}/functions/v1/{name}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"❌ POST /functions/v1/{name} → {e.code}: {e.read().decode()[:500]}")
        raise


def extract_sku(name: str) -> str | None:
    if not name:
        return None
    m = re.search(r"M[ãa]\s*:\s*([A-Z0-9][A-Z0-9.\-_]+)", name)
    return m.group(1) if m else None


def map_unit(dvt: str) -> str:
    """Map Vietnamese unit name → DB unit code (Vietnamese with diacritics).
    Falls back to "CÁI" (PCS equivalent) for unknowns.
    """
    if not dvt:
        return "CÁI"
    norm = dvt.strip()
    # Direct match (case-sensitive - DB uses TV with diacritics)
    table = {
        "Cái": "CÁI", "cái": "CÁI", "cai": "CÁI", "Chiếc": "CÁI", "chiếc": "CÁI",
        "Gram": "G", "g": "G",
        "Lọ": "LÍT", "lọ": "LÍT", "Chai": "LÍT", "chai": "LÍT",  # approximate (no BOTTLE)
        "Ống": "ML", "ống": "ML",
        "Lít": "LÍT", "lít": "LÍT", "lit": "LÍT", "L": "LÍT", "ml": "ML", "ML": "ML",
        "Hộp": "HỘP", "hộp": "HỘP",
        "Miếng": "CÁI", "miếng": "CÁI",  # no PIECE - fallback to CÁI
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
    print("  PHASE 6C — END-TO-END BOOTSTRAP STOCK SNAPSHOT")
    print("=" * 70)
    print()

    # 1. Read Excel
    print("1. Reading Excel file...")
    df = pd.read_excel(EXCEL_PATH, sheet_name="Sheet1", header=None)
    # Filter valid rows: STT column is numeric and > 0
    valid_rows = []
    for i, row in df.iterrows():
        if i < 5:  # skip headers
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
        # Extract data
        product_name = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ""
        dvt = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ""
        batch_no = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else None
        supplier = str(row.iloc[4]).strip() if pd.notna(row.iloc[4]) else None
        unit_cost = float(row.iloc[6]) if pd.notna(row.iloc[6]) else 0
        quantity = float(row.iloc[8]) if pd.notna(row.iloc[8]) else 0
        sku = extract_sku(product_name)
        if not sku:
            print(f"   ⚠ Row {i}: no SKU found, skipping: {product_name[:50]}")
            continue
        unit_code = map_unit(dvt)
        valid_rows.append({
            "sku": sku,
            "productName": product_name,
            "unitCode": unit_code,
            "batchNo": batch_no if batch_no and batch_no != "nan" else None,
            "quantity": quantity,
            "unitCost": unit_cost,
            "supplierName": supplier if supplier and supplier != "nan" else None,
        })
    print(f"   ✓ Parsed {len(valid_rows)} valid rows")
    unique_skus = sorted({r["sku"] for r in valid_rows})
    print(f"   ✓ Unique SKUs: {len(unique_skus)}")
    for sku in unique_skus[:5]:
        print(f"      - {sku}")
    if len(unique_skus) > 5:
        print(f"      ... +{len(unique_skus) - 5} more")
    print()

    # 2. Get existing tenant + branch
    print("2. Looking up tenant/branch...")
    tenants = rest("GET", "tenants?select=id,name,slug&limit=1")
    if not tenants:
        print("   ❌ No tenant found in DB")
        sys.exit(1)
    tenant_id = tenants[0]["id"]
    print(f"   ✓ Tenant: {tenants[0]['name']} ({tenants[0].get('slug','')}) [{tenant_id}]")

    branches = rest("GET", f"branches?tenant_id=eq.{tenant_id}&select=id,name,code&limit=1")
    if not branches:
        print("   ❌ No branch found")
        sys.exit(1)
    branch_id = branches[0]["id"]
    print(f"   ✓ Branch: {branches[0]['name']} ({branches[0]['code']}) [{branch_id}]")

    # 3. Get or create test warehouse (schema thật: type, status, code, name, is_default, allow_negative, tenant_id, branch_id)
    print("3. Setting up warehouse...")
    wh_code = "WH-SNAPSHOT"
    existing_wh = rest("GET", f"warehouses?tenant_id=eq.{tenant_id}&code=eq.{wh_code}&select=id,code,name")
    if existing_wh:
        warehouse_id = existing_wh[0]["id"]
        print(f"   ✓ Warehouse (existing): {existing_wh[0]['code']} - {existing_wh[0]['name']} [{warehouse_id}]")
    else:
        new_wh = rest("POST", "warehouses", {
            "tenant_id": tenant_id,
            "branch_id": branch_id,
            "code": wh_code,
            "name": "Tủ trực Huyết học (Bootstrap)",
            "is_default": True,
            "allow_negative": False,
        })
        warehouse_id = new_wh[0]["id"]
        print(f"   ✓ Warehouse (created): {new_wh[0]['code']} - {new_wh[0]['name']} [{warehouse_id}]")
    print()

    # 4. Get or create MAIN location
    print("4. Setting up MAIN location...")
    existing_loc = rest("GET", f"locations?warehouse_id=eq.{warehouse_id}&code=eq.MAIN&select=id,code,name")
    if existing_loc:
        location_id = existing_loc[0]["id"]
        print(f"   ✓ Location (existing): MAIN - {existing_loc[0]['name']} [{location_id}]")
    else:
        new_loc = rest("POST", "locations", {
            "tenant_id": tenant_id,
            "branch_id": branch_id,
            "warehouse_id": warehouse_id,
            "code": "MAIN",
            "name": "Main Storage",
            "location_type": "STORAGE",
            "is_active": True,
        })
        location_id = new_loc[0]["id"]
        print(f"   ✓ Location (created): MAIN - {new_loc[0]['name']} [{location_id}]")
    print()

    # 5. Get CÁI unit (existing)
    print("5. Looking up units_of_measure...")
    cai = rest("GET", f"units_of_measure?tenant_id=eq.{tenant_id}&code=eq.CÁI&select=id,code,name&limit=1")
    if not cai:
        print("   ❌ CÁI unit not found - seed it first")
        sys.exit(1)
    unit_id = cai[0]["id"]
    print(f"   ✓ Unit CÁI: {cai[0]['name']} [{unit_id}]")
    print()

    # 6. Create all 32 unique products (from 53 rows in Excel)
    print(f"6. Creating {len(unique_skus)} products (from 53 rows)...")
    existing_products = rest("GET", f"products?tenant_id=eq.{tenant_id}&select=id,sku")
    existing_skus = {p["sku"] for p in existing_products} if existing_products else set()
    print(f"   Existing products: {len(existing_skus)}")
    to_create = [sku for sku in unique_skus if sku not in existing_skus]
    print(f"   To create: {len(to_create)}")

    if to_create:
        product_rows = []
        for sku in to_create:
            first = next((r for r in valid_rows if r["sku"] == sku), None)
            if not first:
                continue
            # Strip Mã: from name to clean up display
            clean_name = re.sub(r"\s*\(M[ãa]\s*:[^)]+\)", "", first["productName"]).strip()
            product_rows.append({
                "tenant_id": tenant_id,
                "sku": sku,
                "name": clean_name[:200] or sku,
                "base_unit_id": unit_id,
                "product_type": "GOODS",
                "cost_price": first["unitCost"] or 0,
                "sell_price": round((first["unitCost"] or 0) * 1.3, 2),
                "is_batch_tracked": True,
                "min_stock": 0,
                })
        for i in range(0, len(product_rows), 100):
            chunk = product_rows[i:i+100]
            rest("POST", "products", chunk)
        print(f"   ✓ Created {len(product_rows)} products")

    products_now = rest("GET", f"products?tenant_id=eq.{tenant_id}&select=id,sku")
    products_map = {p["sku"]: p["id"] for p in products_now}
    print(f"   ✓ Total products in DB: {len(products_map)}")
    print()

    # 6. Build payload for edge function
    print("6. Building edge function payload...")
    sheet_rows = [
        {
            "productName": r["productName"],
            "sku": r["sku"],
            "unitCode": r["unitCode"],
            "batchNo": r["batchNo"],
            "quantity": r["quantity"],
            "unitCost": r["unitCost"],
            "supplierName": r["supplierName"],
        }
        for r in valid_rows
    ]
    payload = {
        "warehouseId": warehouse_id,
        "reportDate": REPORT_DATE,
        "dryRun": False,
        "locationId": location_id,
        "tenantId": tenant_id,  # for service_role bypass
        "sheets": [{"sheetName": "Sheet1", "rows": sheet_rows}],
    }
    print(f"   ✓ Payload: {len(sheet_rows)} rows, 1 sheet")
    print()

    # 7. Create GRN document (since record_stock_movement RPC doesn't exist in production)
    #    Production uses view-based aggregation from goods_receipts/...
    print("7. Creating supplier party for GRN (if needed)...")
    party = rest("GET", f"parties?tenant_id=eq.{tenant_id}&code=eq.SNAPSHOT-IMPORT&select=id,code,name")
    if party:
        party_id = party[0]["id"]
        print(f"   ✓ Party (existing): {party[0]['code']} [{party_id}]")
    else:
        new_party = rest("POST", "parties", {
            "tenant_id": tenant_id,
            "code": "SNAPSHOT-IMPORT",
            "name": "Snapshot Import (Bootstrap)",
            "party_type": "SUPPLIER",
        })
        party_id = new_party[0]["id"]
        print(f"   ✓ Party (created): {new_party[0]['code']} [{party_id}]")
    print()

    # 8. Generate unique grn_number
    grn_number = f"GRN-SNAPSHOT-{REPORT_DATE.replace('-', '')}-{datetime.datetime.now().strftime('%H%M%S')}"
    print(f"8. Creating GRN header: {grn_number}")
    grn = rest("POST", "goods_receipts", {
        "tenant_id": tenant_id,
        "branch_id": branch_id,
        "warehouse_id": warehouse_id,
        "grn_number": grn_number,
        "party_id": party_id,
        "receipt_date": REPORT_DATE,
        "status": "POSTED",
        "notes": f"Bootstrap stock snapshot từ file BaoCaoTonKho_20260610142711.xlsx ({len(valid_rows)} dòng)",
        "posted_at": f"{REPORT_DATE}T08:00:00Z",
    })
    grn_id = grn[0]["id"]
    print(f"   ✓ GRN id: {grn_id}")
    print()

    # 9. Insert 53 goods_receipt_lines
    print(f"9. Creating {len(valid_rows)} goods_receipt_lines...")
    line_rows = []
    for idx, r in enumerate(valid_rows, start=1):
        pid = products_map.get(r["sku"])
        if not pid:
            print(f"   ⚠ SKU {r['sku']} not found in products_map")
            continue
        line_rows.append({
            "tenant_id": tenant_id,
            "goods_receipt_id": grn_id,
            "line_no": idx,
            "product_id": pid,
            "unit_id": unit_id,
            "location_id": location_id,
            "product_name": r["productName"][:200],
            "unit_code": r["unitCode"],
            "quantity": r["quantity"],
            "unit_cost": r["unitCost"] or 0,
            "batch_no": r["batchNo"],
            "notes": f"Bootstrap từ BaoCaoTonKho dòng {idx} (NCC: {r['supplierName'] or 'N/A'})",
            "idempotency_key": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{grn_id}-{idx}")),
        })
    for i in range(0, len(line_rows), 100):
        chunk = line_rows[i:i+100]
        rest("POST", "goods_receipt_lines", chunk)
    print(f"   ✓ Created {len(line_rows)} lines")
    print()

    # 10. Verify v_stock_levels
    print("10. Verifying v_stock_levels...")
    levels = rest(
        "GET",
        f"v_stock_levels?warehouse_id=eq.{warehouse_id}&select=product_id,on_hand_qty,weighted_avg_cost,batch_no&limit=100",
    )
    print(f"   Found {len(levels)} stock level rows")
    if levels:
        total_qty = sum(float(l["on_hand_qty"]) for l in levels)
        print(f"   Total on-hand qty: {total_qty:,.0f}")
        for lvl in levels[:3]:
            sku = next((s for s, pid in products_map.items() if pid == lvl["product_id"]), "?")
            print(f"      • {sku}: qty={lvl['on_hand_qty']}, batch={lvl['batch_no']}, avg_cost={lvl['weighted_avg_cost']}")
    print()

    # 11. Summary
    print("11. Summary")
    print(f"    GRN: {grn_number} ({grn_id})")
    print(f"    Products in DB: {len(products_map)}")
    print(f"    Lines created: {len(line_rows)}")
    print(f"    Stock levels visible: {len(levels)}")
    print()

    print("=" * 70)
    print("  ✅ BOOTSTRAP COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
