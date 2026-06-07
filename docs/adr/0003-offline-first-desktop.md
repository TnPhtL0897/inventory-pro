# ADR-0003: Offline-first cho WPF Desktop

## Status
Accepted — 2026-06-06

## Context
WPF desktop app chạy ở kho, mạng không ổn định. Nhân viên cần:
- Scan QR, tạo phiếu ngay cả khi mất mạng.
- Đảm bảo không mất dữ liệu khi crash, mất điện.
- Khi online thì sync lên server.

## Decision
**Outbox pattern + local SQLite + server-arbitrated merge cho stock**.

### Kiến trúc:
1. **Local DB (SQLite)**: cache dữ liệu thường dùng (products, UOMs, warehouses).
   Local stock snapshot từ server mỗi 5 phút (online).
2. **Outbox table**: mỗi write local → INSERT event vào outbox trước.
   Sau đó mới thực hiện mutation.
3. **Sync engine**: background worker
   - Check mạng mỗi 30s.
   - Online: `POST /api/sync/push` với batch outbox events.
   - Server xử lý từng event, trả về kết quả (success/conflict).
4. **Pull updates**: `GET /api/sync/pull?since=<last_sync_at>` để cập nhật catalog.

### Conflict resolution:
- **Stock movements**: server-arbitrated.
  - Server là source of truth. Client gửi intent, server xử lý.
  - Idempotency-Key chống duplicate.
  - Conflict hiếm (vì client gửi theo version product). Nếu có, server trả về
    current stock, client UI hiển thị cho user resolve.
- **Catalog (products, UOMs)**: Last-Write-Wins.
  - So sánh `updated_at`, cái nào mới hơn thắng.
- **Documents (PO, GRN, etc.)**: server-arbitrated.
  - Status transition rõ ràng (DRAFT → SUBMITTED → APPROVED).
  - Mỗi document có version, server kiểm tra.

### Crash recovery:
- SQLite với WAL mode.
- Mỗi transaction = 1 write vào outbox + mutation.
- Nếu crash giữa chừng: SQLite ACID đảm bảo hoặc cả 2 hoặc không cái nào.
- Khi mở lại: đọc outbox, retry push.

### UI feedback:
- Hiển thị badge "Offline" + số events chờ sync.
- Toast "Synced 5 events" khi sync thành công.
- Conflict report dialog cho user review.

## Consequences
- Cần thiết kế API sync phù hợp (push events batch, pull updates incremental).
- Local DB phải nhỏ gọn (cache subset, không mirror full).
- Background worker chiếm resource nhẹ (ưu tiên thấp).
