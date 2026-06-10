"use client";

// Client component - fetch warehouses via Supabase PostgREST
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWarehouses } from "@/features/warehouses/api";
import { WarehouseTable } from "@/features/warehouses/warehouse-table";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function WarehousesPage() {
  const { data, isLoading } = useWarehouses({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kho vật lý</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Quản lý kho theo chi nhánh, vị trí lưu trữ • <strong>{total}</strong> kho</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách kho</CardTitle></CardHeader>
        <CardContent>
          {isLoading && items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Chưa có kho nào.</div>
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
