"use client";

import Link from "next/link";
import { useState } from "react";
import { usePurchaseOrders, useDeletePo, PO_STATUS_LABELS, PO_STATUS_COLORS, type PoStatus, type PurchaseOrder } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Trash2, Edit, ChevronLeft, ChevronRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function PoTable({ onEdit, onNew }: { onEdit: (po: PurchaseOrder) => void; onNew: () => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PoStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deletingTarget, setDeletingTarget] = useState<PurchaseOrder | null>(null);

  const params = {
    page,
    pageSize: 20,
    search: search || undefined,
    status: (status || undefined) as PoStatus | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const { data, isLoading } = usePurchaseOrders(params);
  const del = useDeletePo();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo số PO, ghi chú..."
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[150px]" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[150px]" />
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as PoStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            {(Object.keys(PO_STATUS_LABELS) as PoStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{PO_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" /> Tạo PO</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Số PO</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">NCC</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Tổng</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
            ) : !data?.items.length ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Chưa có PO nào</td></tr>
            ) : data.items.map((po) => (
              <tr key={po.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">
                  <Link href={`/purchase-orders/${po.id}`} className="hover:underline">{po.poNumber}</Link>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">{new Date(po.orderDate).toLocaleDateString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2">{po.partyName ?? po.partyCode ?? "—"}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">{po.total.toLocaleString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${PO_STATUS_COLORS[po.status]}`}>
                    {PO_STATUS_LABELS[po.status]}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => onEdit(po)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Sửa"><Edit className="h-4 w-4" /></Button>
                    {po.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingTarget(po)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
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

      <ConfirmDialog
        open={!!deletingTarget}
        onOpenChange={(o) => !o && setDeletingTarget(null)}
        title={`Xóa PO ${deletingTarget?.poNumber}?`}
        description="Đơn đặt hàng nháp sẽ bị xóa. Chỉ có thể xóa PO ở trạng thái DRAFT."
        variant="destructive"
        confirmLabel="Xóa PO"
        onConfirm={async () => {
          if (deletingTarget) await del.mutateAsync(deletingTarget.id);
          setDeletingTarget(null);
        }}
        isLoading={del.isPending}
      />
    </div>
  );
}
