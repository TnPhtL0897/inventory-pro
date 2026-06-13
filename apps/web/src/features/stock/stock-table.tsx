"use client";

import { useState } from "react";
import { useStockLevels, type StockLevel } from "./api";
import { useWarehouses } from "@/features/warehouses/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

export function StockTable({
  initialData,
}: {
  initialData?: { items: StockLevel[]; total: number; page: number; pageSize: number; hasMore: boolean };
} = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const { data: warehouses } = useWarehouses({ pageSize: 200 });
  const params = {
    page,
    pageSize: 30,
    warehouseId: warehouseId || undefined,
  };
  const query = useStockLevels(params);
  const data = initialData ? { items: initialData.items, total: initialData.total, page: initialData.page, pageSize: initialData.pageSize, hasMore: initialData.hasMore } : query.data;
  const isLoading = initialData ? false : query.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo SKU/tên..."
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={warehouseId || "ALL"} onValueChange={(v) => { setWarehouseId(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Tất cả kho" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả kho</SelectItem>
            {(warehouses?.items ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Sản phẩm</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Kho / Vị trí</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Lô / Serial</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Tồn</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Đặt trước</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Khả dụng</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-right font-medium">Giá vốn TB</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
            ) : !data?.items.length ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Chưa có tồn kho</td></tr>
            ) : data.items.map((s, i) => {
              const isLow = s.quantity < 0;
              return (
                <tr key={`${s.productId}-${s.locationId}-${s.batchNo ?? ""}-${s.serialNo ?? ""}-${i}`} className="border-t hover:bg-muted/30">
                  <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{s.productSku}</td>
                  <td className="px-2 sm:px-3 py-2 font-medium">
                    <div className="flex flex-col">
                      <span>{s.productName}</span>
                      <span className="md:hidden text-xs text-muted-foreground">{s.warehouseCode} · {s.locationCode}</span>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-xs">
                    <div>{s.warehouseCode}</div>
                    <div className="text-muted-foreground">{s.locationCode}</div>
                  </td>
                  <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground">
                    {s.batchNo && <div>Batch: {s.batchNo}</div>}
                    {s.serialNo && <div>SN: {s.serialNo}</div>}
                    {!s.batchNo && !s.serialNo && "—"}
                  </td>
                  <td className={`px-2 sm:px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap ${isLow ? "text-red-600" : ""}`}>
                    {isLow && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                    {s.quantity.toLocaleString("vi-VN")} {s.baseUnitCode ?? ""}
                  </td>
                  <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{s.reservedQty.toLocaleString("vi-VN")}</td>
                  <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">{s.availableQty.toLocaleString("vi-VN")}</td>
                  <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{s.avgCost.toLocaleString("vi-VN")}</td>
                  <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground">
                    {s.lastMovementAt ? new Date(s.lastMovementAt).toLocaleString("vi-VN") : "—"}
                  </td>
                </tr>
              );
            })}
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
