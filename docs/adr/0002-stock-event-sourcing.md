# ADR-0002: Stock tracking với event-sourcing

## Status
Accepted — 2026-06-06

## Context
Tồn kho là dữ liệu critical. Mọi thay đổi phải audit được (ai, khi nào, bao nhiêu,
lý do gì). Đồng thời cần query nhanh tồn hiện tại và tính tổng theo kỳ.

## Options considered

### Option 1: Chỉ lưu `stock.quantity`, UPDATE trực tiếp
- Đơn giản, hiệu năng tốt cho read.
- ❌ Mất lịch sử. Không biết tại sao tồn lại là X.
- ❌ Audit trail khó, phải trigger.

### Option 2: Event-sourcing với `stock_movements` (chosen)
- Mọi thay đổi tồn = 1 row trong `stock_movements` (append-only).
- Bảng `stock` là materialized view của tổng movements.
- ✅ Audit trail tự nhiên.
- ✅ Tính tồn tại bất kỳ thời điểm nào (snapshot query).
- ✅ Debug dễ: xem movements cho 1 product.
- ⚠️ Có concurrent update hazard → dùng optimistic locking + isolation level.
- ⚠️ Bảng movements phình nhanh → partition theo tháng, archive sau 2 năm.

### Option 3: Hybrid
- Lưu movements + cache aggregations.
- Phức tạp, không cần thiết cho MVP.

## Decision
**Option 2**: Event-sourcing với materialized stock.

### Schema:
```sql
CREATE TABLE stock_movements (
    id BIGSERIAL,
    tenant_id UUID,
    branch_id UUID,
    product_id UUID,
    warehouse_id UUID,
    location_id UUID,
    movement_type VARCHAR,  -- IN, OUT, TRANSFER_IN, TRANSFER_OUT, ADJUST_IN, ADJUST_OUT
    quantity NUMERIC(18,4) NOT NULL,  -- signed: +IN, -OUT
    unit_cost NUMERIC(18,2),
    ref_type VARCHAR,  -- PO, GRN, ISSUE, TRANSFER, STOCK_TAKE
    ref_id UUID,
    idempotency_key UUID UNIQUE,  -- chống duplicate
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE stock (
    tenant_id UUID,
    branch_id UUID,
    product_id UUID,
    warehouse_id UUID,
    location_id UUID,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity >= 0),
    avg_cost NUMERIC(18,2),
    last_movement_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 0,  -- optimistic locking
    PRIMARY KEY (branch_id, product_id, warehouse_id, location_id)
);
```

### Concurrency:
- Movements ghi qua transaction Serializable hoặc Optimistic locking.
- Trigger tự động UPSERT `stock` khi insert movement.
- Check `quantity >= 0` ở DB level (không cho phép âm).

### Idempotency:
- Mỗi write operation phải có `Idempotency-Key` (UUID từ client).
- Unique constraint trên `stock_movements.idempotency_key`.
- Middleware cache response 24h theo key.

## Consequences
- Báo cáo "tồn tại thời điểm X" chỉ cần `SUM(quantity)` movements trước X.
- Movements append-only: revoke UPDATE/DELETE từ app role.
- Partition theo tháng: drop cũ khi cần giải phóng dung lượng.
- Materialized views cho reports nặng.
