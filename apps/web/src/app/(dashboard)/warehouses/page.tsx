// Server component - SSR data
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { WarehouseTable } from "@/features/warehouses/warehouse-table";
import type { Warehouse } from "@/features/warehouses/api";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export const runtime = "edge";

export default async function WarehousesPage() {
  let warehouses: Warehouse[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: Warehouse[]; total: number }>("/api/v1/warehouses?pageSize=100");
    warehouses = data.items;
    total = data.total;
  } catch {}

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kho vật lý</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Quản lý kho theo chi nhánh, vá»‹ trí lÆ°u trá»¯ â€¢ <strong>{total}</strong> kho</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách kho</CardTitle></CardHeader>
        <CardContent>
          {warehouses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">ChÆ°a có kho nào.</div>
          ) : (
            <WarehouseTable
              initialData={{ items: warehouses, total, page: 1, pageSize: 100, hasMore: false }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

