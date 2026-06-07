"use client";

import { useState } from "react";
import {
  useWarehouses,
  useDeleteWarehouse,
  WAREHOUSE_STATUS_LABELS,
  WAREHOUSE_STATUS_COLORS,
  WAREHOUSE_TYPE_LABELS,
  WAREHOUSE_TYPE_COLORS,
  type Warehouse,
  type WarehouseStatus,
  type WarehouseType,
} from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Trash2, Edit, ChevronLeft, ChevronRight } from "lucide-react";
import { WarehouseForm } from "./warehouse-form";

export function WarehouseTable({ initialData }: { initialData?: { items: Warehouse[]; total: number; page: number; pageSize: number; hasMore: boolean } }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WarehouseStatus | "">("");
  const [type, setType] = useState<WarehouseType | "">("");
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = {
    page,
    pageSize: 20,
    status: (status || undefined) as WarehouseStatus | undefined,
    type: (type || undefined) as WarehouseType | undefined,
  };
  const query = useWarehouses(params);
  const data = initialData
    ? { items: initialData.items, total: initialData.total, page: initialData.page, pageSize: initialData.pageSize, hasMore: initialData.hasMore }
    : query.data;
  const isLoading = initialData ? false : query.isLoading;
  const del = useDeleteWarehouse();

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (w: Warehouse) => { setEditing(w); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, mã kho..."
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as WarehouseStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            {(Object.keys(WAREHOUSE_STATUS_LABELS) as WarehouseStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{WAREHOUSE_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type || "ALL"} onValueChange={(v) => { setType((v === "ALL" ? "" : v) as WarehouseType | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Loại kho" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả loại</SelectItem>
            {(Object.keys(WAREHOUSE_TYPE_LABELS) as WarehouseType[]).map((t) => (
              <SelectItem key={t} value={t}>{WAREHOUSE_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Thêm kho
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Sửa kho: ${editing.name}` : "Thêm kho mới"}</DialogTitle>
          </DialogHeader>
          {dialogOpen && (
            <WarehouseForm
              initial={editing ?? undefined}
              onSuccess={() => { closeDialog(); window.location.reload(); }}
              onCancel={closeDialog}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Mã kho</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Tên kho</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Loại</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Địa chỉ</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">SĐT</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Vị trí</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>}
            {!isLoading && data?.items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Chưa có kho nào</td></tr>}
            {data?.items.map((w) => (
              <tr key={w.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{w.code}</td>
                <td className="px-2 sm:px-3 py-2 font-medium">
                  {w.name}
                  {w.isDefault && <span className="ml-2 text-xs text-blue-600">(mặc định)</span>}
                </td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${WAREHOUSE_TYPE_COLORS[w.type as WarehouseType] ?? "bg-gray-100 text-gray-800"}`}>
                    {WAREHOUSE_TYPE_LABELS[w.type as WarehouseType] ?? w.type}
                  </span>
                </td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-muted-foreground text-xs">{w.address ?? "—"}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-xs">{w.phone ?? "—"}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums">{w.locationCount}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${WAREHOUSE_STATUS_COLORS[w.status as WarehouseStatus] ?? "bg-gray-100"}`}>
                    {WAREHOUSE_STATUS_LABELS[w.status as WarehouseStatus] ?? w.status}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(w)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    {w.status !== "CLOSED" && (
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => {
                          if (confirm(`Đóng kho "${w.name}"?`)) del.mutate(w.id);
                        }}
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
