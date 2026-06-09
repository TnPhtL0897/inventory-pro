# Phase 1: Endpoint Classification

Kết quả phân loại 20 controllers C# (60+ endpoints) sang 3 strategy:
PostgREST / Edge Function / Postgres View.

## Tổng kết
- **PostgREST**: 56 endpoints (CRUD đơn giản, 1 bảng, RLS enforce)
- **Edge Function**: 51 endpoints (workflow, multi-table, business logic)
- **Postgres View**: 0 endpoints (chưa cần — sẽ dùng cho tổng hợp ở Phase 2c)

**Total: 107 endpoints** (1 số controller có nhiều endpoint phụ như `/{id}/approve`, `/{id}/post`)

## Chi tiết theo controller

| Controller | PostgREST | Edge | View |
|---|---|---|---|
| AuthController | 1 (`/auth/me`) | 0 | 0 |
| BranchesController | 5 | 0 | 0 |
| CategoriesController | 5 | 0 | 0 |
| LocationsController | 5 | 0 | 0 |
| UnitsController | 5 | 0 | 0 |
| PartiesController | 6 | 2 (DELETE + add supplier-product) | 0 |
| ProductsController | 2 | 3 (POST/PUT/DELETE) | 0 |
| WarehousesController | 4 | 1 (DELETE) | 0 |
| StockController | 0 | 1 (POST movements) | 2 (GET stock + movements) |
| PurchaseOrdersController | 3 | 5 | 0 |
| PurchaseRequestsController | 3 | 4 | 0 |
| GoodsReceiptsController | 3 | 5 | 0 |
| StockIssuesController | 3 | 4 | 0 |
| StockTransfersController | 3 | 5 | 0 |
| StockTakesController | 3 | 4 | 0 |
| ReplenishmentController | 1 | 2 (preview, run) | 0 |
| BidContractsController | 3 | 3 | 0 |
| BidLotsController | 3 | 5 | 0 |
| BidPackagesController | 3 | 2 (POST, publish) | 0 |
| BidPlansController | 3 | 2 (POST, approve) | 0 |

## Phase 3 - Edge Function list (10 functions)

1. `auth-me` — GET user info from JWT
2. `purchase-orders` — POST/PUT/approve/post/cancel
3. `purchase-requests` — POST/PUT/submit/approve
4. `goods-receipts` — POST/PUT/post/cancel (ghi stock_movements)
5. `stock-issues` — POST/PUT/post/cancel (ghi stock_movements)
6. `stock-transfers` — POST/PUT/ship/receive/cancel (ghi stock_movements)
7. `stock-takes` — POST/counts/post/cancel (snapshot + ADJUST)
8. `replenishment` — preview/run (tính forecast)
9. `bid-contracts` — POST/PUT/terminate
10. `bid-lots` — POST/PUT/publish/bidders/award

## Phase 2c - View list (2 views)

1. `v_stock_levels` — aggregate stock per (product, warehouse)
2. `v_stock_movements_history` — JOIN movements + products
