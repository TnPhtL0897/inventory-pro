-- =============================================================================
-- Migration 0007: Phân loại kho chẵn / kho lẻ (warehouse_type)
-- RECEIVING: kho nhận hàng từ NCC (GRN).    Không cho phép Issue.
-- ISSUE:     kho sử dụng nội bộ (Issue).    Không cho phép GRN.
-- Mỗi kho có đúng 1 loại, NOT NULL.
-- =============================================================================

-- =============================================================================
-- ENUM
-- =============================================================================
CREATE TYPE warehouse_type AS ENUM (
    'RECEIVING',    -- Kho chẵn: nhận hàng từ nhà cung cấp (qua GRN)
    'ISSUE'         -- Kho lẻ: sử dụng nội bộ (qua phiếu xuất Issue)
);

-- =============================================================================
-- ALTER TABLE: thêm cột warehouse_type
-- DEFAULT 'RECEIVING' để INSERT cũ (nếu có) không vỡ; sẽ DROP DEFAULT sau backfill.
-- =============================================================================
ALTER TABLE warehouses
    ADD COLUMN warehouse_type warehouse_type NOT NULL DEFAULT 'RECEIVING';

-- =============================================================================
-- BACKFILL: kho is_default=TRUE → RECEIVING, còn lại → ISSUE
-- Thứ tự: claim RECEIVING trước để tránh ghi đè khi cả 2 điều kiện chạy.
-- =============================================================================
UPDATE warehouses
SET warehouse_type = 'RECEIVING'
WHERE is_default = TRUE;

UPDATE warehouses
SET warehouse_type = 'ISSUE'
WHERE is_default = FALSE;

-- Sau backfill: drop default, buộc app phải gửi type rõ ràng (enforce ở API layer).
ALTER TABLE warehouses
    ALTER COLUMN warehouse_type DROP DEFAULT;

-- =============================================================================
-- INDEX: hỗ trợ filter (branch_id, warehouse_type) trong dropdown GRN/Issue.
-- =============================================================================
CREATE INDEX idx_warehouses_branch_type
    ON warehouses(branch_id, warehouse_type)
    WHERE status = 'ACTIVE';

-- =============================================================================
-- RPC SAFETY NET: trong record_stock_movement, reject nếu warehouse_type
-- không phù hợp với movement_type. Đây là tuyến phòng thủ cuối cùng nếu
-- ai đó bypass API (direct SQL, service-role migration, batch import).
-- =============================================================================
CREATE OR REPLACE FUNCTION record_stock_movement(
    p_branch_id      UUID,
    p_warehouse_id   UUID,
    p_location_id    UUID,
    p_product_id     UUID,
    p_unit_id        UUID,
    p_movement_type  stock_movement_type,
    p_quantity       NUMERIC,
    p_unit_cost      NUMERIC DEFAULT NULL,
    p_ref_type       stock_reference_type DEFAULT 'MANUAL',
    p_ref_id         UUID DEFAULT NULL,
    p_ref_line_id    UUID DEFAULT NULL,
    p_notes          TEXT DEFAULT NULL,
    p_batch_no       VARCHAR DEFAULT NULL,
    p_serial_no      VARCHAR DEFAULT NULL,
    p_expiry_date    DATE DEFAULT NULL,
    p_idempotency_key UUID DEFAULT NULL
)
RETURNS stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID := auth_tenant_id();
    v_result stock_movements;
    v_idempotency_key UUID := COALESCE(p_idempotency_key, uuid_generate_v4());
    v_warehouse_type warehouse_type;
BEGIN
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Missing tenant_id in JWT claims';
    END IF;

    IF p_quantity IS NULL OR p_quantity = 0 THEN
        RAISE EXCEPTION 'Quantity must be non-zero';
    END IF;

    -- Business rule: warehouse_type phải phù hợp với movement_type
    -- (kho chẵn → IN/TRANSFER_IN, kho lẻ → OUT/TRANSFER_OUT)
    SELECT warehouse_type INTO v_warehouse_type
    FROM warehouses
    WHERE id = p_warehouse_id
      AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Warehouse % không tồn tại trong tenant', p_warehouse_id;
    END IF;

    IF p_movement_type IN ('IN', 'TRANSFER_IN', 'ADJUST_IN', 'RETURN_IN') THEN
        IF v_warehouse_type <> 'RECEIVING' THEN
            RAISE EXCEPTION 'Kho này là kho lẻ (ISSUE), không thể ghi movement %. Kho chỉ cho phép OUT/TRANSFER_OUT/ADJUST_OUT/RETURN_OUT.', p_movement_type
              USING ERRCODE = '23514';
        END IF;
    ELSIF p_movement_type IN ('OUT', 'TRANSFER_OUT', 'ADJUST_OUT', 'RETURN_OUT') THEN
        IF v_warehouse_type <> 'ISSUE' THEN
            RAISE EXCEPTION 'Kho này là kho chẵn (RECEIVING), không thể ghi movement %. Kho chỉ cho phép IN/TRANSFER_IN/ADJUST_IN/RETURN_IN.', p_movement_type
              USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Idempotency: nếu key đã tồn tại cho tenant này, trả về row cũ
    SELECT * INTO v_result
    FROM stock_movements
    WHERE tenant_id = v_tenant_id
      AND idempotency_key = v_idempotency_key;

    IF FOUND THEN
        RETURN v_result;
    END IF;

    INSERT INTO stock_movements (
        tenant_id, branch_id, warehouse_id, location_id, product_id, unit_id,
        movement_type, quantity, unit_cost, ref_type, ref_id, ref_line_id,
        notes, batch_no, serial_no, expiry_date, idempotency_key, created_by
    )
    VALUES (
        v_tenant_id, p_branch_id, p_warehouse_id, p_location_id, p_product_id, p_unit_id,
        p_movement_type, p_quantity, p_unit_cost, p_ref_type, p_ref_id, p_ref_line_id,
        p_notes, p_batch_no, p_serial_no, p_expiry_date, v_idempotency_key, auth.uid()
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION record_stock_movement IS
    'Ghi 1 stock movement. Idempotent qua idempotency_key. Trigger tự apply vào stock. '
    'Từ 0007: enforce warehouse_type ↔ movement_type (RECEIVING ↔ IN, ISSUE ↔ OUT).';

COMMENT ON COLUMN warehouses.warehouse_type IS
    'Loại kho: RECEIVING (kho chẵn - nhận từ NCC) hoặc ISSUE (kho lẻ - xuất nội bộ). '
    'RECEIVING chỉ cho GRN, ISSUE chỉ cho phiếu xuất.';
