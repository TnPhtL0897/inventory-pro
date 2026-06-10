"use client";

// Client component - fetch stock transfers via Supabase PostgREST
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStockTransfers } from "@/features/transfers/api";
import { TransferFormClient } from "./transfer-form-client";
import { TransfersTableSSR } from "@/features/transfers/transfers-table-ssr";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function TransfersPage() {
  const { data, isLoading } = useStockTransfers({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Chuyển kho</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Phiếu chuyển kho nội bộ • <strong>{total}</strong> phiếu</p>
        </div>
        <TransferFormClient />
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách phiếu chuyển</CardTitle></CardHeader>
        <CardContent>
          {isLoading && items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <TransfersTableSSR data={{ items, total }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
