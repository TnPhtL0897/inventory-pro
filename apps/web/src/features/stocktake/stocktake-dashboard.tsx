"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useStockTakes,
  useMyAssignedStockTakes,
  useStockTakeHistory,
  useCreateStockTake,
  useCancelStockTake,
} from "./api";
import { CreateStockTakeModal } from "./create-stocktake-modal";
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
  STOCK_TAKE_LINE_STATUS_LABELS,
  STOCK_TAKE_LINE_STATUS_COLORS,
  STOCK_TAKE_APPROVAL_THRESHOLD_VND,
  type ProductGroup,
  type StockTakeKhoaXn,
} from "@inventorypro/shared-types";
import {
  ClipboardList,
  Plus,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
} from "lucide-react";

const STOCK_TAKE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  COUNTED: "Đã đếm",
  POSTED: "Chờ Trưởng khoa duyệt",
  CANCELLED: "Đã hủy / Từ chối",
};

const STOCK_TAKE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  COUNTED: "bg-blue-100 text-blue-800",
  POSTED: "bg-amber-100 text-amber-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export function StockTakeDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"hc-sp" | "vtyt">("hc-sp");
  const productGroup = (tab === "hc-sp" ? "HOA_CHAT_SINH_PHAM" : "VAT_TU_Y_TE") as ProductGroup;
  const [createOpen, setCreateOpen] = useState(false);

  const { data: active, isLoading } = useStockTakes({
    productGroup,
    limit: 20,
  });
  const { data: mine } = useMyAssignedStockTakes();
  const { data: history } = useStockTakeHistory(productGroup, 12);

  const activeItems = (active ?? []).filter(
    (s: any) => s.status !== "CANCELLED"
  );
  const cancelledItems = (active ?? []).filter(
    (s: any) => s.status === "CANCELLED"
  );

  const renderRow = (s: any, isMine = false) => {
    const lineCount = s.lines?.[0]?.count ?? 0;
    const value = s.total_estimated_value ?? 0;
    const isHighValue = value >= STOCK_TAKE_APPROVAL_THRESHOLD_VND;
    return (
      <Card
        key={s.id}
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => router.push(`/stocktake/${s.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <div className="font-semibold">
                  {s.stock_take_number ?? `ST-${s.period_year}-${String(s.period_month).padStart(2, "0")}`}
                </div>
                <Badge className={STOCK_TAKE_STATUS_COLORS[s.status] ?? "bg-gray-100"}>
                  {STOCK_TAKE_STATUS_LABELS[s.status] ?? s.status}
                </Badge>
                {isHighValue && (
                  <Badge className="bg-orange-100 text-orange-800">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Giá trị cao
                  </Badge>
                )}
                {isMine && (
                  <Badge variant="outline" className="text-blue-700 border-blue-300">
                    Được giao
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                Tháng {String(s.period_month).padStart(2, "0")}/{s.period_year} • Kho:{" "}
                {s.warehouse_ids?.length ?? 0} kho • Số lô: {lineCount}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Tạo: {s.created_at ? new Date(s.created_at).toLocaleString("vi-VN") : "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Tổng chênh lệch</div>
              <div className="text-lg font-bold">
                {new Intl.NumberFormat("vi-VN").format(s.total_discrepancies ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                ≈ {new Intl.NumberFormat("vi-VN").format(value)} ₫
              </div>
              <ChevronRight className="h-4 w-4 ml-auto mt-1 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          {isLoading ? "Đang tải..." : `${activeItems.length} đợt đang hoạt động`}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Tạo đợt kiểm kê tháng
        </Button>
      </div>

      <Tabs value={tab} defaultValue="hc-sp" onValueChange={(v) => setTab(v as "hc-sp" | "vtyt")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="hc-sp">Hóa chất - Sinh phẩm</TabsTrigger>
          <TabsTrigger value="vtyt">Vật tư y tế</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4 mt-4">
          {/* Được giao cho tôi */}
          {mine && mine.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Được giao cho tôi ({mine.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {mine
                  .filter((m: any) => m.product_group === productGroup)
                  .map((m: any) => renderRow(m, true))}
              </CardContent>
            </Card>
          )}

          {/* Active */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Đang hoạt động ({activeItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeItems.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Chưa có đợt kiểm kê nào đang hoạt động
                </div>
              ) : (
                activeItems.map((s: any) => renderRow(s))
              )}
            </CardContent>
          </Card>

          {/* Lịch sử */}
          {history && history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Lịch sử ({history.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.map((s: any) => renderRow(s))}
              </CardContent>
            </Card>
          )}

          {/* Cancelled (collapsed) */}
          {cancelledItems.length > 0 && (
            <details>
              <summary className="text-sm text-muted-foreground cursor-pointer">
                Đã hủy / từ chối ({cancelledItems.length})
              </summary>
              <div className="mt-2 space-y-2">
                {cancelledItems.map((s: any) => renderRow(s))}
              </div>
            </details>
          )}
        </TabsContent>
      </Tabs>

      <CreateStockTakeModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultProductGroup={productGroup}
      />
    </div>
  );
}
