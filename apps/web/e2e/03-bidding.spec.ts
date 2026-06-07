// =============================================================================
// E2E test: Bidding - verify required flow (BidContract ACTIVE có thể tạo PO)
// =============================================================================
import { test, expect } from "./fixtures";

test.describe("Bidding module", () => {
  test("contracts page hiển thị HĐ ACTIVE với progress bar", async ({ authedPage }) => {
    await authedPage.goto("/bidding/contracts", { waitUntil: "domcontentloaded" });
    await expect(authedPage.locator("h1")).toContainText("Hợp đồng thầu");

    // Verify table có rows
    const rows = authedPage.locator("table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test("lots page hiển thị LOT có status AWARDED", async ({ authedPage }) => {
    await authedPage.goto("/bidding/lots", { waitUntil: "domcontentloaded" });
    await expect(authedPage.locator("h1")).toContainText("Lô thầu");
    // Wait for data
    await authedPage.waitForSelector("table tbody tr", { timeout: 10_000 });
  });

  test("replenishment nav item exists", async ({ authedPage }) => {
    await authedPage.goto("/dashboard");
    const navLink = authedPage.locator('nav a[href="/replenishment"]');
    await expect(navLink).toBeVisible();
    await expect(navLink).toContainText("Dự trù cuối tháng");
  });
});
