"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  Beaker,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Package,
  Printer,
} from "lucide-react";
import {
  useOpenVial,
  useOpenVialQcRetest,
  useOpenVialExpiring,
  useOpenVialStatus,
  ALERT_LEVEL_COLORS,
  ALERT_LEVEL_LABELS,
  type OpenVialExpiringItem,
} from "@/features/open-vial/api";

export default function OpenVialPage() {
  const [openDialogLotId, setOpenDialogLotId] = useState<string | null>(null);
  const [qcDialogLotId, setQcDialogLotId] = useState<string | null>(null);

  const { data: expiring, isLoading } = useOpenVialExpiring();
  const expiringList: OpenVialExpiringItem[] = Array.isArray(expiring)
    ? expiring
    : (expiring as any)?.data ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            🧪 Open-Vial Tracking
          </h1>
          <p className="text-muted-foreground mt-1">
            Quản lý lô HC-SP sau khi mở nắp: ghi nhận, theo dõi volume, QC lại
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sắp hết hạn open-vial</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expiringList.filter((e) => e.alertLevel === "CRITICAL").length}
            </div>
            <p className="text-xs text-muted-foreground">
              CRITICAL — cần QC lại hoặc hủy
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cảnh báo</CardTitle>
            <Beaker className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expiringList.filter((e) => e.alertLevel === "WARNING").length}
            </div>
            <p className="text-xs text-muted-foreground">7 ngày trước hết hạn</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng lô IN_USE</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Xem chi tiết bên dưới</p>
          </CardContent>
        </Card>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {/* Expiring list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            📋 Danh sách open-vial sắp hết hạn
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expiringList.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              ✅ Không có open-vial nào sắp hết hạn trong 7 ngày tới
            </p>
          )}

          {expiringList.length > 0 && (
            <div className="space-y-2">
              {expiringList.map((item) => (
                <div
                  key={item.lotId}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Badge className={ALERT_LEVEL_COLORS[item.alertLevel]}>
                      {ALERT_LEVEL_LABELS[item.alertLevel]}
                    </Badge>
                    <div>
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        Lô: <span className="font-mono">{item.lotNumber}</span> · SKU: {item.productSku}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {item.daysUntilExpiry < 0
                        ? `Quá ${Math.abs(item.daysUntilExpiry)} ngày`
                        : item.daysUntilExpiry === 0
                        ? "Hết hạn hôm nay"
                        : `Còn ${item.daysUntilExpiry} ngày`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      HSD: {item.openVialExpirationDate}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-3"
                    onClick={() => setQcDialogLotId(item.lotId)}
                  >
                    🧪 QC lại
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <OpenVialActionDialog
        open={!!openDialogLotId}
        lotId={openDialogLotId}
        onOpenChange={(o) => !o && setOpenDialogLotId(null)}
      />
      <OpenVialQcRetestDialog
        open={!!qcDialogLotId}
        lotId={qcDialogLotId}
        onOpenChange={(o) => !o && setQcDialogLotId(null)}
      />
    </div>
  );
}

// =============================================================================
// Dialog: Mở nắp
// =============================================================================

function OpenVialActionDialog({
  open,
  lotId,
  onOpenChange,
}: {
  open: boolean;
  lotId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [quantityTaken, setQuantityTaken] = useState(0);
  const [quantityRemaining, setQuantityRemaining] = useState(0);
  const [notes, setNotes] = useState("");

  const { mutate, isPending } = useOpenVial();
  const { data: status } = useOpenVialStatus(lotId);

  const handleSubmit = () => {
    if (!lotId) return;
    mutate(
      {
        action: "open",
        lotId,
        quantityTaken,
        quantityRemaining,
        notes,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🧪 Mở nắp lọ HC-SP</DialogTitle>
          <DialogDescription>
            Ghi nhận ngày mở + lượng lấy ra. Nhãn sẽ tự động in.
          </DialogDescription>
        </DialogHeader>

        {status && status.isOpen && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Lô đã mở nắp trước đó</AlertTitle>
            <AlertDescription>
              Mở nắp lần {status.openVialCount + 1} · Còn{" "}
              {status.volumeRemaining?.toFixed(1)} ml · HSD open-vial:{" "}
              {status.openVialExpirationDate}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="qty-taken">Lượng lấy ra (ml)</Label>
            <Input
              id="qty-taken"
              type="number"
              step="0.1"
              value={quantityTaken}
              onChange={(e) => setQuantityTaken(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="qty-remaining">Lượng còn lại (ml)</Label>
            <Input
              id="qty-remaining"
              type="number"
              step="0.1"
              value={quantityRemaining}
              onChange={(e) => setQuantityRemaining(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="notes">Ghi chú (tuỳ chọn)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vd: mở nắp để chạy QC ban đầu"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !lotId}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang ghi...
              </>
            ) : (
              <>
                <Printer className="mr-2 h-4 w-4" />
                Mở nắp + in nhãn
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Dialog: QC retest
// =============================================================================

function OpenVialQcRetestDialog({
  open,
  lotId,
  onOpenChange,
}: {
  open: boolean;
  lotId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [qcMethod, setQcMethod] = useState("Control Normal + Pathological");
  const [qcResult, setQcResult] = useState<"PASS" | "FAIL" | "PENDING">("PASS");
  const [qcNotes, setQcNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const { mutate, isPending } = useOpenVialQcRetest();
  const { data: status } = useOpenVialStatus(lotId);

  const handleSubmit = () => {
    if (!lotId) return;
    mutate(
      {
        lotId,
        qcMethod,
        qcResult,
        qcNotes,
        validUntil: validUntil || undefined,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🧪 QC lại open-vial</DialogTitle>
          <DialogDescription>
            Bắt buộc khi open-vial đã hết hạn. QC_OFFICER thực hiện.
          </DialogDescription>
        </DialogHeader>

        {status && status.needsQcRetest && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Cần QC lại</AlertTitle>
            <AlertDescription>{status.qcRetestReason}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="qc-method">Phương pháp QC</Label>
            <Input
              id="qc-method"
              value={qcMethod}
              onChange={(e) => setQcMethod(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qc-result">Kết quả</Label>
            <Select
              value={qcResult}
              onValueChange={(v) => setQcResult(v as typeof qcResult)}
            >
              <SelectTrigger id="qc-result">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PASS">
                  <CheckCircle2 className="inline h-4 w-4 mr-2 text-green-600" />
                  PASS
                </SelectItem>
                <SelectItem value="FAIL">
                  <XCircle className="inline h-4 w-4 mr-2 text-red-600" />
                  FAIL
                </SelectItem>
                <SelectItem value="PENDING">⏳ PENDING</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="qc-notes">Ghi chú (≥ 10 ký tự)</Label>
            <Textarea
              id="qc-notes"
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              rows={3}
            />
          </div>
          {qcResult === "PASS" && (
            <div>
              <Label htmlFor="valid-until">Có hiệu lực đến (optional)</Label>
              <Input
                id="valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !lotId || qcNotes.length < 10}
            variant={qcResult === "FAIL" ? "destructive" : "default"}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang ghi...
              </>
            ) : (
              <>💾 Lưu kết quả QC</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
