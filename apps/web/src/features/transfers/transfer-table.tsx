"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useStockTransfers,
  useShipTransfer,
  useCancelTransfer,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_COLORS,
  type StockTransfer,
  type StockTransferStatus,
} from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Truck, X, ChevronLeft, ChevronRight } from "lucide-react";

export function TransferTable({ onNew, initialData }: { onNew: () => void; initialData?: { items: StockTransfer[]; total: number; page: number; pageSize: number; hasMore: boolean } }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StockTransferStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = {
    page, pageSize: 20,
    search: search || undefined,
    status: (status || undefined) as StockTransferStatus | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const query = useStockTransfers(params); const data = initialData ? { items: initialData.items, total: initialData.total, page: initialData.page, pageSize: initialData.pageSize, hasMore: initialData.hasMore } : query.data; const isLoading = initialData ? false : query.isLoading;
  const ship = useShipTransfer();
  const cancel = useCancelTransfer();

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
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as StockTransferStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            {(Object.keys(TRANSFER_STATUS_LABELS) as StockTransferStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{TRANSFER_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" /> Tạo phiếu chuyển</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Số phiếu</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Từ → Đến</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Dòng</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
            ) : !data?.items.length ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Chưa có phiếu chuyển kho</td></tr>
            ) : data.items.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">
                  <Link href={`/transfers/${t.id}`} className="hover:underline">{t.transferNumber}</Link>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">{new Date(t.transferDate).toLocaleDateString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2 text-xs">
                  <div className="font-medium">{t.fromWarehouseCode ?? "—"}</div>
                  <div className="text-muted-foreground">→ {t.toWarehouseCode ?? "—"}</div>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums">{t.lineCount}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${TRANSFER_STATUS_COLORS[t.status as StockTransferStatus] ?? "bg-gray-100"}`}>
                    {TRANSFER_STATUS_LABELS[t.status as StockTransferStatus] ?? t.status}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {t.status === "DRAFT" && (
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm(`Ship phiếu ${t.transferNumber}?`)) ship.mutate(t.id);
                      }} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Ship phiếu">
                        <Truck className="h-4 w-4 text-amber-600" />
                      </Button>
                    )}
                    {(t.status === "DRAFT" || t.status === "IN_TRANSIT") && (
                      <Button size="icon" variant="ghost" onClick={() => {
                        const reason = prompt("Lý do hủy:");
                        if (reason) cancel.mutate({ id: t.id, reason });
                      }} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Hủy phiếu">
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>Trang {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} — Tổng {data.total}</div>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
