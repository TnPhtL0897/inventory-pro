"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useWeeklyReplenishmentRun,
  useSubmitReplenishmentForReview,
  useConfirmReplenishmentByDailyRun,
  useApproveReplenishment,
  useCancelReplenishment,
} from "./api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  REPLENISHMENT_RUN_STATUS_LABELS,
  REPLENISHMENT_RUN_STATUS_COLORS,
  REPLENISHMENT_APPROVAL_THRESHOLD_VND,
  type ReplenishmentRunStatus,
  type ProductGroup,
} from "@inventorypro/shared-types";
import { AdjustQtyModal } from "./adjust-qty-modal";
import { ChevronLeft, Send, Check, X, Ban } from "lucide-react";

export function WeeklyDetailPage({ runId }: { runId: string }) {
  const router = useRouter();
  const { data: run, isLoading } = useWeeklyReplenishmentRun(runId);
  const submitForReview = useSubmitReplenishmentForReview();
  const confirmByDaily = useConfirmReplenishmentByDailyRun();
  const approve = useApproveReplenishment();
  const cancel = useCancelReplenishment();

  const [adjustLine, setAdjustLine] = useState<{
    id: string;
    qty: number;
    name: string;
    maxStock: number;
    currentDailyQty: number;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  if (isLoading || !run) {
    return <div className="py-8 text-center text-muted-foreground">Đang tải...</div>;
  }

  const status = run.status as ReplenishmentRunStatus;
  const lines = run.lines ?? [];
  const canAdjustLine = status === "DRAFT" || status === "REVIEWED";
  const canSubmitForReview = status === "DRAFT";
  const canConfirmByDaily = status === "REVIEWED";
  const canApprove = status === "CONFIRMED_BY_DAILY" && run.requires_dept_head_approval;
  const canCancel = ["DRAFT", "REVIEWED", "CONFIRMED_BY_DAILY"].includes(status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/replenishment/weekly")}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle>
                {run.product_group === "HOA_CHAT_SINH_PHAM" ? "HC-SP" : "VTYT"} -{" "}
                {new Date(run.period_date).toLocaleDateString("vi-VN")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                ISO Week {run.iso_week}/{run.period_year} • {run.triggered_by === "CRON" ? "Tự động" : "Thủ công"}
              </p>
            </div>
            <Badge className={REPLENISHMENT_RUN_STATUS_COLORS[status]}>
              {REPLENISHMENT_RUN_STATUS_LABELS[status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Tổng SP</div>
              <div className="text-2xl font-bold">{lines.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Tổng SL</div>
              <div className="text-2xl font-bold">
                {lines.reduce((sum: number, l: any) => sum + (l.final_qty || 0), 0)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Giá trị ước tính</div>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat("vi-VN").format(run.total_estimated_value || 0)} ₫
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Cần duyệt</div>
              <div className="text-2xl font-bold">
                {run.requires_dept_head_approval ? (
                  <Badge className="bg-orange-100 text-orange-800">Có</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-800">Tự động</Badge>
                )}
              </div>
            </div>
          </div>

          {run.requires_dept_head_approval && (run.total_estimated_value ?? 0) > REPLENISHMENT_APPROVAL_THRESHOLD_VND && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <strong className="text-amber-900">⚠️ Vượt ngưỡng {REPLENISHMENT_APPROVAL_THRESHOLD_VND / 1_000_000}M VNĐ</strong>
              <p className="text-amber-700 text-xs mt-1">
                Cần Trưởng khoa duyệt trước khi tạo phiếu chuyển kho.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons theo status */}
      <div className="flex flex-wrap gap-2">
        {canSubmitForReview && (
          <Button onClick={() => submitForReview.mutate(runId)} disabled={submitForReview.isPending}>
            <Send className="h-4 w-4 mr-1" />
            Gửi cho kho lẻ xác nhận
          </Button>
        )}
        {canConfirmByDaily && (
          <Button onClick={() => confirmByDaily.mutate(runId)} disabled={confirmByDaily.isPending}>
            <Check className="h-4 w-4 mr-1" />
            Xác nhận + Tự động duyệt
          </Button>
        )}
        {canApprove && (
          <>
            <Button onClick={() => approve.mutate({ runId, approved: true })} disabled={approve.isPending}>
              <Check className="h-4 w-4 mr-1" />
              Duyệt (Trưởng khoa)
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectReason.length < 5) {
                  alert("Vui lòng nhập lý do từ chối (tối thiểu 5 ký tự)");
                  return;
                }
                approve.mutate({ runId, approved: false, reason: rejectReason });
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Từ chối
            </Button>
          </>
        )}
        {canCancel && (
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Hủy đề xuất này?")) {
                cancel.mutate({ runId });
              }
            }}
            disabled={cancel.isPending}
          >
            <Ban className="h-4 w-4 mr-1" />
            Hủy đề xuất
          </Button>
        )}
      </div>

      {canApprove && (
        <div>
          <Label htmlFor="reject-reason">Lý do từ chối (nếu có)</Label>
          <Textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            placeholder="Lý do..."
            className="mt-1"
          />
        </div>
      )}

      {/* Lines table */}
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết sản phẩm</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">Chưa có sản phẩm nào</div>
          ) : (
            <div className="space-y-2">
              {lines.map((l: any) => (
                <div key={l.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-medium">
                        {l.product?.name ?? "(không rõ)"}{" "}
                        <code className="text-xs text-muted-foreground">{l.product?.sku}</code>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                        <span>Tồn lẻ: {l.current_daily_qty}</span>
                        <span>Tồn chẵn: {l.current_bulk_qty}</span>
                        <span>TB 3T: {l.avg_3m_weekly?.toFixed(1) ?? "—"}/tuần</span>
                        <span>Tuần NT: {l.consumption_last_week}</span>
                        {l.lot && (
                          <span>
                            Lô: <code>{l.lot.lot_number}</code> HSD{" "}
                            {new Date(l.lot.expiration_date).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Đề xuất:</span>
                        <span className="font-mono text-lg">{l.suggested_qty}</span>
                      </div>
                      {l.adjusted_qty !== null && l.adjusted_qty !== l.suggested_qty && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Đã điều chỉnh:</span>
                          <Badge className="bg-blue-100 text-blue-800 font-mono">
                            {l.adjusted_qty}
                          </Badge>
                        </div>
                      )}
                      {l.daily_requested_qty !== null && l.daily_requested_qty !== l.final_qty && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Kho lẻ yêu cầu:</span>
                          <Badge className="bg-cyan-100 text-cyan-800 font-mono">
                            {l.daily_requested_qty}
                          </Badge>
                        </div>
                      )}
                      {canAdjustLine && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAdjustLine({
                              id: l.id,
                              qty: l.adjusted_qty ?? l.suggested_qty,
                              name: l.product?.name ?? "",
                              maxStock: l.product?.max_stock ?? 999,
                              currentDailyQty: l.current_daily_qty,
                            })
                          }
                        >
                          Điều chỉnh
                        </Button>
                      )}
                    </div>
                  </div>
                  {l.adjustment_history && l.adjustment_history.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Lịch sử điều chỉnh ({l.adjustment_history.length})
                      </summary>
                      <div className="mt-2 pl-3 border-l-2 space-y-1">
                        {l.adjustment_history.map((h: any, i: number) => (
                          <div key={i}>
                            <code>{h.at}</code>: {h.from} → {h.to} (by {h.by_role}) — "{h.reason}"
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {adjustLine && (
        <AdjustQtyModal
          lineId={adjustLine.id}
          currentQty={adjustLine.qty}
          productName={adjustLine.name}
          maxStock={adjustLine.maxStock}
          currentDailyQty={adjustLine.currentDailyQty}
          open={!!adjustLine}
          onOpenChange={(o) => !o && setAdjustLine(null)}
        />
      )}
    </div>
  );
}
