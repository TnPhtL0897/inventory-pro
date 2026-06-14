"use client";

import { useState, useEffect } from "react";
import { useLot, useCompleteQC } from "./api";
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
import { FlaskConical, CheckCircle, XCircle } from "lucide-react";
import { LOT_STATUS_LABELS } from "@inventorypro/shared-types";

export function LotQCModal({
  lotId,
  open,
  onOpenChange,
}: {
  lotId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: lot, isLoading } = useLot(lotId);
  const completeQC = useCompleteQC();

  const [qcMethod, setQcMethod] = useState("Visual + pH check");
  const [qcResult, setQcResult] = useState<"PASS" | "FAIL">("PASS");
  const [qcNotes, setQcNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  useEffect(() => {
    if (open) {
      setQcMethod("Visual + pH check");
      setQcResult("PASS");
      setQcNotes("");
      setValidUntil("");
    }
  }, [open]);

  const isRetest = lot?.status === "IN_USE" || !!lot?.open_vial_opened_at;

  const handleSubmit = async () => {
    await completeQC.mutateAsync({
      lotId,
      qcType: isRetest ? "OPEN_VIAL_RETEST" : "INITIAL",
      qcMethod,
      qcResult,
      qcNotes: qcNotes || undefined,
      validUntil: isRetest && qcResult === "PASS" ? validUntil : undefined,
    });
    onOpenChange(false);
  };

  if (isLoading || !lot) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center text-muted-foreground">Đang tải...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            {isRetest ? "QC lại open-vial" : "QC ban đầu"}
          </DialogTitle>
          <DialogDescription>
            Lô: <strong className="font-mono">{lot.lot_number}</strong> — {lot.product?.name}
            <br />
            Trạng thái hiện tại:{" "}
            <Badge>{LOT_STATUS_LABELS[lot.status as keyof typeof LOT_STATUS_LABELS]}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="qc-method">Phương pháp QC</Label>
            <Input
              id="qc-method"
              value={qcMethod}
              onChange={(e) => setQcMethod(e.target.value)}
              placeholder="Visual + pH, 2-level control, ..."
              className="mt-1"
            />
          </div>

          <div>
            <Label>Kết quả QC</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant={qcResult === "PASS" ? "default" : "outline"}
                onClick={() => setQcResult("PASS")}
                className="flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                PASS
              </Button>
              <Button
                type="button"
                variant={qcResult === "FAIL" ? "destructive" : "outline"}
                onClick={() => setQcResult("FAIL")}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-1" />
                FAIL
              </Button>
            </div>
          </div>

          {isRetest && qcResult === "PASS" && (
            <div>
              <Label htmlFor="valid-until">QC có hiệu lực đến (open-vial retest)</Label>
              <Input
                id="valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sau ngày này, lô sẽ yêu cầu QC lại lần nữa. Mặc định 7 ngày.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="qc-notes">Ghi chú</Label>
            <Textarea
              id="qc-notes"
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              rows={3}
              placeholder="Kết quả trong tầm kiểm soát..."
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={completeQC.isPending}>
            {completeQC.isPending ? "Đang lưu..." : "Hoàn tất QC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
