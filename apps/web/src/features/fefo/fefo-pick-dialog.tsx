"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2, X } from "lucide-react";
import {
  useFefoPick,
  useFefoOverride,
  FEFO_OVERRIDE_REASON_LABELS,
  type FefoPickRequest,
  type FefoPickResponse,
  type FefoPickLine,
  type FefoOverrideReason,
} from "./api";

interface FefoPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProductId?: string;
  defaultWarehouseId?: string;
  defaultQuantity?: number;
  documentType?: string;
  documentId?: string;
  documentNumber?: string;
  onSuccess?: () => void;
}

export function FefoPickDialog({
  open,
  onOpenChange,
  defaultProductId = "",
  defaultWarehouseId = "",
  defaultQuantity = 1,
  documentType,
  documentId,
  documentNumber,
  onSuccess,
}: FefoPickDialogProps) {
  const [productId, setProductId] = useState(defaultProductId);
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [pickResult, setPickResult] = useState<FefoPickResponse | null>(null);
  const [overrideLotId, setOverrideLotId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] =
    useState<FefoOverrideReason>("FEFO_INSUFFICIENT");
  const [overrideDescription, setOverrideDescription] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const pickMutation = useFefoPick();
  const overrideMutation = useFefoOverride();

  const handlePick = async () => {
    if (!productId || !warehouseId || quantity <= 0) return;
    const req: FefoPickRequest = {
      productId,
      warehouseId,
      quantity,
      documentType,
      documentId,
      documentNumber,
    };
    const result = await pickMutation.mutateAsync(req);
    setPickResult(result);
    setShowOverrideForm(false);
  };

  const handleOverride = async () => {
    if (!pickResult || !overrideLotId || overrideDescription.length < 10) return;
    await overrideMutation.mutateAsync({
      productId,
      warehouseId,
      requestedQuantity: quantity,
      actualLotId: overrideLotId,
      overrideReason,
      overrideDescription,
      documentType,
      documentId,
      documentNumber,
    });
    onSuccess?.();
    onOpenChange(false);
  };

  const handleReset = () => {
    setPickResult(null);
    setOverrideLotId(null);
    setOverrideDescription("");
    setShowOverrideForm(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleReset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📦 Auto-pick FEFO (First-Expire-First-Out)
          </DialogTitle>
          <DialogDescription>
            Hệ thống tự động chọn lô ưu tiên: <strong>open-vial sắp hết</strong> → <strong>HSD gốc sớm nhất</strong>
          </DialogDescription>
        </DialogHeader>

        {!pickResult ? (
          // ============== Step 1: Nhập input ==============
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="fefo-product">Product ID</Label>
                <Input
                  id="fefo-product"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="UUID"
                />
              </div>
              <div>
                <Label htmlFor="fefo-warehouse">Warehouse ID</Label>
                <Input
                  id="fefo-warehouse"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  placeholder="UUID"
                />
              </div>
              <div>
                <Label htmlFor="fefo-qty">Số lượng cần xuất</Label>
                <Input
                  id="fefo-qty"
                  type="number"
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
            </div>

            {documentNumber && (
              <div className="text-sm text-muted-foreground">
                Phiếu: <strong>{documentNumber}</strong>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button
                onClick={handlePick}
                disabled={!productId || !warehouseId || quantity <= 0 || pickMutation.isPending}
              >
                {pickMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang tính...
                  </>
                ) : (
                  <>🎯 Auto-pick FEFO</>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // ============== Step 2: Hiển thị kết quả pick ==============
          <div className="space-y-4">
            {/* Warnings */}
            {pickResult.warnings.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Cảnh báo lô sắp hết hạn</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc ml-4">
                    {pickResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Shortage */}
            {!pickResult.isSufficient && (
              <Alert variant="destructive">
                <X className="h-4 w-4" />
                <AlertTitle>Không đủ hàng</AlertTitle>
                <AlertDescription>
                  Cần {pickResult.totalRequested}, chỉ pick được{" "}
                  {pickResult.totalPicked}, thiếu{" "}
                  <strong>{pickResult.shortage}</strong>. Vui lòng nhập thêm hàng hoặc
                  chọn kho khác.
                </AlertDescription>
              </Alert>
            )}

            {/* Picks table */}
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Lô</th>
                    <th className="px-2 py-2 text-left">HSD gốc</th>
                    <th className="px-2 py-2 text-left">Open-vial</th>
                    <th className="px-2 py-2 text-right">SL pick</th>
                    <th className="px-2 py-2 text-left">Lý do</th>
                    <th className="px-2 py-2 text-center">Chọn</th>
                  </tr>
                </thead>
                <tbody>
                  {pickResult.picks.map((p) => (
                    <FefoPickRow
                      key={p.lotId}
                      pick={p}
                      selected={overrideLotId === p.lotId}
                      onSelect={() => setOverrideLotId(p.lotId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div>
                Tổng: <strong>{pickResult.totalPicked}</strong> /{" "}
                {pickResult.totalRequested}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOverrideForm(!showOverrideForm)}
              >
                📝 Chọn lô khác FEFO
              </Button>
            </div>

            {/* Override form */}
            {showOverrideForm && (
              <div className="rounded-md border p-4 space-y-3 bg-yellow-50">
                <div className="text-sm font-medium text-yellow-900">
                  ⚠️ Override FEFO (sẽ ghi audit log)
                </div>
                <div>
                  <Label htmlFor="override-reason">Lý do</Label>
                  <Select
                    value={overrideReason}
                    onValueChange={(v) => setOverrideReason(v as FefoOverrideReason)}
                  >
                    <SelectTrigger id="override-reason">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FEFO_OVERRIDE_REASON_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="override-desc">Mô tả chi tiết (≥ 10 ký tự)</Label>
                  <Textarea
                    id="override-desc"
                    value={overrideDescription}
                    onChange={(e) => setOverrideDescription(e.target.value)}
                    placeholder={
                      overrideReason === "EMERGENCY"
                        ? "Vd: Bệnh nhân cấp cứu lúc 23h, không có lô APPROVED, kết quả XN sẽ được kiểm tra chéo..."
                        : "Vd: L001 chỉ còn 5 chai, không đủ cho 10 yêu cầu..."
                    }
                    rows={3}
                  />
                </div>
                {overrideReason === "EMERGENCY" && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Lưu ý cấp cứu</AlertTitle>
                    <AlertDescription>
                      Nếu chọn lô HẾT HẠN, mô tả phải ≥ 50 ký tự và DEPT_HEAD sẽ nhận
                      cảnh báo CRITICAL ngay lập tức.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={handleOverride}
                  disabled={
                    !overrideLotId ||
                    overrideDescription.length < 10 ||
                    overrideMutation.isPending
                  }
                  variant="destructive"
                >
                  {overrideMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang ghi audit...
                    </>
                  ) : (
                    <>💾 Lưu override & ghi audit</>
                  )}
                </Button>
              </div>
            )}

            {!showOverrideForm && pickResult.isSufficient && (
              <DialogFooter>
                <Button variant="outline" onClick={handleReset}>
                  Pick lại
                </Button>
                <Button
                  onClick={() => {
                    onSuccess?.();
                    onOpenChange(false);
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Dùng auto-pick (tuân thủ FEFO)
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FefoPickRow({
  pick,
  selected,
  onSelect,
}: {
  pick: FefoPickLine;
  selected: boolean;
  onSelect: () => void;
}) {
  const daysLeft = (date: string) => {
    return Math.floor(
      (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
  };

  const mainExpiration = pick.openVialExpirationDate || pick.expirationDate;
  const days = daysLeft(mainExpiration);
  const colorClass =
    days < 0
      ? "bg-red-100 text-red-800"
      : days < 7
      ? "bg-red-50 text-red-700"
      : days < 15
      ? "bg-yellow-50 text-yellow-700"
      : "bg-green-50 text-green-700";

  return (
    <tr className={selected ? "bg-blue-50" : ""}>
      <td className="px-2 py-2">{pick.pickOrder}</td>
      <td className="px-2 py-2 font-medium">{pick.lotNumber}</td>
      <td className="px-2 py-2">
        {pick.expirationDate}
        <span className="ml-1 text-xs text-muted-foreground">
          ({daysLeft(pick.expirationDate)}d)
        </span>
      </td>
      <td className="px-2 py-2">
        {pick.isOpenVial ? (
          <Badge variant="outline" className="text-xs">
            {pick.openVialExpirationDate}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-right font-medium">{pick.pickQuantity}</td>
      <td className="px-2 py-2">
        <Badge className={colorClass}>{pick.pickReason}</Badge>
      </td>
      <td className="px-2 py-2 text-center">
        <input
          type="radio"
          name="fefo-override-lot"
          checked={selected}
          onChange={onSelect}
          className="h-4 w-4"
        />
      </td>
    </tr>
  );
}
