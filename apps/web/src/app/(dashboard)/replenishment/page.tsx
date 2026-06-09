// Server component - Dá»± trù cuá»‘i tháng cho kho chẵn
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { MOCK_REPLENISHMENT_RUNS } from "@/lib/dev-mock";
import { ReplenishmentListClient } from "./list-client";
import type { ReplenishmentRun } from "@/features/replenishment/api";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export const runtime = "edge";

export default async function ReplenishmentPage() {
  let runs: ReplenishmentRun[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: ReplenishmentRun[]; total: number }>(`/api/v1/replenishment/runs?pageSize=100`);
    runs = data.items;
    total = data.total;
  } catch {
    // Fallback to mock khi API chÆ°a chạy
    runs = MOCK_REPLENISHMENT_RUNS as ReplenishmentRun[];
    total = runs.length;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8" />
            Dá»± trù cuá»‘i tháng
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Tính forecast xuất hàng 3 tháng gần nhất + Ä‘á» xuất bá»• sung cho kho chẵn (RECEIVING) â€¢ <strong>{total}</strong> lần chạy
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Lá»‹ch sá»­ chạy dá»± trù
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReplenishmentListClient initialData={{ items: runs, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

