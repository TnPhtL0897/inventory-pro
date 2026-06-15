"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useStockTake,
  useApproveStockTakeLine,
  useApproveAllStockTakeLines,
  useRejectStockTake,
} from "./api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  STOCK_TAKE_LINE_STATUS_LABELS,
  STOCK_TAKE_LINE_STATUS_COLORS,
  STOCK_TAKE_DISCREPANCY_CATEGORY_LABELS,
  STOCK_TAKE_APPROVAL_THRESHOLD_VND,
  type StockTakeLineStatus,
  type StockTakeDiscrepancyCategory,
} from "@inventorypro/shared-types";
import {
  ChevronLeft,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export function StockTakeApprovalPanel({ stockTakeId }: { stockTakeId: string }) {
  const router = useRouter();
  const { data, isLoading } = useStockTake(stockTakeId);
  const approveLine = useApproveStockTakeLine();
  const approveAll = useApproveAllStockTakeLines();
  const reject = useRejectStockTake();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (isLoading || !data) {
    return <div className="py-8 text-center text-muted-foreground">Đang tải...</div>;
  }

  const status = data.status;
  const lines: any[] = data.lines ?? [];
  const discrepancyLines = lines.filter(
    (l: any) =>
      l.line_status === "DISCREPANCY" || l.line_status === "COUNTED" || l.line_status === "PENDING"
  );
  const totalValue = lines.reduce(
    (sum: number, l: any) => sum + (l.discrepancyValue ?? 0),
    0
  );
  const isHighValue = totalValue >= STOCK_TAKE_APPROVAL_THRESHOLD_VND;
  const canApprove = status === "POSTED";

  const toggleLine = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAllDiscrepancies = () => {
    setSelected(new Set(discrepancyLines.map((l: any) => l.id)));
  };

  const clearSelection = () => setSelected(new Set());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/stocktake")}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <CardTitle>
                ✅ Duyệt kiểm kê {data.stock_take_number ?? `ST-${data.period_year}-${String(data.period_month).padStart(2, "0")}`}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {data.product_group === "HOA_CHAT_SINH_PHAM" ? "HC-SP" : "VTYT"} • Tháng{" "}
                {String(data.period_month).padStart(2, "0")}/{data.period_year}
              </p>
            </div>
            <Badge className="bg-amber-100 text-amber-800">
              {status === "POSTED" ? "Chờ duyệt" : status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Tổng lô</div>
              <div className="text-2xl font-bold">{lines.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Cần duyệt</div>
              <div className="text-2xl font-bold text-amber-600">
                {discrepancyLines.length}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Tổng giá trị lệch</div>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat("vi-VN").format(totalValue)} ₫
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Ngưỡng duyệt</div>
              <div className="text-2xl font-bold text-muted-foreground">
                {(STOCK_TAKE_APPROVAL_THRESHOLD_VND / 1_000_000).toFixed(0)}M ₫
              </div>
            </div>
          </div>
          {isHighValue && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-800">
              <AlertTriangle className="inline h-4 w-4 mr-1" />
              Tổng giá trị chênh lệch vượt ngưỡng 1M ₫. Vui lòng xem xét kỹ trước khi duyệt.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selection controls */}
      {canApprove && discrepancyLines.length > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">Đã chọn: {selected.size}</span>
            <Button variant="ghost" size="sm" onClick={selectAllDiscrepancies}>
              Chọn tất cả
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Bỏ chọn
            </Button>
            <div className="ml-auto flex gap-2">
              <Button
                variant="destructive"
                onClick={() => setRejectModal(true)}
                disabled={reject.isPending}
              >
                <X className="h-4 w-4 mr-2" />
                Yêu cầu kiểm lại
              </Button>
              <Button
                onClick={async () => {
                  // Duyệt từng line đã chọn
                  for (const lineId of selected) {
                    await approveLine.mutateAsync(lineId);
                  }
                  clearSelection();
                }}
                disabled={selected.size === 0 || approveLine.isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                Duyệt {selected.size > 0 ? `(${selected.size})` : "có chọn lọc"}
              </Button>
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => approveAll.mutate(stockTakeId)}
                disabled={approveAll.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Duyệt tất cả
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lines list */}
      <div className="space-y-2">
        {lines.map((line: any) => {
          const isSelectable =
            canApprove &&
            (line.lineStatus === "DISCREPANCY" ||
              line.lineStatus === "COUNTED" ||
              line.lineStatus === "PENDING");
          return (
            <Card
              key={line.id}
              className={
                line.lineStatus === "DISCREPANCY"
                  ? "border-amber-300 bg-amber-50/50"
                  : line.lineStatus === "ADJUSTED"
                  ? "border-blue-300 bg-blue-50/50"
                  : ""
              }
            >
              <CardContent className="p-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  {isSelectable && (
                    <div className="md:col-span-1 flex items-center">
                      <Checkbox
                        checked={selected.has(line.id)}
                        onCheckedChange={() => toggleLine(line.id)}
                      />
                    </div>
                  )}

                  <div
                    className={
                      isSelectable ? "md:col-span-4" : "md:col-span-5"
                    }
                  >
                    <div className="font-medium text-sm">
                      {line.productName ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Lô: {line.batchNo ?? "—"}
                    </div>
                  </div>

                  <div className="md:col-span-2 text-sm">
                    <div className="text-muted-foreground text-xs">Sổ</div>
                    <div>{line.systemQty ?? 0}</div>
                  </div>

                  <div className="md:col-span-2 text-sm">
                    <div className="text-muted-foreground text-xs">Thực tế</div>
                    <div>{line.countedQty ?? "—"}</div>
                  </div>

                  <div className="md:col-span-2 text-sm">
                    <div className="text-muted-foreground text-xs">Chênh lệch</div>
                    {line.discrepancy == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : line.discrepancy === 0 ? (
                      <span className="text-green-600">Khớp</span>
                    ) : (
                      <span
                        className={
                          line.discrepancy > 0
                            ? "text-blue-600 font-semibold"
                            : "text-red-600 font-semibold"
                        }
                      >
                        {line.discrepancy > 0 ? "+" : ""}
                        {line.discrepancy}
                        <div className="text-xs text-muted-foreground">
                          {new Intl.NumberFormat("vi-VN").format(
                            line.discrepancyValue ?? 0
                          )}
                          ₫
                        </div>
                      </span>
                    )}
                  </div>

                  <div className="md:col-span-1 flex justify-end">
                    <Badge
                      className={
                        STOCK_TAKE_LINE_STATUS_COLORS[
                          line.lineStatus as StockTakeLineStatus
                        ] ?? "bg-gray-100"
                      }
                    >
                      {STOCK_TAKE_LINE_STATUS_LABELS[
                        line.lineStatus as StockTakeLineStatus
                      ] ?? line.lineStatus}
                    </Badge>
                  </div>
                </div>

                {line.discrepancyReason && (
                  <div className="mt-2 pt-2 border-t text-xs">
                    <div className="text-muted-foreground">
                      <strong>
                        {STOCK_TAKE_DISCREPANCY_CATEGORY_LABELS[
                          line.discrepancyCategory as StockTakeDiscrepancyCategory
                        ] ?? line.discrepancyCategory}
                        :
                      </strong>{" "}
                      {line.discrepancyReason}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <Dialog open={rejectModal} onOpenChange={setRejectModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yêu cầu kiểm lại</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Hệ thống sẽ chuyển đợt kiểm kê về trạng thái hủy và thông báo cho thủ kho
                kiểm lại.
              </p>
              <Label>Lý do (bắt buộc)</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Vd: Số liệu chênh lệch bất thường, cần kiểm lại 3 lô L123, L456..."
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRejectModal(false)}>
                Quay lại
              </Button>
              <Button
                variant="destructive"
                disabled={rejectReason.trim().length < 10}
                onClick={async () => {
                  await reject.mutateAsync({ stockTakeId, reason: rejectReason });
                  router.push("/stocktake");
                }}
              >
                Xác nhận từ chối
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
