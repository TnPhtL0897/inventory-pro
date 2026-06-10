"use client";

// Client component - fetch stock takes via Supabase PostgREST
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStockTakes } from "@/features/stock-takes/api";
import { StockTakeFormClient } from "./stock-take-form-client";
import { StockTakesTableSSR } from "@/features/stock-takes/stock-takes-table-ssr";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function StockTakesPage() {
  const { data, isLoading } = useStockTakes({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kiểm kê</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Tạo phiếu kiểm kê, snapshot tồn kho, nhập số đếm, chốt tạo ADJUST • <strong>{total}</strong> phiếu</p>
        </div>
        <StockTakeFormClient />
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách phiếu kiểm kê</CardTitle></CardHeader>
        <CardContent>
          {isLoading && items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <StockTakesTableSSR data={{ items, total }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
