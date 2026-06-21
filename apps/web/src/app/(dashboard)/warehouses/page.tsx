"use client";

// Client component - fetch warehouses via Supabase PostgREST
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWarehouses } from "@/features/warehouses/api";
import { WarehouseTable } from "@/features/warehouses/warehouse-table";
import { EmptyState, EmptyStatePresets } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function WarehousesPage() {
  const { data, isLoading, error, refetch, isRefetching } = useWarehouses({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const errorMsg = error instanceof Error ? error.message : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kho vật lý</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Quản lý kho theo chi nhánh, vị trí lưu trữ • <strong>{total}</strong> kho</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isRefetching}
          aria-label="Làm mới"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách kho</CardTitle></CardHeader>
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
            <EmptyState {...EmptyStatePresets.noWarehouses} />
          ) : (
            <WarehouseTable
              initialData={{ items, total, page: 1, pageSize: 100, hasMore: false }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
