#!/usr/bin/env node
// =============================================================================
// Smoke test script - verify all routes accessible + no runtime errors
// Usage: node scripts/smoke-test.mjs [baseUrl]
// Default baseUrl: http://localhost:3033
// =============================================================================
const BASE_URL = process.argv[2] ?? "http://localhost:3033";

// Dev session cookie (matches what dev-mock expects)
const SESSION = JSON.stringify({
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@test.vn",
    full_name: "Admin Test",
    role: "ADMIN",
  },
});

const ROUTES = [
  // Core (10 routes)
  { path: "/dashboard", minSize: 50000, mustContain: ["Tổng quan", "Vật tư"] },
  { path: "/inventory/products", minSize: 30000, mustContain: ["Bút bi", "Văn phòng phẩm"] },
  { path: "/inventory/stock", minSize: 30000, mustContain: ["Tồn kho"] },
  { path: "/warehouses", minSize: 30000, mustContain: ["Kho tổng"] },
  { path: "/parties", minSize: 30000, mustContain: ["Văn phòng phẩm ABC"] },
  { path: "/purchase-orders", minSize: 30000, mustContain: ["Mua hàng"] },
  { path: "/goods-receipts", minSize: 30000, mustContain: ["Nhập kho"] },
  { path: "/transfers", minSize: 30000, mustContain: ["Chuyển kho"] },
  { path: "/stock-takes", minSize: 30000, mustContain: ["Kiểm kê"] },
  { path: "/stock-issues", minSize: 30000, mustContain: ["Phiếu xuất"] },
  // Bidding (5 routes)
  { path: "/bidding/contracts", minSize: 30000, mustContain: ["HĐ-", "ACTIVE"] },
  { path: "/bidding/plans", minSize: 30000, mustContain: ["KHĐT"] },
  { path: "/bidding/lots", minSize: 30000, mustContain: ["LOT-"] },
  { path: "/bidding/packages", minSize: 30000, mustContain: ["GTHAU-"] },
  { path: "/bidding/requests", minSize: 1000, mustContain: ["Dự trù mua sắm"] },
  // NEW: Replenishment (Phase R13)
  {
    path: "/replenishment",
    minSize: 30000,
    mustContain: ["Dự trù cuối tháng", "Tạo dự trù tháng mới", "Lịch sử chạy dự trù"],
  },
];

async function checkRoute(route) {
  const url = `${BASE_URL}${route.path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Cookie: `dev_session=${encodeURIComponent(SESSION)}` },
      redirect: "follow",
    });
    const ms = Date.now() - start;
    const html = await res.text();

    const issues = [];
    if (res.status !== 200) issues.push(`HTTP ${res.status} (expected 200)`);
    if (html.length < route.minSize) issues.push(`size ${html.length} < min ${route.minSize}`);
    for (const keyword of route.mustContain) {
      if (!html.includes(keyword)) issues.push(`missing keyword: "${keyword}"`);
    }
    // Check for runtime errors (Next.js error markers)
    if (html.includes("Application error") || html.includes("Unhandled Runtime Error")) {
      issues.push("runtime error detected in HTML");
    }
    if (html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING") && !html.includes("/replenishment")) {
      // BAILOUT is OK for replenishment (auth) but not for other routes
      // (this is actually only relevant when session invalid)
    }

    return { path: route.path, status: res.status, ms, size: html.length, issues };
  } catch (err) {
    return { path: route.path, status: "FETCH_ERROR", ms: Date.now() - start, size: 0, issues: [err.message] };
  }
}

async function main() {
  console.log(`\n🔍 Smoke test: ${BASE_URL}\n`);
  console.log("─".repeat(90));
  console.log("Route".padEnd(28) + "Status  Time    Size      Issues");
  console.log("─".repeat(90));

  let total = 0, passed = 0, failed = 0;
  for (const route of ROUTES) {
    const r = await checkRoute(route);
    total++;
    const status = r.issues.length === 0 ? "✅ PASS" : "❌ FAIL";
    if (r.issues.length === 0) passed++;
    else failed++;
    const sizeStr = `${(r.size / 1024).toFixed(1)} KB`;
    const timeStr = `${r.ms}ms`;
    console.log(
      (r.path).padEnd(28) +
      `${r.status}`.padEnd(8) +
      timeStr.padEnd(8) +
      sizeStr.padEnd(11) +
      (r.issues.length === 0 ? "" : r.issues.join("; ")),
    );
  }

  console.log("─".repeat(90));
  console.log(`\n📊 Total: ${total} | ✅ Passed: ${passed} | ❌ Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("🎉 All routes pass!\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
