"use client";

import { useState } from "react";
import { useStockMovements, MOVEMENT_LABELS, MOVEMENT_COLORS, type StockMovementType, type StockMovement } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MovementsTable({ initialData }: { initialData?: { items: StockMovement[]; total: number; page: number; pageSize: number; hasMore: boolean } } = {}) {
  const [page, setPage] = useState(1);
  const [movementType, setMovementType] = useState<StockMovementType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = {
    page,
    pageSize: 30,
    movementType: (movementType || undefined) as StockMovementType | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const query = useStockMovements(params); const data = initialData ? { items: initialData.items, total: initialData.total, page: initialData.page, pageSize: initialData.pageSize, hasMore: initialData.hasMore } : query.data; const isLoading = initialData ? false : query.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={movementType || "ALL"} onValueChange={(v) => { setMovementType((v === "ALL" ? "" : v) as StockMovementType | ""); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Loại movement" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {(Object.keys(MOVEMENT_LABELS) as StockMovementType[]).map((t) => (
              <SelectItem key={t} value={t}>{MOVEMENT_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[160px]" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[160px]" />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Thời gian</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Loại</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Vật tư</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Số lượng</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Đơn giá</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ref</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>}
            {!isLoading && data?.items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Chưa có movement</td></tr>}
            {data?.items.map((m) => (
              <tr key={m.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 text-xs whitespace-nowrap">{new Date(m.postedAt).toLocaleString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${MOVEMENT_COLORS[m.movementType as StockMovementType] ?? "bg-gray-100"}`}>
                    {MOVEMENT_LABELS[m.movementType as StockMovementType] ?? m.movementType}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-xs">
                  <div className="font-mono">{m.productSku}</div>
                  <div className="text-muted-foreground">{m.productName}</div>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                  {m.movementType === "OUT" || m.movementType === "TRANSFER_OUT" || m.movementType === "ADJUST_OUT" || m.movementType === "RETURN_OUT" ? "-" : "+"}
                  {m.quantity.toLocaleString("vi-VN")}
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.unitCost ? m.unitCost.toLocaleString("vi-VN") : "—"}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-xs font-mono">{m.refType}{m.refId ? ` #${m.refId.slice(0, 6)}` : ""}</td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={m.notes ?? ""}>{m.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>Trang {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} — Tổng {data.total}</div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
