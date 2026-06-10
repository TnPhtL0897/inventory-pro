"use client";

// Client component - 8 parallel counters via useQueries + PostgREST
import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Warehouse, ArrowRight } from "lucide-react";
import { listTable } from "@/lib/data-access";
import { createClient } from "@/lib/supabase/client";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function DashboardPage() {
  // Read user.email from Supabase auth (client-side)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes("abcdefghij");
    if (isPlaceholder) {
      // DEV MODE: read dev_session cookie
      const m = document.cookie.match(/(?:^|;\s*)dev_session=([^;]+)/);
      if (m) {
        try {
          const session = JSON.parse(decodeURIComponent(m[1]));
          if (!cancelled) setUserEmail(session?.user?.email ?? null);
        } catch {}
      }
    } else {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setUserEmail(data.user?.email ?? null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // 8 counters in parallel — each uses a tiny pageSize=1 to get total count
  const counterQueries = useQueries({
    queries: [
      { queryKey: ["products", "count"],     queryFn: () => listTable("products",         { pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ["warehouses", "count"],   queryFn: () => listTable("warehouses",       { pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ["branches", "count"],     queryFn: () => listTable("branches",         { pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ["parties", "count"],      queryFn: () => listTable("parties",          { pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ["purchase-orders", "count"], queryFn: () => listTable("purchase_orders", { pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ["goods-receipts", "count"],  queryFn: () => listTable("goods_receipts",  { pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ["stock-transfers", "count"],queryFn: () => listTable("stock_transfers",  { pageSize: 1 }), staleTime: 30_000 },
      { queryKey: ["stock-takes", "count"],  queryFn: () => listTable("stock_takes",      { pageSize: 1 }), staleTime: 30_000 },
    ],
  });

  const [
    productsTotal, warehousesTotal, branchesTotal, partiesTotal,
    purchaseOrdersTotal, goodsReceiptsTotal, transfersTotal, stockTakesTotal,
  ] = counterQueries.map((q) => q.data?.total ?? 0);

  const cards = [
    { title: "Tổng vật tư", value: productsTotal, href: "/inventory/products", icon: Package, color: "text-blue-600" },
    { title: "Số kho", value: warehousesTotal, href: "/warehouses", icon: Warehouse, color: "text-purple-600" },
    { title: "Chi nhánh", value: branchesTotal, href: null, icon: null, color: "text-indigo-600" },
    { title: "Đối tác", value: partiesTotal, href: "/parties", icon: null, color: "text-cyan-600" },
  ];

  const modules = [
    { title: "Vật tư", description: "Danh mục sản phẩm", href: "/inventory/products", count: productsTotal },
    { title: "Tồn kho", description: "Tồn hiện tại + lịch sử", href: "/inventory/stock", count: null },
    { title: "Kho", description: "Quản lý kho vật lý", href: "/warehouses", count: warehousesTotal },
    { title: "Mua hàng (PO)", description: "Đơn đặt hàng", href: "/purchase-orders", count: purchaseOrdersTotal },
    { title: "Nhập kho (GRN)", description: "Phiếu nhập kho", href: "/goods-receipts", count: goodsReceiptsTotal },
    { title: "Chuyển kho", description: "Chuyển kho nội bộ", href: "/transfers", count: transfersTotal },
    { title: "Kiểm kê", description: "Phiếu kiểm kê", href: "/stock-takes", count: stockTakesTotal },
    { title: "Đối tác", description: "NCC + Khách hàng", href: "/parties", count: partiesTotal },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tổng quan</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Xin chào <span className="font-medium break-all">{userEmail ?? "..."}</span> — chọn module bên dưới để bắt đầu.
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          const body = (
            <Card className={c.href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-xs sm:text-sm font-medium">{c.title}</CardTitle>
                {Icon && <Icon className={`h-4 w-4 ${c.color}`} />}
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl font-bold tabular-nums">{c.value.toLocaleString("vi-VN")}</div>
                {c.href && <p className="text-xs text-muted-foreground mt-1 flex items-center">Xem chi tiết <ArrowRight className="h-3 w-3 ml-1" /></p>}
              </CardContent>
            </Card>
          );
          return c.href ? <Link key={c.title} href={c.href}>{body}</Link> : <div key={c.title}>{body}</div>;
        })}
      </div>

      <div>
        <h2 className="text-base sm:text-lg font-semibold mb-3">Module nghiệp vụ</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <Link key={m.title} href={m.href} className="block">
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardHeader className="px-4 sm:px-6 py-3 sm:py-6">
                  <CardTitle className="text-sm sm:text-base">{m.title}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{m.description}</CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-3 sm:pb-6">
                  {m.count !== null ? (
                    <div className="text-lg sm:text-xl font-semibold tabular-nums">{m.count.toLocaleString("vi-VN")}</div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Truy cập →</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Phase status</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>✅ <strong>Phase 0</strong> — Foundation: monorepo, Next.js, ASP.NET Core, Supabase</li>
            <li>✅ <strong>Phase 1</strong> — Core MVP: products, warehouses, stock, manual IN/OUT</li>
            <li>✅ <strong>Phase 2</strong> — Operations: PO, GRN, Issue, Transfer, Stock-take</li>
            <li>⏳ <strong>Phase 3</strong> — Reports & Export: Excel, PDF, in phiếu</li>
            <li>⏳ <strong>Phase 4</strong> — WPF Desktop offline</li>
            <li>⏳ <strong>Phase 5</strong> — Mobile + Realtime</li>
            <li>⏳ <strong>Phase 6</strong> — VN Compliance: HĐ điện tử, chữ ký số, sổ sách</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
