"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Play, FileDown, History } from "lucide-react";
import { useWarehouses, type Warehouse } from "@/features/warehouses/api";
import { listTable, sb } from "@/lib/data-access";

// =============================================================================
// Dự trù năm (Yearly Forecast) - Client UI
// =============================================================================
// Workflow:
// 1. Chọn năm cần dự trù + multi-select kho → click "Chạy dự trù"
// 2. Edge function `compute-yearly-forecast` tính toán + insert runs + lines
// 3. Hiển thị bảng kết quả (mặc định sắp xếp theo total_estimated_value DESC)
// 4. Nút "Export Excel" tải CSV (Excel mở được) cho phòng kế hoạch
// 5. Lịch sử runs bên dưới
// =============================================================================

interface YearlyForecastLine {
 id: string;
 runId: string;
 productId: string;
 productSku: string;
 productName: string;
 unitCode: string | null;
 consumption12m: number;
 consumption12mAvg: number;
 consumption3mMax: number;
 forecastBase: number;
 forecastYearQty: number;
 currentStock: number;
 suggestedBuyQty: number;
 unitPrice: number;
 totalEstimatedValue: number;
 lineStatus: string;
}

interface YearlyForecastRun {
 id: string;
 fiscalYear: number;
 runDate: string;
 status: string;
 totalProducts: number;
 totalLines: number;
 totalEstimatedValue: number;
 notes: string | null;
 createdAt: string;
}

interface ComputeResponse {
 runId: string;
 fiscalYear: number;
 runDate: string;
 totalProducts: number;
 totalLines: number;
 totalEstimatedValue: number;
}

