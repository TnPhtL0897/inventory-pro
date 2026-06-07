"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useStockTakes,
  STOCKTAKE_STATUS_LABELS,
  STOCKTAKE_STATUS_COLORS,
  type StockTake,
  type StockTakeStatus,
} from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";

export function StockTakeTable({ onNew, initialData }: { onNew: () => void; initialData?: { items: StockTake[]; total: number; page: number; pageSize: number; hasMore: boolean } }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StockTakeStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = {
    page, pageSize: 20,
    search: search || undefined,
    status: (status || undefined) as StockTakeStatus | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const query = useStockTakes(params); const data = initialData ? { items: initialData.items, total: initialData.total, page: initialData.page, pageSize: initialData.pageSize, hasMore: initialData.hasMore } : query.data; const isLoading = initialData ? false : query.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo số phiếu, ghi chú..."
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[150px]" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[150px]" />
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as StockTakeStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {(Object.keys(STOCKTAKE_STATUS_LABELS) as StockTakeStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STOCKTAKE_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" /> Tạo phiếu kiểm kê</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Số phiếu</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày KK</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Kho</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Dòng</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Đếm lúc</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Chốt lúc</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>}
            {!isLoading && data?.items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Chưa có phiếu kiểm kê</td></tr>}
            {data?.items.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">
                  <Link href={`/stock-takes/${t.id}`} className="hover:underline">{t.stockTakeNumber}</Link>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">{new Date(t.stockTakeDate).toLocaleDateString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2 text-xs">{t.warehouseCode ?? "—"}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums">{t.lineCount}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${STOCKTAKE_STATUS_COLORS[t.status as StockTakeStatus] ?? "bg-gray-100"}`}>
                    {STOCKTAKE_STATUS_LABELS[t.status as StockTakeStatus] ?? t.status}
                  </span>
                </td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{t.countedAt ? new Date(t.countedAt).toLocaleString("vi-VN") : "—"}</td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{t.postedAt ? new Date(t.postedAt).toLocaleString("vi-VN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>Trang {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} — Tổng {data.total}</div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
