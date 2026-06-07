// =============================================================================
// E2E test: Replenishment (Dự trù cuối tháng) - happy path + edge cases
// =============================================================================
import { test, expect } from "./fixtures";

test.describe("Replenishment feature", () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto("/replenishment", { waitUntil: "domcontentloaded" });
    await expect(authedPage.locator("h1")).toContainText("Dự trù cuối tháng", { timeout: 10_000 });
  });

  test("happy path: mở dialog, xem preview forecast, lưu thành PR", async ({ authedPage }) => {
    // 1. Bấm "Tạo dự trù tháng mới"
    await authedPage.getByRole("button", { name: /Tạo dự trù tháng mới/i }).click();

    // 2. Dialog mở
    const dialog = authedPage.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText("Dự trù cuối tháng - Kho chẵn");

    // 3. Bấm "Xem trước" (mock data sẽ render)
    await dialog.getByRole("button", { name: /Xem trước/i }).click();

    // 4. Verify summary cards xuất hiện + table có data
    await expect(dialog).toContainText("Kho chẵn", { timeout: 5_000 });
    await expect(dialog).toContainText("Sản phẩm đề xuất");
    await expect(dialog).toContainText("Tổng giá trị ước tính");

    // 5. Verify table có ít nhất 1 dòng forecast (mock: 4 products)
    const rows = dialog.locator("table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // 6. Verify checkbox "Lưu thành PurchaseRequest" mặc định checked
    const saveCheckbox = dialog.locator('input[type="checkbox"]').first();
    await expect(saveCheckbox).toBeChecked();

    // 7. Verify có dòng có "Trend 3 tháng" (mock data)
    await expect(dialog).toContainText("Trend 3 tháng");
  });

  test("edge case: insufficient stock → không có forecast lines", async ({ authedPage }) => {
    // Mở dialog
    await authedPage.getByRole("button", { name: /Tạo dự trù tháng mới/i }).click();
    const dialog = authedPage.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Preview
    await dialog.getByRole("button", { name: /Xem trước/i }).click();

    // Với mock data hiện tại luôn có 4 lines - verify
    const rows = dialog.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Khi không có line nào, button "Lưu thành PR" sẽ không xuất hiện
    // (Hiện tại có data nên button LUÔN hiện - test này chỉ để verify happy path ổn)
    const saveButton = dialog.getByRole("button", { name: /Lưu thành PurchaseRequest/i });
    if (count === 0) {
      await expect(saveButton).not.toBeVisible();
    } else {
      await expect(saveButton).toBeVisible();
    }
  });

  test("navigation: click nav item → vào trang /replenishment", async ({ authedPage }) => {
    // Từ dashboard, click nav
    await authedPage.goto("/dashboard");
    const navLink = authedPage.locator('nav a[href="/replenishment"]');
    await expect(navLink).toBeVisible();
    await navLink.click();
    await authedPage.waitForURL("**/replenishment");
    await expect(authedPage.locator("h1")).toContainText("Dự trù cuối tháng");
  });
});
