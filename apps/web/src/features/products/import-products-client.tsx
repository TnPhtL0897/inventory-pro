"use client";

import { useState, useRef, useCallback } from "react";

type Step = "idle" | "parsing" | "preview" | "importing" | "done";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  parseExcelFile,
  applyFieldMapping,
  coerceRowValues,
  normalizeHeader,
  type ParseResult,
  type ParsedSheet,
} from "@/lib/excel-parser";
import { callFunction, sb } from "@/lib/data-access";

interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; sku: string; message: string }>;
  insertedSkus: string[];
}

export function ImportProductsClient() {
  const [step, setStep] = useState<Step>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [activeSheet, setActiveSheet] = useState<ParsedSheet | null>(null);
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);
  const [finalResult, setFinalResult] = useState<ImportResult | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setParsed(null);
    setActiveSheet(null);
    setDryRunResult(null);
    setFinalResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFile = useCallback(async (file: File) => {
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
      setParsed(result);
      setActiveSheet(result.first);
      setStep("preview");
      toast.success(`Đã đọc ${result.first.rows.length} dòng từ sheet "${result.first.sheetName}"`);
    } catch (e) {
      console.error(e);
      toast.error("Lỗi đọc file", { description: (e as Error).message });
      setStep("idle");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
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

  // Apply mapping + coercion to active sheet
  const mappedRows = activeSheet
    ? applyFieldMapping(activeSheet.rows, {}).map(coerceRowValues)
    : [];

  const previewRows = mappedRows.slice(0, 10);

  const handleDryRun = useCallback(async () => {
    if (mappedRows.length === 0) return;
    setIsImporting(true);
    try {
      const res = await callFunction<ImportResult>("import-products", {
        rows: mappedRows,
        dryRun: true,
        updateExisting,
      });
      setDryRunResult(res);
      if (res.failed === 0) {
        toast.success(`Dry-run OK: ${res.total} dòng sẽ được insert/update`);
      } else {
        toast.warning(`Dry-run: ${res.failed} dòng lỗi (xem bên dưới)`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Lỗi dry-run", { description: (e as Error).message });
    } finally {
      setIsImporting(false);
    }
  }, [mappedRows, updateExisting]);

  const handleCommit = useCallback(async () => {
    if (mappedRows.length === 0) return;
    setIsImporting(true);
    try {
      const res = await callFunction<ImportResult>("import-products", {
        rows: mappedRows,
        dryRun: false,
        updateExisting,
      });
      setFinalResult(res);
      setDryRunResult(null);
      setStep("done");
      if (res.inserted > 0) {
        toast.success(`Import thành công ${res.inserted} sản phẩm`, {
          description: res.failed > 0 ? `Có ${res.failed} dòng lỗi` : undefined,
        });
      } else {
        toast.error(`Import thất bại`, { description: `${res.failed} dòng lỗi` });
      }
    } catch (e) {
      console.error(e);
      toast.error("Lỗi import", { description: (e as Error).message });
      setStep("preview");
    } finally {
      setIsImporting(false);
    }
  }, [mappedRows, updateExisting]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Import sản phẩm từ Excel</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Tải lên file .xlsx/.xls/.csv với các cột: <code>sku</code>, <code>name</code>,{" "}
          <code>baseUnitCode</code>, <code>categoryCode</code> (tùy chọn), <code>costPrice</code>,{" "}
          <code>sellPrice</code>, <code>minStock</code>, <code>maxStock</code>, <code>status</code>.{" "}
          Hệ thống tự nhận diện header tiếng Việt không dấu (vd: &quot;ma&quot;, &quot;ten&quot;, &quot;donvitinh&quot;).
        </p>
      </div>

      {/* Step 1: Upload */}
      {step === "idle" && (
        <Card>
          <CardContent className="pt-6">
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                transition-colors
                ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary"}
              `}
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
              💡 Tip: SKU phải UNIQUE trong file. Mã đơn vị tính và mã nhóm phải tồn tại trong hệ thống.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && parsed && activeSheet && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Preview dữ liệu</CardTitle>
                  <CardDescription>
                    Sheet: <strong>{activeSheet.sheetName}</strong> · {activeSheet.rows.length} dòng · {activeSheet.headers.length} cột
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {parsed.sheets.length > 1 && (
                    <select
                      value={activeSheet.sheetName}
                      onChange={(e) => {
                        const next = parsed.sheets.find((s) => s.sheetName === e.target.value);
                        if (next) { setActiveSheet(next); setDryRunResult(null); }
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
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                    />
                    Ghi đè SKU đã tồn tại
                  </label>
                  <Button variant="outline" onClick={reset}>Đổi file</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-2 text-left">#</th>
                      {Object.keys(previewRows[0] || {}).map((k) => (
                        <th key={k} className="p-2 text-left whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k} className="p-2 whitespace-nowrap max-w-xs truncate">
                            {String(v ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Hiển thị 10/{activeSheet.rows.length} dòng đầu. Click "Dry-run" để validate trước, sau đó "Import".
              </p>
            </CardContent>
          </Card>

          {/* Dry-run result */}
          {dryRunResult && (
            <Card className={dryRunResult.failed > 0 ? "border-amber-500" : "border-green-500"}>
              <CardHeader>
                <CardTitle>
                  {dryRunResult.failed === 0 ? "✓ Dry-run: Tất cả OK" : `⚠ Dry-run: ${dryRunResult.failed} lỗi`}
                </CardTitle>
                <CardDescription>
                  {dryRunResult.total} dòng · {dryRunResult.failed} lỗi validation
                </CardDescription>
              </CardHeader>
              {dryRunResult.failed > 0 && (
                <CardContent>
                  <div className="max-h-60 overflow-y-auto text-xs">
                    <table className="w-full">
                      <thead><tr className="bg-muted"><th className="p-1 text-left">Dòng</th><th className="p-1 text-left">SKU</th><th className="p-1 text-left">Lỗi</th></tr></thead>
                      <tbody>
                        {dryRunResult.errors.slice(0, 50).map((e, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-1">{e.row}</td>
                            <td className="p-1 font-mono">{e.sku}</td>
                            <td className="p-1 text-red-600">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dryRunResult.errors.length > 50 && (
                      <p className="text-muted-foreground mt-2">+{dryRunResult.errors.length - 50} lỗi khác...</p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDryRun}
              disabled={isImporting}
            >
              Dry-run (validate)
            </Button>
            <Button
              onClick={handleCommit}
              disabled={isImporting || mappedRows.length === 0}
            >
              {isImporting ? "Đang import..." : `Import ${mappedRows.length} dòng`}
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Done */}
      {step === "done" && finalResult && (
        <Card className={finalResult.inserted > 0 ? "border-green-500" : "border-red-500"}>
          <CardHeader>
            <CardTitle>
              {finalResult.inserted > 0
                ? `✓ Đã import ${finalResult.inserted} sản phẩm`
                : "✗ Import thất bại"}
            </CardTitle>
            <CardDescription>
              Tổng: {finalResult.total} · Thành công: {finalResult.inserted} · Lỗi: {finalResult.failed}
            </CardDescription>
          </CardHeader>
          {finalResult.failed > 0 && (
            <CardContent>
              <p className="text-sm font-medium mb-2">Chi tiết lỗi:</p>
              <div className="max-h-60 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead><tr className="bg-muted"><th className="p-1 text-left">Dòng</th><th className="p-1 text-left">SKU</th><th className="p-1 text-left">Lỗi</th></tr></thead>
                  <tbody>
                    {finalResult.errors.map((e, i) => (
                      <tr key={i} className="border-t">
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
            <Button variant="outline" onClick={reset}>Import file khác</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
