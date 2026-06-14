"use client";

// Client component - fetch stock levels + movements via Supabase PostgREST
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStockLevels, useStockMovements } from "@/features/stock/api";
import { useRealtimeStockMovements } from "@/lib/realtime";
import { StockTable } from "@/features/stock/stock-table";
import { MovementsTable } from "@/features/stock/movements-table";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function StockPage() {
  // Realtime: auto-refresh stock levels + movements when new movements are inserted
  useRealtimeStockMovements();

  const { data: levelsData, isLoading: loadingLevels } = useStockLevels({ pageSize: 100 });
  const { data: movementsData, isLoading: loadingMovements } = useStockMovements({ pageSize: 100 });

  const levels = levelsData?.items ?? [];
  const movements = movementsData?.items ?? [];

  return (
    <div className="space-y-6 sm:space-y-8">
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
              {loadingLevels && levels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
              ) : levels.length === 0 ? (
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
              {loadingMovements && movements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
              ) : movements.length === 0 ? (
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
