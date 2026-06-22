"use client";

// Client component - fetch stock transfers via Supabase PostgREST
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStockTransfers } from "@/features/transfers/api";
import { TransferFormClient } from "./transfer-form-client";
import { TransfersTableSSR } from "@/features/transfers/transfers-table-ssr";
import { EmptyState, EmptyStatePresets } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";


export default function TransfersPage() {
  const { data, isLoading, error, refetch, isRefetching } = useStockTransfers({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const errorMsg = error instanceof Error ? error.message : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Chuyển kho</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Phiếu chuyển kho nội bộ • <strong>{total}</strong> phiếu</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            aria-label="Làm mới"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
          <TransferFormClient />
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách phiếu chuyển</CardTitle></CardHeader>
        <CardContent>
          {errorMsg ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Lỗi</AlertTitle>
              <AlertDescription>
                {errorMsg}
                <Button variant="outline" size="sm" className="ml-2" onClick={() => refetch()}>
                  Thử lại
                </Button>
              </AlertDescription>
            </Alert>
          ) : isLoading && items.length === 0 ? (
            <TableSkeleton rows={6} cols={5} />
          ) : items.length === 0 ? (
            <EmptyState {...EmptyStatePresets.noTransfers} />
          ) : (
            <TransfersTableSSR data={{ items, total }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
