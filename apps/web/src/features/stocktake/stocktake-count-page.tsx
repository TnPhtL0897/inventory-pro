"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useStockTake,
  useCountStockTakeLine,
  useSetStockTakeLineReason,
  useSubmitStockTakeForApproval,
  useCancelStockTake,
} from "./api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type StockTakeLineStatus,
  type StockTakeDiscrepancyCategory,
} from "@inventorypro/shared-types";
import {
  ChevronLeft,
  Save,
  Send,
  Ban,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export function StockTakeCountPage({ stockTakeId }: { stockTakeId: string }) {
  const router = useRouter();
  const { data, isLoading } = useStockTake(stockTakeId);
  const countLine = useCountStockTakeLine();
  const setReason = useSetStockTakeLineReason();
  const submit = useSubmitStockTakeForApproval();
  const cancel = useCancelStockTake();

  const [filter, setFilter] = useState<"all" | StockTakeLineStatus>("all");
  const [search, setSearch] = useState("");
  const [reasonModal, setReasonModal] = useState<{
    lineId: string;
    productName: string;
    countedQty: number;
    systemQty: number;
    discrepancy: number;
  } | null>(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const status = data?.status;
  const lines: any[] = data?.lines ?? [];
  const canEdit = status === "DRAFT" || status === "COUNTED";

  const filtered = useMemo(() => {
    return lines.filter((l) => {
      if (filter !== "all" && l.line_status !== filter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !l.product_name?.toLowerCase().includes(s) &&
          !l.batch_no?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [lines, filter, search]);

  // Stats
  const totalCount = lines.length;
  const countedCount = lines.filter(
    (l) => l.line_status === "COUNTED" || l.line_status === "DISCREPANCY" || l.line_status === "ADJUSTED"
  ).length;
  const pendingCount = lines.filter((l) => l.line_status === "PENDING").length;
  const discrepancyCount = lines.filter((l) => l.discrepancy && l.discrepancy !== 0).length;
  const totalDiscrepancyValue = lines.reduce(
    (sum, l) => sum + (l.discrepancy_value ?? 0),
    0
  );

  if (isLoading || !data) {
    return <div className="py-8 text-center text-muted-foreground">Đang tải...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/stocktake")}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <CardTitle>
                {data.stock_take_number ?? `ST-${data.period_year}-${String(data.period_month).padStart(2, "0")}`}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {data.product_group === "HOA_CHAT_SINH_PHAM" ? "Hóa chất - Sinh phẩm" : "Vật tư y tế"} •{" "}
                Kho: {data.warehouse_ids?.length ?? 0} •{" "}
                Tháng {String(data.period_month).padStart(2, "0")}/{data.period_year}
              </p>
            </div>
            <Badge className={data.status === "POSTED" ? "bg-amber-100" : "bg-gray-100"}>
              {status === "DRAFT"
                ? "Nháp - đang đếm"
                : status === "COUNTED"
                ? "Đã đếm xong"
                : status === "POSTED"
                ? "Chờ Trưởng khoa duyệt"
                : status === "CANCELLED"
                ? "Đã hủy"
                : status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Tổng lô</div>
              <div className="text-2xl font-bold">{totalCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Đã đếm</div>
              <div className="text-2xl font-bold text-green-600">
                {countedCount}
                {pendingCount > 0 && (
                  <span className="text-sm text-muted-foreground ml-1">
                    (còn {pendingCount})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Có chênh lệch</div>
              <div className="text-2xl font-bold text-amber-600">{discrepancyCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Tổng giá trị lệch</div>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat("vi-VN").format(totalDiscrepancyValue)} ₫
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Tìm theo tên SP / số lô..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="PENDING">Chưa đếm</SelectItem>
            <SelectItem value="COUNTED">Đã đếm (khớp)</SelectItem>
            <SelectItem value="DISCREPANCY">Có chênh lệch</SelectItem>
            <SelectItem value="ADJUSTED">Đã duyệt</SelectItem>
            <SelectItem value="SKIPPED">Bỏ qua</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lines */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Không có dòng nào khớp bộ lọc
            </CardContent>
          </Card>
        ) : (
          filtered.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              canEdit={canEdit}
              onCount={async (qty) => {
                await countLine.mutateAsync({ lineId: line.id, countedQty: qty });
              }}
              onOpenReason={() =>
                setReasonModal({
                  lineId: line.id,
                  productName: line.product_name ?? "",
                  countedQty: line.counted_qty ?? 0,
                  systemQty: line.system_qty ?? 0,
                  discrepancy: line.discrepancy ?? 0,
                })
              }
            />
          ))
        )}
      </div>

      {/* Action bar */}
      {canEdit && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setCancelModal(true)}
                disabled={cancel.isPending}
              >
                <Ban className="h-4 w-4 mr-2" />
                Hủy đợt
              </Button>
              <Button
                onClick={() => submit.mutate(stockTakeId)}
                disabled={submit.isPending || pendingCount > 0}
              >
                <Send className="h-4 w-4 mr-2" />
                Gửi Trưởng khoa duyệt
              </Button>
            </div>
            {pendingCount > 0 && (
              <p className="text-xs text-amber-600 mt-2 text-right">
                ⚠️ Còn {pendingCount} lô chưa đếm. Vui lòng đếm hết trước khi gửi.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reason modal */}
      {reasonModal && (
        <ReasonModal
          data={reasonModal}
          onClose={() => setReasonModal(null)}
          onSave={async (category, reason) => {
            await setReason.mutateAsync({
              lineId: reasonModal.lineId,
              category,
              reason,
            });
            setReasonModal(null);
          }}
        />
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <Dialog open={cancelModal} onOpenChange={setCancelModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hủy đợt kiểm kê?</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Lý do hủy</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do hủy..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelModal(false)}>
                Quay lại
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await cancel.mutateAsync({
                    stockTakeId,
                    reason: cancelReason,
                  });
                  setCancelModal(false);
                  router.push("/stocktake");
                }}
              >
                Xác nhận hủy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// =============================================================================
// Line row
// =============================================================================

function LineRow({
  line,
  canEdit,
  onCount,
  onOpenReason,
}: {
  line: any;
  canEdit: boolean;
  onCount: (qty: number) => Promise<void>;
  onOpenReason: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftQty, setDraftQty] = useState<string>(line.counted_qty?.toString() ?? "");

  const isPending = line.line_status === "PENDING";
  const isDiscrepancy = line.line_status === "DISCREPANCY";
  const isAdjusted = line.line_status === "ADJUSTED";

  const handleSave = async () => {
    const qty = parseFloat(draftQty);
    if (isNaN(qty) || qty < 0) return;
    await onCount(qty);
    setEditing(false);
  };

  return (
    <Card
      className={
        isDiscrepancy
          ? "border-amber-300 bg-amber-50/50"
          : isAdjusted
          ? "border-blue-300 bg-blue-50/50"
          : ""
      }
    >
      <CardContent className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          {/* Product info */}
          <div className="md:col-span-4">
            <div className="font-medium text-sm">{line.product_name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              Lô: {line.batch_no ?? "—"} • ĐVT: {line.unit_code ?? "—"}
            </div>
          </div>

          {/* System qty */}
          <div className="md:col-span-2 text-sm">
            <div className="text-muted-foreground text-xs">Sổ</div>
            <div className="font-semibold">{line.system_qty ?? 0}</div>
          </div>

          {/* Counted qty */}
          <div className="md:col-span-2 text-sm">
            <div className="text-muted-foreground text-xs">Thực tế</div>
            {editing ? (
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={draftQty}
                  onChange={(e) => setDraftQty(e.target.value)}
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
                <Button size="sm" variant="ghost" onClick={handleSave} className="h-7 px-2">
                  <Save className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div
                className={`font-semibold ${isPending ? "text-muted-foreground" : ""}`}
              >
                {line.counted_qty ?? "—"}
              </div>
            )}
          </div>

          {/* Discrepancy */}
          <div className="md:col-span-2 text-sm">
            <div className="text-muted-foreground text-xs">Chênh lệch</div>
            {line.discrepancy == null ? (
              <span className="text-muted-foreground">—</span>
            ) : line.discrepancy === 0 ? (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Khớp
              </span>
            ) : (
              <span
                className={`font-semibold ${
                  line.discrepancy > 0 ? "text-blue-600" : "text-red-600"
                }`}
              >
                {line.discrepancy > 0 ? "+" : ""}
                {line.discrepancy}
                <span className="text-xs text-muted-foreground ml-1">
                  ({new Intl.NumberFormat("vi-VN").format(line.discrepancy_value ?? 0)}₫)
                </span>
              </span>
            )}
          </div>

          {/* Status + Actions */}
          <div className="md:col-span-2 flex flex-col items-end gap-1">
            <Badge className={STOCK_TAKE_LINE_STATUS_COLORS[line.line_status as StockTakeLineStatus] ?? "bg-gray-100"}>
              {STOCK_TAKE_LINE_STATUS_LABELS[line.line_status as StockTakeLineStatus] ?? line.line_status}
            </Badge>
            <div className="flex gap-1">
              {canEdit && isPending && !editing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  className="h-6 text-xs"
                >
                  Đếm
                </Button>
              )}
              {canEdit && isDiscrepancy && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenReason}
                  className="h-6 text-xs"
                >
                  {line.discrepancy_reason ? "Sửa lý do" : "Nhập lý do"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {isDiscrepancy && line.discrepancy_reason && (
          <div className="mt-2 pt-2 border-t text-xs">
            <div className="text-muted-foreground">
              {STOCK_TAKE_DISCREPANCY_CATEGORY_LABELS[
                line.discrepancy_category as StockTakeDiscrepancyCategory
              ] ?? line.discrepancy_category}
              : {line.discrepancy_reason}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Reason modal
// =============================================================================

function ReasonModal({
  data,
  onClose,
  onSave,
}: {
  data: {
    lineId: string;
    productName: string;
    countedQty: number;
    systemQty: number;
    discrepancy: number;
  };
  onClose: () => void;
  onSave: (
    category: StockTakeDiscrepancyCategory,
    reason: string
  ) => Promise<void>;
}) {
  const [category, setCategory] =
    useState<StockTakeDiscrepancyCategory>("OTHER");
  const [reason, setReason] = useState("");

  const diffType = data.discrepancy > 0 ? "THỪA" : "THIẾU";
  const percent =
    data.systemQty > 0
      ? Math.abs((data.discrepancy / data.systemQty) * 100).toFixed(1)
      : "—";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <AlertTriangle className="inline h-5 w-5 mr-2 text-amber-600" />
            Nhập lý do chênh lệch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm">
            <div className="font-medium">{data.productName}</div>
            <div className="text-muted-foreground">
              Sổ: {data.systemQty} | Thực tế: {data.countedQty} | Chênh lệch:{" "}
              <span
                className={
                  data.discrepancy > 0 ? "text-blue-600" : "text-red-600"
                }
              >
                {data.discrepancy > 0 ? "+" : ""}
                {data.discrepancy} ({diffType}, {percent}%)
              </span>
            </div>
          </div>

          <div>
            <Label>Phân loại (bắt buộc)</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as StockTakeDiscrepancyCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STOCK_TAKE_DISCREPANCY_CATEGORY_LABELS).map(
                  ([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Mô tả chi tiết (≥ 10 ký tự)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Vd: 2 chai bị vỡ trong quá trình sử dụng ngày 25/06..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              {reason.length}/10 ký tự tối thiểu
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={() => onSave(category, reason)}
            disabled={reason.trim().length < 10}
          >
            Lưu lý do
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
