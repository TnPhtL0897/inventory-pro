import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { StockTakeFormClient } from "./stock-take-form-client";
import { StockTakesTableSSR } from "@/features/stock-takes/stock-takes-table-ssr";
import type { StockTake } from "@/features/stock-takes/api";

export default async function StockTakesPage() {
  let stockTakes: StockTake[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: StockTake[]; total: number }>("/api/v1/stock-takes?pageSize=100");
    stockTakes = data.items;
    total = data.total;
  } catch {}
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
          <StockTakesTableSSR data={{ items: stockTakes, total }} />
        </CardContent>
      </Card>
    </div>
  );
}
