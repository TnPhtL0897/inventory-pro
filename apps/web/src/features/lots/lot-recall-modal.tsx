"use client";

import { useState } from "react";
import { useCreateRecall } from "./api";
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
import { AlertOctagon } from "lucide-react";
import {
  RECALL_SEVERITY_LABELS,
  RECALL_SEVERITY_COLORS,
  type RecallSeverity,
} from "@inventorypro/shared-types";

const SEVERITIES: RecallSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function LotRecallModal({
  open,
  onOpenChange,
  prefilledLotNumbers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledLotNumbers?: string[];
}) {
  const createRecall = useCreateRecall();

  const [recallNumber, setRecallNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [severity, setSeverity] = useState<RecallSeverity>("MEDIUM");
  const [recallDate, setRecallDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [affectedLotNumbersText, setAffectedLotNumbersText] = useState(
    (prefilledLotNumbers ?? []).join("\n")
  );
  const [actionTaken, setActionTaken] = useState("");

  const handleSubmit = async () => {
    const lots = affectedLotNumbersText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!recallNumber || !supplierName || !reason || lots.length === 0) {
      return;
    }

    await createRecall.mutateAsync({
      recallNumber,
      supplierName,
      reason,
      severity,
      recallDate,
      affectedLotNumbers: lots,
      actionTakenBySupplier: actionTaken || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertOctagon className="h-5 w-5" />
            Tạo thông báo Recall
          </DialogTitle>
          <DialogDescription>
            Hệ thống sẽ tự động <strong>BLOCK</strong> tất cả lots có số lô khớp và tạo cảnh báo
            cho thủ kho. Hành động này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="recall-number">Số recall *</Label>
              <Input
                id="recall-number"
                value={recallNumber}
                onChange={(e) => setRecallNumber(e.target.value)}
                placeholder="REC-2026-001"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="recall-date">Ngày recall *</Label>
              <Input
                id="recall-date"
                type="date"
                value={recallDate}
                onChange={(e) => setRecallDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="supplier">Nhà cung cấp *</Label>
            <Input
              id="supplier"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Roche, BioMérieux, ..."
              className="mt-1"
            />
          </div>

          <div>
            <Label>Mức độ nghiêm trọng</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {SEVERITIES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={severity === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSeverity(s)}
                >
                  {RECALL_SEVERITY_LABELS[s]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Hiện tại:{" "}
              <Badge className={RECALL_SEVERITY_COLORS[severity]}>
                {RECALL_SEVERITY_LABELS[severity]}
              </Badge>
            </p>
          </div>

          <div>
            <Label htmlFor="reason">Lý do recall *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Nhiễm chéo, sai nhãn, vấn đề chất lượng, ..."
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="affected-lots">Số lô bị ảnh hưởng *</Label>
            <Textarea
              id="affected-lots"
              value={affectedLotNumbersText}
              onChange={(e) => setAffectedLotNumbersText(e.target.value)}
              rows={4}
              placeholder="Mỗi số lô 1 dòng, hoặc phân cách bằng dấu phẩy"
              className="mt-1 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Số lô sẽ match:{" "}
              <strong>
                {affectedLotNumbersText.split(/[\n,]/).filter((s) => s.trim()).length}
              </strong>{" "}
              lô
            </p>
          </div>

          <div>
            <Label htmlFor="action-supplier">Hành động từ NCC (tùy chọn)</Label>
            <Input
              id="action-supplier"
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="Ngừng sản xuất, thu hồi sản phẩm, ..."
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={createRecall.isPending}
          >
            {createRecall.isPending ? "Đang tạo..." : "Tạo recall & BLOCK lô"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
