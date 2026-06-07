"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, TrendingUp, Calendar, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { ForecastPreviewDialog } from "@/features/replenishment/forecast-preview-dialog";
import { formatVND, type ReplenishmentRun } from "@/features/replenishment/api";

interface Props {
  initialData?: { items: ReplenishmentRun[]; total: number };
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Hoàn thành",
  FAILED: "Lỗi",
};
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

const TYPE_LABELS: Record<string, string> = {
  MANUAL: "Thủ công",
  SCHEDULED: "Tự động",
};
const TYPE_COLORS: Record<string, string> = {
  MANUAL: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-purple-100 text-purple-800",
};

export function ReplenishmentListClient({ initialData }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [openDialog, setOpenDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const items = (initialData?.items ?? []).filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (typeFilter && r.runType !== typeFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      String(r.fiscalYear).includes(s) ||
      String(r.fiscalMonth).includes(s) ||
      (r.errorMessage ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo năm, tháng, lỗi..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter || "ALL"} onValueChange={(v) => setTypeFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Loại" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setOpenDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo dự trù tháng mới
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Chưa có lần chạy dự trù nào.</p>
          <p className="text-xs mt-2">Bấm "Tạo dự trù tháng mới" để chạy lần đầu tiên.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Tháng</th>
                <th className="hidden sm:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày chạy</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Loại</th>
                <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Kho</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Sản phẩm</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Tổng giá trị</th>
                <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">PR tạo</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-2 sm:px-3 py-2 font-medium whitespace-nowrap">
                    <Calendar className="inline h-3 w-3 mr-1" />
                    {String(r.fiscalMonth).padStart(2, "0")}/{r.fiscalYear}
                  </td>
                  <td className="hidden sm:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {r.asOfDate}
                  </td>
                  <td className="px-2 sm:px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${TYPE_COLORS[r.runType] ?? "bg-gray-100"}`}>
                      {TYPE_LABELS[r.runType] ?? r.runType}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums">
                    {r.warehouseCount}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums">{r.productCount}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {formatVND(r.totalEstimatedValue)}
                  </td>
                  <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums">
                    {r.createdPurchaseRequestIds.length}
                  </td>
                  <td className="px-2 sm:px-3 py-2">
                    {r.status === "COMPLETED" ? (
                      <Badge className={STATUS_COLORS.COMPLETED} variant="secondary">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {STATUS_LABELS.COMPLETED}
                      </Badge>
                    ) : (
                      <Badge className={STATUS_COLORS.FAILED} variant="secondary" title={r.errorMessage ?? ""}>
                        <XCircle className="h-3 w-3 mr-1" />
                        {STATUS_LABELS.FAILED}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ForecastPreviewDialog
        key={refreshKey}
        open={openDialog}
        onOpenChange={setOpenDialog}
        onSuccess={() => {
          // Reload page để fetch data mới
          if (typeof window !== "undefined") window.location.reload();
        }}
      />
    </div>
  );
}
