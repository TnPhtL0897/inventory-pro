import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

import { api } from "@/lib/api";
import { StockTakeFormClient } from "./stock-take-form-client";
import { StockTakesTableSSR } from "@/features/stock-takes/stock-takes-table-ssr";
import type { StockTake } from "@/features/stock-takes/api";

export const runtime = "edge";

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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kiá»ƒm kê</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Tạo phiểu kiá»ƒm kê, snapshot tá»“n kho, nhập sá»‘ Ä‘ểm, chá»‘t tạo ADJUST â€¢ <strong>{total}</strong> phiểu</p>
        </div>
        <StockTakeFormClient />
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách phiểu kiá»ƒm kê</CardTitle></CardHeader>
        <CardContent>
          <StockTakesTableSSR data={{ items: stockTakes, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

