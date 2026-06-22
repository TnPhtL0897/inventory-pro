"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StockTakeDashboard } from "@/features/stocktake/stocktake-dashboard";
import { ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

export default function StockTakePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 sm:h-8 sm:w-8" />
            Kiểm kê tháng
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Khoa XN — 1 thủ kho kiểm cả 2 kho (BULK + DAILY) cùng mảng, Trưởng khoa duyệt
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <StockTakeDashboard />
        </CardContent>
      </Card>
    </div>
  );
}
