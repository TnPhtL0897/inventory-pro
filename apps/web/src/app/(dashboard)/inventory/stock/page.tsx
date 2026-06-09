import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { StockTable } from "@/features/stock/stock-table";
import { MovementsTable } from "@/features/stock/movements-table";
import type { StockLevel, StockMovement } from "@/features/stock/api";

export default async function StockPage() {
  let levels: StockLevel[] = [];
  let movements: StockMovement[] = [];
  try {
    const [l, m] = await Promise.all([
      api.get<{ items: StockLevel[] }>("/api/v1/stock?pageSize=100"),
      api.get<{ items: StockMovement[] }>("/api/v1/stock/movements?pageSize=100"),
    ]);
    levels = l.items;
    movements = m.items;
  } catch {}
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tồn kho</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Tồn hiện tại và lịch sử nhập xuất.{" "}
          <a href="/inventory/movements/new" className="text-blue-600 hover:underline">
            + Ghi movement thủ công
          </a>
        </p>
      </div>
      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Tồn hiện tại ({levels.length})</TabsTrigger>
          <TabsTrigger value="movements">Lịch sử ({movements.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="levels">
          <Card>
            <CardHeader><CardTitle>Tồn kho hiện tại</CardTitle></CardHeader>
            <CardContent>
              {levels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Chưa có tồn kho.</div>
              ) : (
                <StockTable initialData={{ items: levels, total: levels.length, page: 1, pageSize: 100, hasMore: false }} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="movements">
          <Card>
            <CardHeader><CardTitle>Lịch sử stock movements</CardTitle></CardHeader>
            <CardContent>
              {movements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Chưa có movement.</div>
              ) : (
                <MovementsTable initialData={{ items: movements, total: movements.length, page: 1, pageSize: 100, hasMore: false }} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

