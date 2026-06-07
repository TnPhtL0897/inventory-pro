"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, Save, TrendingUp, TrendingDown, Info } from "lucide-react";
import { useReplenishmentPreview, useRunReplenishment, formatVND, type ForecastPreview, type ForecastLine } from "./api";

interface ForecastPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const MONTH_LABELS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function getDefaultAsOfDate(month: number, year: number): string {
  // Cuối tháng trước (YYYY-MM-DD)
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-${lastDay}`;
}

export function ForecastPreviewDialog({ open, onOpenChange, onSuccess }: ForecastPreviewDialogProps) {
  const now = new Date();
  const [fiscalYear, setFiscalYear] = useState<number>(now.getFullYear());
  const [fiscalMonth, setFiscalMonth] = useState<number>(now.getMonth() + 1);
  const [asOfDate, setAsOfDate] = useState<string>(getDefaultAsOfDate(now.getMonth() + 1, now.getFullYear()));
  const [saveAsPR, setSaveAsPR] = useState<boolean>(true);
  const [preview, setPreview] = useState<ForecastPreview | null>(null);

  const previewMutation = useReplenishmentPreview();
  const runMutation = useRunReplenishment();

  const handlePreview = async () => {
    try {
      const result = await previewMutation.mutateAsync({
        fiscalYear,
        fiscalMonth,
        asOfDate: asOfDate || null,
        saveAsPurchaseRequest: false,
      });
      setPreview(result);
    } catch {
      // toast đã được hook xử lý
    }
  };

  const handleRun = async () => {
    if (!preview) return;
    try {
      await runMutation.mutateAsync({
        fiscalYear,
        fiscalMonth,
        asOfDate: asOfDate || null,
        saveAsPurchaseRequest: saveAsPR,
        notes: `Dự trù cuối tháng ${fiscalMonth}/${fiscalYear} - ${preview.productCount} sản phẩm`,
      });
      onSuccess?.();
      onOpenChange(false);
      setPreview(null);
    } catch {
      // toast đã được hook xử lý
    }
  };

  const isLoading = previewMutation.isPending || runMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Dự trù cuối tháng - Kho chẵn (RECEIVING)
          </DialogTitle>
          <DialogDescription>
            Tính forecast dựa trên xuất hàng 3 tháng gần nhất + tồn kho hiện tại.
            Gợi ý HĐ thầu ACTIVE khớp sản phẩm.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 py-4 border-y">
          <div>
            <Label className="text-xs">Năm</Label>
            <Input
              type="number"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              min={2000}
              max={2100}
            />
          </div>
          <div>
            <Label className="text-xs">Tháng</Label>
            <Select value={String(fiscalMonth)} onValueChange={(v) => {
              const m = Number(v);
              setFiscalMonth(m);
              setAsOfDate(getDefaultAsOfDate(m, fiscalYear));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_LABELS.map((label, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Ngày chạy (As of date)</Label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-2 py-2">
          <Button onClick={handlePreview} disabled={isLoading} variant="default">
            {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Xem trước
          </Button>
          {preview && preview.lines.length > 0 && (
            <label className="flex items-center gap-2 text-sm ml-4 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsPR}
                onChange={(e) => setSaveAsPR(e.target.checked)}
                className="rounded"
              />
              Lưu thành PurchaseRequest (DRAFT)
            </label>
          )}
        </div>

        {preview && (
          <div className="space-y-3">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <SummaryCard label="Kho chẵn" value={preview.warehouseCount} />
              <SummaryCard label="Sản phẩm đề xuất" value={preview.productCount} />
              <SummaryCard label="Tổng giá trị ước tính" value={formatVND(preview.totalEstimatedValue)} />
              <SummaryCard label="As of date" value={preview.asOfDate} />
            </div>

            {preview.lines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Không có sản phẩm nào cần bổ sung.</p>
                <p className="text-xs mt-1">Tồn kho hiện tại đủ đáp ứng nhu cầu.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">SKU</th>
                      <th className="px-2 py-2 text-left font-medium">Tên</th>
                      <th className="px-2 py-2 text-right font-medium">Tồn</th>
                      <th className="px-2 py-2 text-right font-medium">Min/Max</th>
                      <th className="px-2 py-2 text-right font-medium">TB xuất/ngày</th>
                      <th className="px-2 py-2 text-right font-medium">Forecast T+1</th>
                      <th className="px-2 py-2 text-right font-medium">Đề xuất</th>
                      <th className="px-2 py-2 text-right font-medium">Giá trị</th>
                      <th className="px-2 py-2 text-left font-medium">HĐ thầu gợi ý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line, idx) => (
                      <ForecastLineRow key={`${line.productId}-${idx}`} line={line} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.lines.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-md p-3 text-xs flex gap-2">
                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Cách tính:</p>
                  <p className="text-blue-800 dark:text-blue-200">
                    Forecast = (Tổng xuất 90 ngày ÷ 90) × 30. Đề xuất = max(0, forecast + min_stock - tồn).
                    Nếu {`<`} 3 lần xuất trong 90 ngày, fallback về (max_stock - tồn).
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Đóng
          </Button>
          {preview && preview.lines.length > 0 && (
            <Button onClick={handleRun} disabled={isLoading} variant="default">
              {runMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Lưu thành PurchaseRequest
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-md p-2 bg-muted/30">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ForecastLineRow({ line }: { line: ForecastLine }) {
  const isTrend = line.reason.includes("Trend");
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-2 py-2 font-mono text-xs">{line.productSku}</td>
      <td className="px-2 py-2 max-w-[200px] truncate" title={line.productName}>
        {line.productName}
        <div className="text-[10px] text-muted-foreground truncate" title={line.reason}>
          {isTrend ? <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="inline h-2.5 w-2.5 mr-0.5" />}
          {line.reason}
        </div>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{line.currentStock.toLocaleString("vi-VN")}</td>
      <td className="px-2 py-2 text-right tabular-nums text-xs">
        {line.minStock.toLocaleString("vi-VN")} / {line.maxStock?.toLocaleString("vi-VN") ?? "—"}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{line.avgDailyOut.toFixed(2)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{line.forecastNextMonth.toLocaleString("vi-VN")}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold text-blue-600">
        {line.suggestedReplenishQty.toLocaleString("vi-VN")}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{formatVND(line.estimatedTotal)}</td>
      <td className="px-2 py-2">
        {line.bidContractNo ? (
          <Badge variant="secondary" className="text-[10px]">
            {line.bidContractNo}
            {line.bidLotName && <span className="ml-1 opacity-70">· {line.bidLotName}</span>}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-[10px]">—</span>
        )}
      </td>
    </tr>
  );
}
