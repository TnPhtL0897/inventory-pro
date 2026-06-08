// Server component - Dá»± trÃ¹ cuá»‘i thÃ¡ng cho kho cháºµn
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { MOCK_REPLENISHMENT_RUNS } from "@/lib/dev-mock";
import { ReplenishmentListClient } from "./list-client";
import type { ReplenishmentRun } from "@/features/replenishment/api";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default async function ReplenishmentPage() {
  let runs: ReplenishmentRun[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: ReplenishmentRun[]; total: number }>(`/api/v1/replenishment/runs?pageSize=100`);
    runs = data.items;
    total = data.total;
  } catch {
    // Fallback to mock khi API chÆ°a cháº¡y
    runs = MOCK_REPLENISHMENT_RUNS as ReplenishmentRun[];
    total = runs.length;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8" />
            Dá»± trÃ¹ cuá»‘i thÃ¡ng
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            TÃ­nh forecast xuáº¥t hÃ ng 3 thÃ¡ng gáº§n nháº¥t + Ä‘á» xuáº¥t bá»• sung cho kho cháºµn (RECEIVING) â€¢ <strong>{total}</strong> láº§n cháº¡y
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Lá»‹ch sá»­ cháº¡y dá»± trÃ¹
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReplenishmentListClient initialData={{ items: runs, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

