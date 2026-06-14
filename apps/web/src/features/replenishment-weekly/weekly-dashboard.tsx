"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useWeeklyReplenishmentRuns,
  useRunWeeklyReplenishment,
  usePendingReplenishmentAlerts,
} from "./api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  REPLENISHMENT_RUN_STATUS_LABELS,
  REPLENISHMENT_RUN_STATUS_COLORS,
  REPLENISHMENT_APPROVAL_THRESHOLD_VND,
  type ProductGroup,
  type ReplenishmentRunStatus,
} from "@inventorypro/shared-types";
import { RefreshCw, AlertCircle, Calendar, Truck, Package, ChevronRight } from "lucide-react";

export function WeeklyDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"hc-sp" | "vtyt">("hc-sp");
  const productGroup = tab.toUpperCase().replace("-", "_") as ProductGroup;
  const [statusFilter, setStatusFilter] = useState<ReplenishmentRunStatus | "">("");

  const { data: runs, isLoading } = useWeeklyReplenishmentRuns({
    productGroup,
    status: statusFilter || undefined,
    limit: 20,
  });
  const { data: alerts } = usePendingReplenishmentAlerts();
  const runCompute = useRunWeeklyReplenishment();

  const items = runs ?? [];
  const pendingItems = items.filter((r: any) =>
    ["DRAFT", "REVIEWED", "CONFIRMED_BY_DAILY"].includes(r.status)
  );
  const completedItems = items.filter((r: any) =>
    ["APPROVED", "TRANSFERRING", "COMPLETED"].includes(r.status)
  );

  const runItems = (list: any[]) => (
    <div className="space-y-2">
      {list.map((r: any) => {
        const needsApproval = r.requires_dept_head_approval;
        return (
          <Card
            key={r.id}
            className="cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => router.push(`/replenishment/weekly/${r.id}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="font-semibold text-sm">{r.id.substring(0, 8)}</code>
                    <Badge className={REPLENISHMENT_RUN_STATUS_COLORS[r.status as ReplenishmentRunStatus]}>
                      {REPLENISHMENT_RUN_STATUS_LABELS[r.status as ReplenishmentRunStatus]}
                    </Badge>
                    {needsApproval && (
                      <Badge className="bg-orange-100 text-orange-800">
                        Cần Trưởng khoa duyệt
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(r.period_date).toLocaleDateString("vi-VN")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {r.lines?.[0]?.count ?? 0} sản phẩm
                    </span>
                    <span>
                      Giá trị:{" "}
                      <strong>
                        {new Intl.NumberFormat("vi-VN").format(r.total_estimated_value ?? 0)} ₫
                      </strong>
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        );
      })}
      {list.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Không có đề xuất nào
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Bổ sung kho lẻ (tuần)
          </h2>
          <p className="text-sm text-muted-foreground">
            Auto-suggest thứ 6 hàng tuần • FEFO + open-vial priority
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => runCompute.mutate({ productGroup })}
            disabled={runCompute.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${runCompute.isPending ? "animate-spin" : ""}`} />
            Chạy manual
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Cảnh báo ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 5).map((a: any) => (
                <div key={a.id} className="text-sm flex items-start gap-2">
                  <Badge
                    className={
                      a.alert_level === "CRITICAL"
                        ? "bg-red-100 text-red-800"
                        : a.alert_level === "WARNING"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800"
                    }
                  >
                    {a.alert_level}
                  </Badge>
                  <span className="text-muted-foreground">{a.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs theo mảng */}
      <Tabs defaultValue={tab} onValueChange={(v) => setTab(v as "hc-sp" | "vtyt")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="hc-sp">Hóa chất - Sinh phẩm</TabsTrigger>
          <TabsTrigger value="vtyt">Vật tư y tế</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4 mt-4">
          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={statusFilter === "" ? "default" : "outline"}
              onClick={() => setStatusFilter("")}
            >
              Tất cả
            </Button>
            {(["DRAFT", "REVIEWED", "CONFIRMED_BY_DAILY", "APPROVED", "COMPLETED", "CANCELLED"] as ReplenishmentRunStatus[]).map(
              (s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(s)}
                >
                  {REPLENISHMENT_RUN_STATUS_LABELS[s]}
                </Button>
              )
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <>
              {statusFilter ? (
                runItems(items)
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-medium mb-2 text-muted-foreground">
                      Đang chờ xử lý ({pendingItems.length})
                    </h3>
                    {runItems(pendingItems)}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2 text-muted-foreground mt-4">
                      Đã xử lý ({completedItems.length})
                    </h3>
                    {runItems(completedItems)}
                  </div>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong>💡 Quy trình:</strong> DRAFT → REVIEWED (thủ kho kho chẵn) → CONFIRMED_BY_DAILY (kho lẻ) →{" "}
        {REPLENISHMENT_APPROVAL_THRESHOLD_VND / 1_000_000}M+ → Trưởng khoa duyệt → APPROVED → TRANSFERRING → COMPLETED
      </div>
    </div>
  );
}
