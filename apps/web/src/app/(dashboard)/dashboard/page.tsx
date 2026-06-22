"use client";

import * as React from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { listTable, sb } from "@/lib/data-access";
import { useRealtimeStockDocuments } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { StatPill } from "@/components/dashboard/stat-pill";
import {
 QuickAccessCard,
 type CardTone,
} from "@/components/dashboard/quick-access-card";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

function formatTime(d: Date) {
 const hh = d.getHours().toString().padStart(2, "0");
 const mm = d.getMinutes().toString().padStart(2, "0");
 return `${hh}:${mm}`;
}

export default function DashboardPage() {
 // Realtime refresh on stock doc changes
 useRealtimeStockDocuments();

 // Read user email from Supabase
 const [userEmail, setUserEmail] = React.useState<string | null>(null);
 React.useEffect(() => {
 let cancelled = false;
 const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
 process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
 process.env.NEXT_PUBLIC_SUPABASE_URL.includes("abcdefghij");
 if (isPlaceholder) {
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

 // 8 counters in parallel
 const counterQueries = useQueries({
 queries: [
 { queryKey: ["products", "count"], queryFn: () => listTable("products", { pageSize: 1 }), staleTime: 30_000 },
 { queryKey: ["warehouses", "count"], queryFn: () => listTable("warehouses", { pageSize: 1 }), staleTime: 30_000 },
 { queryKey: ["branches", "count"], queryFn: () => listTable("branches", { pageSize: 1 }), staleTime: 30_000 },
 { queryKey: ["parties", "count"], queryFn: () => listTable("parties", { pageSize: 1 }), staleTime: 30_000 },
 { queryKey: ["purchase-orders", "count"], queryFn: () => listTable("purchase_orders", { pageSize: 1 }), staleTime: 30_000 },
 { queryKey: ["goods-receipts", "count"], queryFn: () => listTable("goods_receipts", { pageSize: 1 }), staleTime: 30_000 },
 { queryKey: ["stock-transfers", "count"], queryFn: () => listTable("stock_transfers", { pageSize: 1 }), staleTime: 30_000 },
 { queryKey: ["stock-takes", "count"], queryFn: () => listTable("stock_takes", { pageSize: 1 }), staleTime: 30_000 },
 ],
 });

 const [
 productsTotal, warehousesTotal, branchesTotal, partiesTotal,
 purchaseOrdersTotal, goodsReceiptsTotal, transfersTotal, stockTakesTotal,
 ] = counterQueries.map((q) => q.data?.total ?? 0);

 const isLoading = counterQueries.some((q) => q.isLoading);

 // Derived: count of products with stock below min_stock (best-effort)
 const [lowStockCount, setLowStockCount] = React.useState<number | null>(null);
 React.useEffect(() => {
 const supabase = createClient();
 supabase
 .from("v_low_stock_products")
 .select("product_id", { count: "exact", head: true })
 .then(({ count }) => {
 if (typeof count === "number") setLowStockCount(count);
 }, () => {
 // view may not exist / RLS - fall back silently
 setLowStockCount(0);
 });
 }, []);

 // Derived: count of draft POs (awaiting approval)
 const [pendingPoCount, setPendingPoCount] = React.useState<number | null>(null);
 React.useEffect(() => {
 const supabase = createClient();
 supabase
 .from("purchase_orders")
 .select("id", { count: "exact", head: true })
 .eq("status", "DRAFT")
 .then(({ count }) => {
 if (typeof count === "number") setPendingPoCount(count);
 }, () => setPendingPoCount(0));
 }, []);

 // Derived: count of draft GRNs (awaiting post)
 const [pendingGrnCount, setPendingGrnCount] = React.useState<number | null>(null);
 React.useEffect(() => {
 const supabase = createClient();
 supabase
 .from("goods_receipts")
 .select("id", { count: "exact", head: true })
 .eq("status", "DRAFT")
 .then(({ count }) => {
 if (typeof count === "number") setPendingGrnCount(count);
 }, () => setPendingGrnCount(0));
 }, []);

 const now = React.useMemo(() => new Date(), []);
 const heroSubtitle = `Cập nhật lúc ${formatTime(now)} • ${now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

 return (
 <div className="space-y-6 sm:space-y-8">
 {/* ============= Hero banner ============= */}
 <section className="bg-hero-gradient relative overflow-hidden rounded-3xl px-6 py-7 text-white shadow-card sm:px-8 sm:py-9">
 {/* Decorative blur shapes */}
 <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
 <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-sky-300/20 blur-3xl" aria-hidden="true" />

 <div className="relative">
 <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/70">
 Hệ thống quản lý kho
 </p>
 <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
 Quản kho
 </h1>
 <p className="mt-1 text-sm text-white/80 sm:text-base">
 {heroSubtitle}
 {userEmail ? ` • Chào ${userEmail.split("@")[0]}` : ""}
 </p>

 {/* Stat pills */}
 <div className="mt-5 flex flex-wrap gap-2">
 <StatPill label="Mã vật tư" value={isLoading ? "…" : productsTotal} tone="info" />
 <StatPill
 label="Sắp hết"
 value={lowStockCount ?? "…"}
 tone={(lowStockCount ?? 0) > 0 ? "warning" : "success"}
 />
 <StatPill
 label="Cần duyệt PO"
 value={pendingPoCount ?? "…"}
 tone={(pendingPoCount ?? 0) > 0 ? "danger" : "success"}
 />
 </div>
 </div>
 </section>

 {/* ============= Quick access grid 2x4 ============= */}
 <section>
 <div className="mb-4 flex items-baseline justify-between">
 <h2 className="text-lg font-semibold tracking-tight">Truy cập nhanh</h2>
 <span className="text-xs text-muted-foreground">8 module chính</span>
 </div>

 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
 {/* Hàng 1: Nghiệp vụ hàng ngày */}
 <QuickAccessCard
 title="Tổng vật tư"
 icon="package"
 tone="green"
 value={isLoading ? null : productsTotal}
 subtext="Mã sản phẩm đang quản lý trong hệ thống"
 href="/inventory/products"
 />
 <QuickAccessCard
 title="Cảnh báo kho"
 icon="alert"
 tone="orange"
 value={lowStockCount ?? null}
 subtext={
 (lowStockCount ?? 0) > 0
 ? "Sản phẩm dưới tồn kho tối thiểu cần chú ý"
 : "Mọi sản phẩm đều trên ngưỡng tồn kho"
 }
 href="/inventory/stock"
 />
 <QuickAccessCard
 title="Nhập kho (GRN)"
 icon="inbox"
 tone="blue"
 value={pendingGrnCount ?? null}
 subtext="Phiếu nhập kho chờ xử lý / post"
 href="/goods-receipts"
 />
 <QuickAccessCard
 title="Xuất / Chuyển kho"
 icon="transfer"
 tone="purple"
 value={isLoading ? null : transfersTotal}
 subtext="Lịch sử luân chuyển nội bộ"
 href="/transfers"
 />

 {/* Hàng 2: Quản lý & Kế hoạch */}
 <QuickAccessCard
 title="Mua hàng (PO)"
 icon="cart"
 tone="yellow"
 value={pendingPoCount ?? null}
 subtext="Đơn đặt hàng nhà cung cấp"
 href="/purchase-orders"
 />
 <QuickAccessCard
 title="Kiểm kê"
 icon="clipboard"
 tone="mint"
 value={isLoading ? null : stockTakesTotal}
 subtext="Lịch kiểm kê định kỳ cuối tháng"
 href="/stocktake"
 />
 <QuickAccessCard
 title="Đối tác"
 icon="building"
 tone="slate"
 value={isLoading ? null : partiesTotal}
 subtext="Nhà cung cấp & đơn vị tiêu thụ"
 href="/parties"
 />
 <QuickAccessCard
 title="Dự trù vật tư"
 icon="forecast"
 tone="pink"
 subtext="Dự trù cuối tháng & dự trù năm"
 href="/replenishment"
 />
 </div>
 </section>

 {/* ============= Storage / branches summary ============= */}
 <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
 <SummaryTile
 title="Số kho"
 value={isLoading ? null : warehousesTotal}
 href="/warehouses"
 />
 <SummaryTile
 title="Chi nhánh"
 value={isLoading ? null : branchesTotal}
 href="/dashboard"
 />
 <SummaryTile
 title="Đấu thầu"
 value="—"
 subtext="Module quản lý hợp đồng đấu thầu"
 href="/bidding/contracts"
 />
 </section>
 </div>
 );
}

function SummaryTile({
 title,
 value,
 subtext,
 href,
}: {
 title: string;
 value: number | string | null;
 subtext?: string;
 href: string;
}) {
 return (
 <Link
 href={href}
 className="flex flex-col gap-1 rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover sm:p-5"
 >
 <span className="text-xs font-medium text-muted-foreground">{title}</span>
 {value === null ? (
 <Skeleton className="h-7 w-16" />
 ) : (
 <span className="text-2xl font-semibold tabular-nums tracking-tight">
 {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
 </span>
 )}
 {subtext && (
 <span className="text-[11px] text-muted-foreground">{subtext}</span>
 )}
 </Link>
 );
}
