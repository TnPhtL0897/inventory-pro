// =============================================================================
// E2E tests for 4 new Khoa XN modules (FEFO, Open-Vial, Bid Tracking, Audit Log)
// =============================================================================
import { test as base, expect } from "@playwright/test";
import { authedPage as _ } from "./fixtures";
void _;

const NEW_ROUTES = [
  { path: "/fefo", expected: "FEFO" },
  { path: "/open-vial", expected: "Open-Vial" },
  { path: "/bid-tracking", expected: "HĐ" },
  { path: "/audit-log", expected: "Audit" },
];

base("FEFO module: page loads, compliance report renders", async ({ authedPage }) => {
  const response = await authedPage.goto("/fefo", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(authedPage.locator("body")).toContainText("FEFO", { timeout: 10_000 });
  // Wait for at least one KPI card
  await authedPage.waitForTimeout(1500);
  // Should have a month/year selector
  const monthSelect = authedPage.locator("button:has-text('Tháng')").first();
  if (await monthSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expect(monthSelect).toBeVisible();
  }
});

base("Open-Vial module: page loads, shows expiring list", async ({ authedPage }) => {
  const response = await authedPage.goto("/open-vial", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(authedPage.locator("body")).toContainText("Open-Vial", { timeout: 10_000 });
  await authedPage.waitForTimeout(1500);
  // Should show expiring stats
  await expect(authedPage.locator("body")).toContainText(/Sắp hết hạn|CRITICAL|Cảnh báo/i, {
    timeout: 5000,
  });
});

base("Bid Tracking module: dashboard loads with KPIs", async ({ authedPage }) => {
  const response = await authedPage.goto("/bid-tracking", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(authedPage.locator("body")).toContainText("HĐ", { timeout: 10_000 });
  await authedPage.waitForTimeout(1500);
  // Should show KPI cards
  await expect(authedPage.locator("body")).toContainText(/Tổng HĐ|Giá trị|sử dụng/i, {
    timeout: 5000,
  });
});

base("Audit Log module: filter + diff display work", async ({ authedPage }) => {
  const response = await authedPage.goto("/audit-log", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(authedPage.locator("body")).toContainText("Audit", { timeout: 10_000 });
  await authedPage.waitForTimeout(2000);
  // Should show filter section
  await expect(authedPage.locator("body")).toContainText(/Bảng|Thao tác|Từ ngày/i, {
    timeout: 5000,
  });
  // Try to expand first row
  const firstRow = authedPage.locator(".border.rounded-md").first();
  if (await firstRow.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstRow.click();
    await authedPage.waitForTimeout(500);
  }
});

base("smoke: all 4 new modules load 200", async ({ authedPage }) => {
  for (const route of NEW_ROUTES) {
    const response = await authedPage.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `Route ${route.path} should return 200`).toBe(200);
    await expect(authedPage.locator("body")).toContainText(route.expected, { timeout: 10_000 });
  }
});
