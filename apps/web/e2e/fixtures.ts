// =============================================================================
// Test fixtures & helpers
// =============================================================================
import { test as base, expect, type Page } from "@playwright/test";

/**
 * Set dev session cookie (matches apps/web/src/lib/dev-mock.ts format).
 * Bypasses real Supabase auth - works in DEV MOCK mode.
 */
export const DEV_SESSION = JSON.stringify({
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@test.vn",
    full_name: "Admin Test",
    role: "ADMIN",
  },
});

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page, context }, use) => {
    await context.addCookies([
      {
        name: "dev_session",
        value: encodeURIComponent(DEV_SESSION),
        url: "/",
      },
    ]);
    await use(page);
  },
});

export { expect };

/** Wait for the page to finish client-side hydration (mock data loaded). */
export async function waitForData(page: Page, selector: string = "table tbody tr", timeout = 10_000) {
  await page.waitForSelector(selector, { timeout });
}
