"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyDashboard } from "@/features/replenishment-weekly/weekly-dashboard";
import { Truck } from "lucide-react";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default function WeeklyReplenishmentPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 sm:h-8 sm:w-8" />
            Bổ sung kho lẻ (tuần)
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Khoa XN — tự động đề xuất chuyển từ kho chẵn → kho lẻ mỗi thứ 6
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <WeeklyDashboard />
        </CardContent>
      </Card>
    </div>
  );
}
