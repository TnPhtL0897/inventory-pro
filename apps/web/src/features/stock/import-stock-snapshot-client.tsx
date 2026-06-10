"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  parseExcelFile,
  applyFieldMapping,
  coerceRowValues,
  extractSkuFromName,
  mapUnitCode,
  STOCK_FIELD_MAP,
  type ParseResult,
  type ParsedSheet,
} from "@/lib/excel-parser";
import { callFunction, listTable } from "@/lib/data-access";

type Step = "idle" | "parsing" | "preview" | "importing" | "done";

interface SnapshotRow {
  productName: string;
  sku: string | null;
  unitCode: string;
  batchNo: string | null;
  quantity: number;
  unitCost: number;
  supplierName: string | null;
}

interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; sheet: string; sku: string; message: string }>;
  insertedMovements: string[];
  warehouseId?: string;
  locationId?: string;
  branchId?: string;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
  branchId: string;
  branchName?: string;
  status: string;
}

export function ImportStockSnapshotClient() {
  const [step, setStep] = useState<Step>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [activeSheet, setActiveSheet] = useState<ParsedSheet | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [reportDate, setReportDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);
  const [finalResult, setFinalResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load warehouses
  const { data: warehousesData, isLoading: loadingWarehouses } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () =>
      listTable<Warehouse>("warehouses", {
        pageSize: 200,
        orderBy: "name",
        filters: { status: "ACTIVE" },
      }),
  });
  const warehouses = useMemo(
    () => warehousesData?.items ?? [],
    [warehousesData],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setParsed(null);
    setActiveSheet(null);
    setDryRunResult(null);
    setFinalResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Filter out header/category rows from a sheet:
  // - Empty rows
  // - Rows where first cell looks like a category header (e.g. "Hóa chất", "Vật tư") — no STT
  // - Rows where STT is not a number
  const filterValidRows = useCallback((sheet: ParsedSheet): ParsedSheet => {
    const validRows = sheet.rows.filter((row) => {
      // Find STT column (case-insensitive)
      const sttKey = Object.keys(row).find(
        (k) => k.toLowerCase().trim() === "stt" || k.toLowerCase().trim() === "số tt",
      );
      const sttVal = sttKey ? row[sttKey] : null;
      // STT must be a number
      if (sttVal === null || sttVal === undefined || sttVal === "") return false;
      const num = Number(sttVal);
      if (!isFinite(num) || num <= 0) return false;
      return true;
    });
    return { ...sheet, rows: validRows };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setStep("parsing");
      setFinalResult(null);
      setDryRunResult(null);
      try {
        const result = await parseExcelFile(file);
        if (result.first.rows.length === 0) {
          toast.error("File rỗng hoặc không có dữ liệu");
          setStep("idle");
          return;
        }
        // Filter valid rows for all sheets
        const filtered: ParseResult = {
          sheets: result.sheets.map((s) => filterValidRows(s)),
          first: filterValidRows(result.first),
        };
        const totalValidRows = filtered.sheets.reduce(
          (acc, s) => acc + s.rows.length,
          0,
        );
        if (totalValidRows === 0) {
          toast.error("File không có dòng dữ liệu hợp lệ (cần cột STT là số)");
          setStep("idle");
          return;
        }
        setParsed(filtered);
        setActiveSheet(filtered.first);
        setStep("preview");
        toast.success(
          `Đã đọc ${totalValidRows} dòng từ ${filtered.sheets.length} sheet`,
        );
      } catch (e) {
        console.error(e);
        toast.error("Lỗi đọc file", { description: (e as Error).message });
        setStep("idle");
      }
    },
    [filterValidRows],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // Apply mapping + extract SKU + map unit
  const mappedRows = useMemo<SnapshotRow[]>(() => {
    if (!activeSheet) return [];
    const mapped = applyFieldMapping(activeSheet.rows, {}, STOCK_FIELD_MAP);
    return mapped
      .map(coerceRowValues)
      .map((r): SnapshotRow | null => {
        const productName = String(r.productName ?? "").trim();
        if (!productName) return null;
        const sku =
          (r.sku && String(r.sku).trim()) ||
          extractSkuFromName(productName) ||
          null;
        const unitCode =
          r.unitCode && String(r.unitCode).trim()
            ? mapUnitCode(String(r.unitCode))
            : "UNIT";
        const batchNo =
          r.batchNo && String(r.batchNo).trim() ? String(r.batchNo).trim() : null;
        const quantity = Number(r.quantity) || 0;
        const unitCost = Number(r.unitCost) || 0;
        const supplierName =
          r.supplierName && String(r.supplierName).trim()
            ? String(r.supplierName).trim()
            : null;
        return { productName, sku, unitCode, batchNo, quantity, unitCost, supplierName };
      })
      .filter((r): r is SnapshotRow => r !== null);
  }, [activeSheet]);

  // Aggregate all sheets for the actual call
  const allSheetsForUpload = useMemo(() => {
    if (!parsed) return [];
    return parsed.sheets
      .filter((s) => s.rows.length > 0)
      .map((sheet) => {
        const mapped = applyFieldMapping(sheet.rows, {}, STOCK_FIELD_MAP);
        const rows = mapped
          .map(coerceRowValues)
          .map((r) => {
            const productName = String(r.productName ?? "").trim();
            if (!productName) return null;
            return {
              productName,
              sku:
                (r.sku && String(r.sku).trim()) ||
                extractSkuFromName(productName) ||
                null,
              unitCode:
                r.unitCode && String(r.unitCode).trim()
                  ? mapUnitCode(String(r.unitCode))
                  : "UNIT",
              batchNo:
                r.batchNo && String(r.batchNo).trim()
                  ? String(r.batchNo).trim()
                  : null,
              quantity: Number(r.quantity) || 0,
              unitCost: Number(r.unitCost) || 0,
              supplierName:
                r.supplierName && String(r.supplierName).trim()
                  ? String(r.supplierName).trim()
                  : null,
            };
          })
          .filter((r) => r !== null);
        return { sheetName: sheet.sheetName, rows };
      })
      .filter((s) => s.rows.length > 0);
  }, [parsed]);

  const totalRowsToImport = allSheetsForUpload.reduce(
    (acc, s) => acc + s.rows.length,
    0,
  );

  const canSubmit = warehouseId && reportDate && totalRowsToImport > 0;

  const runImport = useCallback(
    async (dryRun: boolean) => {
      if (!canSubmit) return;
      setIsImporting(true);
      try {
        const res = await callFunction<ImportResult>("import-stock-snapshot", {
          warehouseId,
          reportDate,
          dryRun,
          sheets: allSheetsForUpload,
        });
        if (dryRun) {
          setDryRunResult(res);
          if (res.failed === 0) {
            toast.success(`Dry-run OK: ${res.total} dòng sẽ được insert`);
          } else {
            toast.warning(`Dry-run: ${res.failed} dòng lỗi (xem bên dưới)`);
          }
        } else {
          setFinalResult(res);
          setDryRunResult(null);
          setStep("done");
          if (res.inserted > 0) {
            toast.success(`Import thành công ${res.inserted} movements`, {
              description:
                res.failed > 0 ? `Có ${res.failed} dòng lỗi` : undefined,
            });
          } else {
            toast.error(`Import thất bại`, {
              description: `${res.failed} dòng lỗi`,
            });
          }
        }
      } catch (e) {
        console.error(e);
        toast.error(dryRun ? "Lỗi dry-run" : "Lỗi import", {
          description: (e as Error).message,
        });
      } finally {
        setIsImporting(false);
      }
    },
    [canSubmit, warehouseId, reportDate, allSheetsForUpload],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Import báo cáo tồn kho (Bootstrap)
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Upload file Excel{" "}
          <code className="text-xs">BaoCaoTonKho_*.xlsx</code> để seed tồn kho
          ban đầu cho 1 warehouse. Hệ thống tự nhận diện: SKU (regex
          <code className="text-xs"> Mã: VTYT.*</code>), đơn vị (Cái/Gram/Lọ/...),
          số lô, đơn giá.
        </p>
      </div>

      {/* Step 1: Upload */}
      {step === "idle" && (
        <Card>
          <CardContent className="pt-6">
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors border-muted-foreground/30 hover:border-primary"
            >
              <p className="text-lg font-medium">Kéo thả file Excel vào đây</p>
              <p className="text-sm text-muted-foreground mt-2">
                hoặc click để chọn file (.xlsx, .xls, .csv)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={onFileInput}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              ⚠️ <strong>Yêu cầu:</strong> Tất cả SKU trong file phải tồn tại
              trong hệ thống (import products trước). Idempotency tự động — có
              thể upload lại cùng file mà không lo duplicate.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview + Form */}
      {step === "preview" && parsed && activeSheet && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>1. Chọn warehouse + ngày báo cáo</CardTitle>
              <CardDescription>
                Bắt buộc chọn trước khi import. Movements sẽ được ghi với
                idempotency_key dựa trên (sku + batch + ngày + warehouse).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Warehouse *</label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-input px-2 text-sm bg-background"
                    disabled={loadingWarehouses}
                  >
                    <option value="">
                      {loadingWarehouses ? "Đang tải..." : "-- Chọn warehouse --"}
                    </option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Ngày báo cáo *</label>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-input px-2 text-sm bg-background"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>2. Preview dữ liệu</CardTitle>
                  <CardDescription>
                    Sheet: <strong>{activeSheet.sheetName}</strong> ·{" "}
                    {activeSheet.rows.length} dòng hợp lệ
                    {parsed.sheets.length > 1 &&
                      ` (${parsed.sheets.length} sheets, tổng ${totalRowsToImport} dòng)`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {parsed.sheets.length > 1 && (
                    <select
                      value={activeSheet.sheetName}
                      onChange={(e) => {
                        const next = parsed.sheets.find(
                          (s) => s.sheetName === e.target.value,
                        );
                        if (next) setActiveSheet(next);
                      }}
                      className="h-9 rounded-md border border-input px-2 text-sm"
                    >
                      {parsed.sheets.map((s) => (
                        <option key={s.sheetName} value={s.sheetName}>
                          {s.sheetName} ({s.rows.length})
                        </option>
                      ))}
                    </select>
                  )}
                  <Button variant="outline" onClick={reset}>
                    Đổi file
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">SKU</th>
                      <th className="p-2 text-left">Tên SP</th>
                      <th className="p-2 text-left">ĐVT</th>
                      <th className="p-2 text-left">Số lô</th>
                      <th className="p-2 text-right">SL tồn</th>
                      <th className="p-2 text-right">Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td
                          className={`p-2 font-mono ${!r.sku ? "text-red-600" : ""}`}
                        >
                          {r.sku ?? "⚠ N/A"}
                        </td>
                        <td className="p-2 max-w-xs truncate">
                          {r.productName}
                        </td>
                        <td className="p-2">{r.unitCode}</td>
                        <td className="p-2">{r.batchNo ?? "—"}</td>
                        <td className="p-2 text-right">
                          {r.quantity.toLocaleString("vi-VN")}
                        </td>
                        <td className="p-2 text-right">
                          {r.unitCost.toLocaleString("vi-VN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedRows.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Hiển thị 20/{mappedRows.length} dòng đầu sheet này.
                </p>
              )}
              {mappedRows.some((r) => !r.sku) && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠ Có {mappedRows.filter((r) => !r.sku).length} dòng không
                  trích xuất được SKU (thiếu pattern "Mã: VTYT.*"). Sẽ bị bỏ
                  qua khi import.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Dry-run result */}
          {dryRunResult && (
            <Card
              className={
                dryRunResult.failed > 0
                  ? "border-amber-500"
                  : "border-green-500"
              }
            >
              <CardHeader>
                <CardTitle>
                  {dryRunResult.failed === 0
                    ? "✓ Dry-run: Tất cả OK"
                    : `⚠ Dry-run: ${dryRunResult.failed} lỗi`}
                </CardTitle>
                <CardDescription>
                  {dryRunResult.total} dòng · {dryRunResult.failed} lỗi
                  validation
                </CardDescription>
              </CardHeader>
              {dryRunResult.failed > 0 && (
                <CardContent>
                  <div className="max-h-60 overflow-y-auto text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted">
                          <th className="p-1 text-left">Sheet</th>
                          <th className="p-1 text-left">Dòng</th>
                          <th className="p-1 text-left">SKU</th>
                          <th className="p-1 text-left">Lỗi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dryRunResult.errors.slice(0, 50).map((e, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-1">{e.sheet}</td>
                            <td className="p-1">{e.row}</td>
                            <td className="p-1 font-mono">{e.sku}</td>
                            <td className="p-1 text-red-600">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dryRunResult.errors.length > 50 && (
                      <p className="text-muted-foreground mt-2">
                        +{dryRunResult.errors.length - 50} lỗi khác...
                      </p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => runImport(true)}
              disabled={isImporting || !canSubmit}
            >
              Dry-run (validate)
            </Button>
            <Button
              onClick={() => runImport(false)}
              disabled={isImporting || !canSubmit}
            >
              {isImporting
                ? "Đang import..."
                : `Import ${totalRowsToImport} dòng`}
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Done */}
      {step === "done" && finalResult && (
        <Card
          className={
            finalResult.inserted > 0 ? "border-green-500" : "border-red-500"
          }
        >
          <CardHeader>
            <CardTitle>
              {finalResult.inserted > 0
                ? `✓ Đã import ${finalResult.inserted} stock movements`
                : "✗ Import thất bại"}
            </CardTitle>
            <CardDescription>
              Tổng: {finalResult.total} · Thành công: {finalResult.inserted} ·
              Lỗi: {finalResult.failed}
            </CardDescription>
          </CardHeader>
          {finalResult.failed > 0 && (
            <CardContent>
              <p className="text-sm font-medium mb-2">Chi tiết lỗi:</p>
              <div className="max-h-60 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-1 text-left">Sheet</th>
                      <th className="p-1 text-left">Dòng</th>
                      <th className="p-1 text-left">SKU</th>
                      <th className="p-1 text-left">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalResult.errors.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-1">{e.sheet}</td>
                        <td className="p-1">{e.row}</td>
                        <td className="p-1 font-mono">{e.sku}</td>
                        <td className="p-1 text-red-600">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
          <CardContent>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Import file khác
              </Button>
              <Button variant="outline" onClick={() => window.location.href = "/inventory/stock"}>
                Xem tồn kho
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
