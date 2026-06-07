"use client";

import Link from "next/link";
import { useState } from "react";
import { useGoodsReceipts, useCancelGrn, GRN_STATUS_LABELS, GRN_STATUS_COLORS, type GrnStatus, type GoodsReceipt } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronLeft, ChevronRight, Send } from "lucide-react";

export function GrnTable({ onNew, onPost }: { onNew: () => void; onPost: (g: GoodsReceipt) => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<GrnStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = {
    page, pageSize: 20,
    search: search || undefined,
    status: (status || undefined) as GrnStatus | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const { data, isLoading } = useGoodsReceipts(params);
  const cancel = useCancelGrn();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Input placeholder="Tìm theo số GRN, HĐ NCC, ghi chú..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[150px]" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[150px]" />
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as GrnStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {(Object.keys(GRN_STATUS_LABELS) as GrnStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{GRN_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" /> Tạo GRN</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Số GRN</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày nhận</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">NCC / Kho</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">PO</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
            ) : !data?.items.length ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Chưa có GRN</td></tr>
            ) : data.items.map((g) => (
              <tr key={g.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">
                  <Link href={`/goods-receipts/${g.id}`} className="hover:underline">{g.grnNumber}</Link>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">{new Date(g.receiptDate).toLocaleDateString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2 text-xs">
                  <div className="font-medium">{g.partyName ?? g.partyCode ?? "—"}</div>
                  <div className="text-muted-foreground">Kho: {g.warehouseCode ?? "—"}</div>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 font-mono text-xs">{g.poNumber ?? "—"}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${GRN_STATUS_COLORS[g.status]}`}>
                    {GRN_STATUS_LABELS[g.status]}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  {g.status === "DRAFT" && (
                    <Button size="sm" variant="ghost" onClick={() => onPost(g)} title="Post để ghi stock_movements">
                      <Send className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
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
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
