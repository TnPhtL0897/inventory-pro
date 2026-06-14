"use client";

import { useState, useEffect } from "react";
import { useLot, useRecordOpenVial } from "./api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Syringe, AlertTriangle } from "lucide-react";
import { LOT_STATUS_LABELS } from "@inventorypro/shared-types";

export function LotOpenVialModal({
  lotId,
  open,
  onOpenChange,
}: {
  lotId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: lot, isLoading } = useLot(lotId);
  const recordOpenVial = useRecordOpenVial();

  const [openedAt, setOpenedAt] = useState(new Date().toISOString().split("T")[0]);
  const [quantityTaken, setQuantityTaken] = useState<number>(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setOpenedAt(new Date().toISOString().split("T")[0]);
      setQuantityTaken(0);
      setNotes("");
    }
  }, [open]);

  if (isLoading || !lot) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center text-muted-foreground">Đang tải...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const productStability = lot.product?.open_vial_stability_days;
  const currentRemaining =
    lot.open_vial_quantity_remaining ?? lot.quantity;
  const newRemaining = currentRemaining - quantityTaken;

  const expDate = (() => {
    if (!productStability || !openedAt) return null;
    const d = new Date(openedAt);
    d.setDate(d.getDate() + productStability);
    return d.toISOString().split("T")[0];
  })();

  const hasNoStability = !productStability;

  const handleSubmit = async () => {
    if (quantityTaken <= 0) return;
    await recordOpenVial.mutateAsync({
      lotId,
      openedAt,
      quantityTaken,
      notes: notes || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Syringe className="h-5 w-5" />
            Ghi nhận mở nắp
          </DialogTitle>
          <DialogDescription>
            Lô: <strong className="font-mono">{lot.lot_number}</strong>
            <br />
            SP: {lot.product?.name}
          </DialogDescription>
        </DialogHeader>

        {hasNoStability && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              <strong className="text-amber-900">Chưa cấu hình open-vial stability</strong>
              <p className="text-amber-700 text-xs mt-1">
                Sản phẩm chưa có open_vial_stability_days. Bạn vẫn có thể ghi nhận mở nắp nhưng sẽ không
                có open-vial expiration. Hãy cấu hình trong master data sản phẩm.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="rounded-md bg-muted/30 p-3 text-sm space-y-1">
            <div>
              <strong>Volume hiện tại:</strong> {currentRemaining}
            </div>
            {productStability && (
              <div>
                <strong>Open-vial stability:</strong> {productStability} ngày
              </div>
            )}
            {lot.open_vial_count > 0 && (
              <div>
                <strong>Số lần đã mở:</strong> {lot.open_vial_count}
              </div>
            )}
            <div>
              <strong>Trạng thái:</strong>{" "}
              <Badge>{LOT_STATUS_LABELS[lot.status as keyof typeof LOT_STATUS_LABELS]}</Badge>
            </div>
          </div>

          <div>
            <Label htmlFor="opened-at">Ngày mở</Label>
            <Input
              id="opened-at"
              type="date"
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
              className="mt-1"
            />
            {expDate && (
              <p className="text-xs text-muted-foreground mt-1">
                → Open-vial HSD: <strong>{new Date(expDate).toLocaleDateString("vi-VN")}</strong>
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="qty-taken">Lượng lấy ra</Label>
            <Input
              id="qty-taken"
              type="number"
              min={0}
              max={currentRemaining}
              step="0.01"
              value={quantityTaken}
              onChange={(e) => setQuantityTaken(Number(e.target.value))}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              → Còn lại: <strong>{newRemaining}</strong>
              {newRemaining === 0 && (
                <span className="text-amber-600 ml-1">(Lô sẽ chuyển sang DEPLETED)</span>
              )}
            </p>
          </div>

          <div>
            <Label htmlFor="ov-notes">Ghi chú (tùy chọn)</Label>
            <Textarea
              id="ov-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={quantityTaken <= 0 || newRemaining < 0 || recordOpenVial.isPending}
          >
            {recordOpenVial.isPending ? "Đang lưu..." : "Lưu & in nhãn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
