// =============================================================================
// Smoke test: verify all 16 routes load successfully when authenticated
// =============================================================================
import { test, expect, authedPage as _ } from "./fixtures";
import { test as base } from "@playwright/test";

const ROUTES = [
  { path: "/dashboard", expected: "Tổng quan" },
  { path: "/inventory/products", expected: "Vật tư" },
  { path: "/inventory/stock", expected: "Tồn kho" },
  { path: "/warehouses", expected: "Kho" },
  { path: "/parties", expected: "Đối tác" },
  { path: "/purchase-orders", expected: "Mua hàng" },
  { path: "/goods-receipts", expected: "Nhập kho" },
  { path: "/transfers", expected: "Chuyển kho" },
  { path: "/stock-takes", expected: "Kiểm kê" },
  { path: "/stock-issues", expected: "Phiếu xuất" },
  { path: "/bidding/contracts", expected: "Hợp đồng thầu" },
  { path: "/bidding/plans", expected: "Kế hoạch đấu thầu" },
  { path: "/bidding/lots", expected: "Lô thầu" },
  { path: "/bidding/packages", expected: "Gói thầu" },
  { path: "/bidding/requests", expected: "Dự trù mua sắm" },
  { path: "/replenishment", expected: "Dự trù cuối tháng" },
];

base("smoke: all 16 routes load successfully", async ({ authedPage }) => {
  for (const route of ROUTES) {
    const response = await authedPage.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `Route ${route.path} should return 200`).toBe(200);
    await expect(authedPage.locator("body")).toContainText(route.expected, { timeout: 10_000 });
  }
});
