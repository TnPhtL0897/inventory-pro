"use client";

import { useState, useEffect } from "react";
import { useAdjustReplenishmentLine } from "./api";
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
import { Edit, AlertTriangle } from "lucide-react";

export function AdjustQtyModal({
  lineId,
  currentQty,
  productName,
  maxStock,
  currentDailyQty,
  open,
  onOpenChange,
  onAdjusted,
}: {
  lineId: string;
  currentQty: number;
  productName: string;
  maxStock: number;
  currentDailyQty: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted?: () => void;
}) {
  const adjust = useAdjustReplenishmentLine();

  const [adjustedQty, setAdjustedQty] = useState<number>(currentQty);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setAdjustedQty(currentQty);
      setReason("");
    }
  }, [open, currentQty]);

  const maxAllowed = Math.max(0, maxStock - currentDailyQty);
  const exceedsMax = adjustedQty > maxAllowed;
  const isDecrease = adjustedQty < currentQty;
  const isIncrease = adjustedQty > currentQty;

  const handleSubmit = async () => {
    if (adjustedQty < 0) return;
    if (adjustedQty === currentQty) {
      toast.info("Số lượng không thay đổi");
      return;
    }
    await adjust.mutateAsync({ lineId, adjustedQty, reason: reason || "(không có lý do)" });
    onAdjusted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Điều chỉnh số lượng
          </DialogTitle>
          <DialogDescription>
            <strong>{productName}</strong>
            <br />
            Số lượng đề xuất: <strong>{currentQty}</strong> • Tồn kho lẻ hiện tại: {currentDailyQty}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="adjusted-qty">Số lượng mới</Label>
            <Input
              id="adjusted-qty"
              type="number"
              min={0}
              step="0.01"
              value={adjustedQty}
              onChange={(e) => setAdjustedQty(Number(e.target.value))}
              className="mt-1"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                Tối đa cho phép: <strong>{maxAllowed}</strong> (max_stock - tồn hiện tại)
              </span>
              {isIncrease && (
                <Badge className="bg-blue-100 text-blue-800">Tăng</Badge>
              )}
              {isDecrease && (
                <Badge className="bg-amber-100 text-amber-800">Giảm</Badge>
              )}
            </div>
            {exceedsMax && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5" />
                <span className="text-amber-700">
                  Số lượng vượt max_stock. Lý do bắt buộc và sẽ được Trưởng khoa review.
                </span>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="reason">Lý do điều chỉnh (bắt buộc)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                isDecrease
                  ? "Vd: Lô FEFO không đủ, lấy lô tiếp theo..."
                  : "Vd: Tuần này có 2 ca XN cấp cứu, cần thêm..."
              }
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lý do sẽ được ghi vào audit log theo TT54
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={adjust.isPending || adjustedQty === currentQty}
          >
            {adjust.isPending ? "Đang lưu..." : "Lưu điều chỉnh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-import for toast
import { toast } from "sonner";