function formatVND(n: number): string {
 return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function formatQty(n: number): string {
 return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
}

export function YearlyForecastClient() {
 const qc = useQueryClient();
 const currentYear = new Date().getFullYear();
 const [fiscalYear, setFiscalYear] = useState<number>(currentYear + 1);
 const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
 const [activeRunId, setActiveRunId] = useState<string | null>(null);
 const [search, setSearch] = useState("");

 // 1. Load ACTIVE warehouses
 const { data: whData, isLoading: whLoading } = useWarehouses({ pageSize: 100, status: "ACTIVE" });
 const warehouses: Warehouse[] = whData?.items ?? [];

 // 2. Load all runs (history)
 const { data: runs, isLoading: runsLoading } = useQuery({
 queryKey: ["yearly-forecast-runs"],
 queryFn: () =>
 listTable<YearlyForecastRun>("yearly_forecast_runs", {
 pageSize: 20,
 orderBy: "created_at",
 orderDesc: true,
 }),
 });

 // 3. Load lines for active run
 const { data: lines, isLoading: linesLoading } = useQuery({
 queryKey: ["yearly-forecast-lines", activeRunId],
 queryFn: async () => {
 if (!activeRunId) return [];
 const { data, error } = await sb()
 .from("yearly_forecast_lines")
 .select(
 `id, run_id, product_id, consumption_12m, consumption_12m_avg, consumption_3m_max,
 forecast_base, forecast_year_qty, current_stock, suggested_buy_qty,
 unit_price, total_estimated_value, line_status, unit_id,
 products:product_id (sku, name, unit_code)`,
 )
 .eq("run_id", activeRunId)
 .order("total_estimated_value", { ascending: false });
 if (error) throw error;
 return (data ?? []).map((row: any) => ({
 id: row.id,
 runId: row.run_id,
 productId: row.product_id,
 productSku: row.products?.sku ?? "",
 productName: row.products?.name ?? "",
 unitCode: row.products?.unit_code ?? null,
 consumption12m: row.consumption_12m,
 consumption12mAvg: row.consumption_12m_avg,
 consumption3mMax: row.consumption_3m_max,
 forecastBase: row.forecast_base,
 forecastYearQty: row.forecast_year_qty,
 currentStock: row.current_stock,
 suggestedBuyQty: row.suggested_buy_qty,
 unitPrice: row.unit_price,
 totalEstimatedValue: row.total_estimated_value,
 lineStatus: row.line_status,
 })) as YearlyForecastLine[];
 },
 enabled: !!activeRunId,
 });

 // 4. Compute mutation
 const compute = useMutation({
 mutationFn: async () => {
 if (selectedWarehouses.length === 0) {
 throw new Error("Vui lòng chọn ít nhất 1 kho");
 }
 const { data, error } = await sb().functions.invoke<ComputeResponse>(
 "compute-yearly-forecast",
 { body: { fiscalYear, warehouseIds: selectedWarehouses } },
 );
 if (error) throw error;
 if ((data as any)?.error) throw new Error((data as any).error.message);
 return data as ComputeResponse;
 },
 onSuccess: (res) => {
 toast.success(
 `Đã chạy dự trù năm ${fiscalYear}: ${res.totalLines} sản phẩm cần mua, tổng ${formatVND(res.totalEstimatedValue)}`,
 );
 setActiveRunId(res.runId);
 qc.invalidateQueries({ queryKey: ["yearly-forecast-runs"] });
 qc.invalidateQueries({ queryKey: ["yearly-forecast-lines", res.runId] });
 },
 onError: (e: Error) =>
 toast.error("Lỗi chạy dự trù", { description: e.message }),
 });

 // 5. Filtered lines (search)
 const filteredLines = useMemo(() => {
 if (!lines) return [];
 const q = search.trim().toLowerCase();
 if (!q) return lines;
 return lines.filter(
 (l) =>
 l.productSku.toLowerCase().includes(q) ||
 l.productName.toLowerCase().includes(q),
 );
 }, [lines, search]);

 // 6. Export CSV
 function handleExportCsv() {
 if (!lines || lines.length === 0) {
 toast.error("Chưa có dữ liệu để xuất");
 return;
 }
 const headers = [
 "SKU",
 "Tên sản phẩm",
 "ĐVT",
 "TB 12 tháng",
 "Max 3 tháng",
 "Dự kiến cả năm",
 "Tồn hiện tại",
 "SL đề xuất mua",
 "Đơn giá",
 "Thành tiền",
 ];
 const rows = lines.map((l) => [
 l.productSku,
 l.productName,
 l.unitCode ?? "",
 formatQty(l.consumption12mAvg),
 formatQty(l.consumption3mMax),
 formatQty(l.forecastYearQty),
 formatQty(l.currentStock),
 formatQty(l.suggestedBuyQty),
 formatVND(l.unitPrice),
 formatVND(l.totalEstimatedValue),
 ]);
 // BOM cho Excel nhận UTF-8
 const csv = "﻿" + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `du-tru-nam-${fiscalYear}-${new Date().toISOString().slice(0, 10)}.csv`;
 a.click();
 URL.revokeObjectURL(url);
 toast.success("Đã tải file CSV");
 }

 function toggleWarehouse(id: string) {
 setSelectedWarehouses((prev) =>
 prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
 );
 }

 return (
 <div className="space-y-4 sm:space-y-6">
 {/* Header */}
 <div>
 <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dự trù năm</h1>
 <p className="text-sm sm:text-base text-muted-foreground">
 Lập kế hoạch mua sắm cho năm {fiscalYear} dựa trên lịch sử tiêu thụ (công thức: MAX(TB 12 tháng, Max 3 tháng) × 12).
 </p>
 </div>

 {/* Form chạy dự trù */}
 <Card>
 <CardHeader>
 <CardTitle>1. Chạy dự trù</CardTitle>
 <CardDescription>
 Chọn năm và các kho cần tính. Kết quả dùng để xuất Excel gửi phòng kế hoạch.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <Label htmlFor="fiscalYear">Năm cần dự trù</Label>
 <Input
 id="fiscalYear"
 type="number"
 min={2000}
 max={2100}
 value={fiscalYear}
 onChange={(e) => setFiscalYear(Number(e.target.value))}
 className="mt-1"
 />
 </div>
 <div>
 <Label className="block mb-1">Kho tính ({selectedWarehouses.length} đã chọn)</Label>
 {whLoading ? (
 <div className="text-sm text-muted-foreground">Đang tải...</div>
 ) : warehouses.length === 0 ? (
 <div className="text-sm text-muted-foreground">Chưa có kho ACTIVE nào</div>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 border rounded-md max-h-48 overflow-y-auto">
 {warehouses.map((w) => (
 <label key={w.id} className="flex items-center gap-3 text-sm cursor-pointer py-1.5">
 <input
 type="checkbox"
 checked={selectedWarehouses.includes(w.id)}
 onChange={() => toggleWarehouse(w.id)}
 className="h-4 w-4 rounded shrink-0"
 />
 <span className="min-w-0">{w.code} — {w.name}</span>
 </label>
 ))}
 </div>
 )}
 </div>
 </div>
 <Button
 onClick={() => compute.mutate()}
 disabled={compute.isPending || selectedWarehouses.length === 0}
 className="w-full sm:w-auto"
 >
 {compute.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
 Chạy dự trù
 </Button>
 </CardContent>
 </Card>

 {/* Bảng kết quả */}
 {activeRunId && (
 <Card>
 <CardHeader className="space-y-3">
 <div>
 <CardTitle>2. Kết quả dự trù (Run #{activeRunId.slice(0, 8)})</CardTitle>
 <CardDescription>
 {lines?.length ?? 0} sản phẩm ACTIVE
 </CardDescription>
 </div>
 <div className="flex flex-col sm:flex-row gap-2">
 <Input
 placeholder="Tìm SKU / tên..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="w-full sm:w-48"
 />
 <Button variant="outline" onClick={handleExportCsv} disabled={!lines || lines.length === 0} className="shrink-0">
 <FileDown className="mr-2 h-4 w-4" />
 Export Excel (CSV)
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {linesLoading ? (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" /> Đang tải kết quả...
 </div>
 ) : filteredLines.length === 0 ? (
 <div className="text-sm text-muted-foreground">Không có dữ liệu (hoặc chưa có lịch sử xuất kho trong 12 tháng qua).</div>
 ) : (
 <div className="border rounded-md overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>SKU</TableHead>
 <TableHead>Tên sản phẩm</TableHead>
 <TableHead className="hidden md:table-cell">ĐVT</TableHead>
 <TableHead className="hidden lg:table-cell text-right">TB 12 tháng</TableHead>
 <TableHead className="hidden lg:table-cell text-right">Max 3 tháng</TableHead>
 <TableHead className="text-right">Dự kiến năm</TableHead>
 <TableHead className="text-right">Tồn kho</TableHead>
 <TableHead className="text-right">Đề xuất mua</TableHead>
 <TableHead className="text-right">Thành tiền</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredLines.map((l) => (
 <TableRow key={l.id}>
 <TableCell className="font-mono text-xs whitespace-nowrap">{l.productSku}</TableCell>
 <TableCell className="max-w-[180px] md:max-w-[200px] truncate" title={l.productName}>{l.productName}</TableCell>
 <TableCell className="hidden md:table-cell text-xs">{l.unitCode ?? "—"}</TableCell>
 <TableCell className="hidden lg:table-cell text-right tabular-nums">{formatQty(l.consumption12mAvg)}</TableCell>
 <TableCell className="hidden lg:table-cell text-right tabular-nums">{formatQty(l.consumption3mMax)}</TableCell>
 <TableCell className="text-right tabular-nums">{formatQty(l.forecastYearQty)}</TableCell>
 <TableCell className="text-right tabular-nums">{formatQty(l.currentStock)}</TableCell>
 <TableCell className="text-right tabular-nums font-semibold">{formatQty(l.suggestedBuyQty)}</TableCell>
 <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatVND(l.totalEstimatedValue)}</TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>
 )}

 {/* Lịch sử runs */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <History className="h-4 w-4" />
 Lịch sử chạy
 </CardTitle>
 </CardHeader>
 <CardContent>
 {runsLoading ? (
 <div className="text-sm text-muted-foreground">Đang tải...</div>
 ) : !runs || runs?.items.length === 0 ? (
 <div className="text-sm text-muted-foreground">Chưa có lần chạy nào.</div>
 ) : (
 <div className="border rounded-md overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Run #</TableHead>
 <TableHead className="hidden sm:table-cell">Năm</TableHead>
 <TableHead className="hidden md:table-cell">Ngày chạy</TableHead>
 <TableHead className="text-right">SP xét</TableHead>
 <TableHead className="hidden sm:table-cell text-right">Có output</TableHead>
 <TableHead className="text-right">Tổng tiền dự kiến</TableHead>
 <TableHead className="hidden md:table-cell">Trạng thái</TableHead>
 <TableHead></TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {runs?.items.map((r) => (
 <TableRow key={r.id} className={activeRunId === r.id ? "bg-muted/50" : ""}>
 <TableCell className="font-mono text-xs whitespace-nowrap">{r.id.slice(0, 8)}</TableCell>
 <TableCell className="hidden sm:table-cell">{r.fiscalYear}</TableCell>
 <TableCell className="hidden md:table-cell whitespace-nowrap">{r.runDate}</TableCell>
 <TableCell className="text-right tabular-nums">{r.totalProducts}</TableCell>
 <TableCell className="hidden sm:table-cell text-right tabular-nums">{r.totalLines}</TableCell>
 <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatVND(r.totalEstimatedValue)}</TableCell>
 <TableCell className="hidden md:table-cell">
 <Badge variant={r.status === "COMPLETED" ? "default" : "secondary"}>{r.status}</Badge>
 </TableCell>
 <TableCell>
 <Button size="icon" variant="ghost" onClick={() => setActiveRunId(r.id)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Xem">
 Xem
 </Button>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
}
