-- =============================================================================
-- Migration 0009: Patch - thêm idempotency_key cho goods_receipt_lines
-- Để dùng lại cho stock_movements lúc GRN POSTED (idempotent retry-safe).
-- =============================================================================

ALTER TABLE goods_receipt_lines
    ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Backfill: cho các GRN đã POSTED, set idempotency_key = movement_id
-- (giả định movement_id đã có, idempotency_key lúc đó sẽ được derive)
UPDATE goods_receipt_lines
SET idempotency_key = gen_random_uuid()
WHERE idempotency_key IS NULL;

-- Sau này idempotency_key sẽ set lúc tạo GRN (từ request idempotency_keys[]).
-- Không enforce NOT NULL ở DB để tương thích với data cũ; .NET sẽ fallback Guid.NewGuid().

COMMENT ON COLUMN goods_receipt_lines.idempotency_key IS 'Idempotency key do client cung cấp, dùng cho stock_movements lúc POSTED để retry an toàn.';
