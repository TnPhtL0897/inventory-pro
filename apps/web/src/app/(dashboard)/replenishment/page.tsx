"use client";

// Client component - Dự trù cuối tháng cho kho chẵn
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, TrendingUp } from "lucide-react";
import { useReplenishmentRuns } from "@/features/replenishment/api";
import { ReplenishmentListClient } from "./list-client";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function ReplenishmentPage() {
  const { data, isLoading } = useReplenishmentRuns({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8" />
            Dự trù cuối tháng
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Tính forecast xuất hàng 3 tháng gần nhất + đề xuất bổ sung cho kho chẵn (RECEIVING) • <strong>{total}</strong> lần chạy
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Lịch sử chạy dự trù
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <ReplenishmentListClient initialData={{ items, total }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
