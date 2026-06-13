"use client";

import { useState } from "react";
import {
  useProducts,
  useDeleteProduct,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_COLORS,
  PRODUCT_TYPE_LABELS,
  type Product,
  type ProductStatus,
  type ProductType,
} from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Trash2, Edit, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductForm } from "./product-form";

export function ProductTable({
  initialData,
}: {
  initialData?: { items: Product[]; total: number; page: number; pageSize: number; hasMore: boolean };
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [type, setType] = useState<ProductType | "">("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = {
    page,
    pageSize: 20,
    search: search || undefined,
    status: (status || undefined) as ProductStatus | undefined,
  };
  const query = useProducts(params);
  const data = initialData && page === 1 && !search && !status
    ? { items: initialData.items, total: initialData.total, page: initialData.page, pageSize: initialData.pageSize, hasMore: initialData.hasMore }
    : query.data;
  const isLoading = initialData && page === 1 && !search && !status ? false : query.isLoading;
  const del = useDeleteProduct();

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo SKU, tên, barcode..."
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={type || "ALL"} onValueChange={(v) => { setType((v === "ALL" ? "" : v) as ProductType | ""); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tất cả loại" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả loại</SelectItem>
            {Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as ProductStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tất cả trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{PRODUCT_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Thêm vật tư
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Sửa vật tư: ${editing.name}` : "Thêm vật tư mới"}</DialogTitle>
          </DialogHeader>
          {dialogOpen && (
            <ProductForm
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
              <th className="px-2 sm:px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Tên</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Loại</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Đơn vị</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Giá vốn</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Giá bán</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
            ) : !data?.items.length ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Chưa có vật tư nào</td></tr>
            ) : data.items.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{p.sku}</td>
                <td className="px-2 sm:px-3 py-2 font-medium">
                  <div className="flex flex-col">
                    <span>{p.name}</span>
                    <span className="md:hidden text-xs text-muted-foreground">
                      {PRODUCT_TYPE_LABELS[p.productType as ProductType] ?? p.productType}
                    </span>
                  </div>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-muted-foreground text-xs">
                  {PRODUCT_TYPE_LABELS[p.productType as ProductType] ?? p.productType}
                </td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs">{p.baseUnitCode ?? "—"}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">{p.costPrice.toLocaleString("vi-VN")}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">{p.sellPrice.toLocaleString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${PRODUCT_STATUS_COLORS[p.status as ProductStatus] ?? "bg-gray-100"}`}>
                    {PRODUCT_STATUS_LABELS[p.status as ProductStatus] ?? p.status}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Sửa">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Xóa/ngưng "${p.name}"?`)) del.mutate(p.id);
                      }}
                    className="h-10 w-10 sm:h-8 sm:w-10"
                    aria-label="Xóa"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
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
            <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Trang trước">
 <ChevronLeft className="h-4 w-4" />
 </Button>
            <Button size="icon" variant="outline" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Trang sau">
 <ChevronRight className="h-4 w-4" />
 </Button>
          </div>
        </div>
      )}
    </div>
  );
}
