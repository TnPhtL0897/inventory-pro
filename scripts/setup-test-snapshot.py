"""
Setup test data for stock snapshot import demo.

Steps:
1. Create test tenant
2. Create test branch
3. Create test warehouse + MAIN location
4. Create 3 test products (matching SKUs in BaoCaoTonKho file)
5. Verify

Run: SUPABASE_DB_URL="postgresql://..." python scripts/setup-test-snapshot.py
"""
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor

CONN_STR = os.environ.get("SUPABASE_DB_URL")
if not CONN_STR:
    print("❌ Set SUPABASE_DB_URL env var (e.g. from .supabase-credentials)")
    sys.exit(1)

def main():
    conn = psycopg2.connect(CONN_STR)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("=== Setup test data for stock snapshot demo ===\n")

    # 1. Create test tenant
    print("1. Creating test tenant...")
    cur.execute("""
        INSERT INTO public.tenants (id, code, name, status)
        VALUES ('00000000-0000-0000-0000-000000000099', 'TEST-SNAPSHOT', 'Tenant Test Snapshot', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        RETURNING id, code;
    """)
    tenant = cur.fetchone()
    if tenant:
        print(f"   ✓ Created tenant: {tenant['code']}")
    else:
        cur.execute("SELECT id, code FROM public.tenants WHERE id = '00000000-0000-0000-0000-000000000099'")
        tenant = cur.fetchone()
        print(f"   • Existing tenant: {tenant['code']}")
    tenant_id = tenant['id']

    # 2. Create test branch
    print("2. Creating test branch...")
    cur.execute("""
        INSERT INTO public.branches (id, tenant_id, code, name, is_default, status)
        VALUES ('00000000-0000-0000-0000-000000000098', %s, 'MAIN', 'Main Branch', TRUE, 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        RETURNING id, code;
    """, (tenant_id,))
    branch = cur.fetchone()
    if not branch:
        cur.execute("SELECT id, code FROM public.branches WHERE id = '00000000-0000-0000-0000-000000000098'")
        branch = cur.fetchone()
    branch_id = branch['id']
    print(f"   ✓ Branch: {branch['code']} ({branch_id})")

    # 3. Create test warehouse
    print("3. Creating test warehouse...")
    cur.execute("""
        INSERT INTO public.warehouses (id, tenant_id, branch_id, code, name, is_default, allow_negative, status)
        VALUES ('00000000-0000-0000-0000-000000000097', %s, %s, 'WH-SNAPSHOT', 'Kho Test Snapshot', TRUE, FALSE, 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
        RETURNING id, code;
    """, (tenant_id, branch_id))
    wh = cur.fetchone()
    if not wh:
        cur.execute("SELECT id, code FROM public.warehouses WHERE id = '00000000-0000-0000-0000-000000000097'")
        wh = cur.fetchone()
    warehouse_id = wh['id']
    print(f"   ✓ Warehouse: {wh['code']} ({warehouse_id})")

    # 4. Create MAIN location
    print("4. Creating MAIN location...")
    cur.execute("""
        INSERT INTO public.locations (id, tenant_id, branch_id, warehouse_id, code, name, location_type, status, is_active)
        VALUES ('00000000-0000-0000-0000-000000000096', %s, %s, %s, 'MAIN', 'Main Storage', 'STORAGE', 'ACTIVE', TRUE)
        ON CONFLICT (id) DO NOTHING
        RETURNING id, code;
    """, (tenant_id, branch_id, warehouse_id))
    loc = cur.fetchone()
    if not loc:
        cur.execute("SELECT id, code FROM public.locations WHERE id = '00000000-0000-0000-0000-000000000096'")
        loc = cur.fetchone()
    location_id = loc['id']
    print(f"   ✓ Location: {loc['code']} ({location_id})")

    # 5. Get PCS unit (assumes already seeded)
    cur.execute("SELECT id, code FROM public.units_of_measure WHERE code = 'PCS' AND tenant_id = %s LIMIT 1", (tenant_id,))
    unit = cur.fetchone()
    if not unit:
        print("   ! Unit PCS not found, creating...")
        cur.execute("""
            INSERT INTO public.units_of_measure (tenant_id, code, name, is_base)
            VALUES (%s, 'PCS', 'Cái', TRUE)
            RETURNING id, code;
        """, (tenant_id,))
        unit = cur.fetchone()
    unit_id = unit['id']
    print(f"   ✓ Unit PCS: {unit_id}")

    # 6. Create 3 test products matching SKUs in BaoCaoTonKho file
    print("5. Creating 3 test products (matching BaoCaoTonKho SKUs)...")
    test_products = [
        ("VTYT.000003965", "Bông viên Fi 20mm M5", 116),
        ("VTYT.000003845", "Băng dính cá nhân", 120),
        ("VTYT.000004009", "Bơm tiêm 10ml VIKIMCO", 605),
    ]
    product_ids = []
    for sku, name, cost in test_products:
        cur.execute("""
            INSERT INTO public.products (tenant_id, sku, name, base_unit_id, product_type, cost_price, sell_price, status)
            VALUES (%s, %s, %s, %s, 'GOODS', %s, %s, 'ACTIVE')
            ON CONFLICT (tenant_id, sku) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, sku;
        """, (tenant_id, sku, name, unit_id, cost, cost * 1.3))
        p = cur.fetchone()
        product_ids.append((p['sku'], p['id']))
        print(f"   ✓ {p['sku']} → {p['id']}")

    conn.commit()

    print("\n=== Setup complete ===")
    print(f"warehouseId = '{warehouse_id}'")
    print(f"locationId  = '{location_id}'")
    print(f"branchId    = '{branch_id}'")
    print(f"unitId (PCS)= '{unit_id}'")
    print(f"\nProducts:")
    for sku, pid in product_ids:
        print(f"  {sku} → {pid}")

    cur.close()
    conn.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
