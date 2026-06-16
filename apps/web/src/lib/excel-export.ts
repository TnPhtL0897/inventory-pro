// =============================================================================
// Excel Export utility
// Dùng xlsx library để export data ra file .xlsx
// =============================================================================

import * as XLSX from "xlsx";

export interface ExcelColumn<T> {
  header: string;
  key: keyof T | ((row: T) => unknown);
  format?: (value: unknown) => string | number;
  width?: number;
}

export interface ExportOptions {
  filename: string;
  sheetName?: string;
  dateFormat?: string;
}

/**
 * Export array of objects to Excel file (.xlsx) và trigger download.
 */
export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  columns: ExcelColumn<T>[],
  options: ExportOptions
): void {
  // 1. Tạo header row
  const headers = columns.map((c) => c.header);

  // 2. Tạo data rows
  const data = rows.map((row) =>
    columns.map((col) => {
      const rawValue =
        typeof col.key === "function"
          ? col.key(row)
          : (row[col.key as keyof T] as unknown);
      return col.format ? col.format(rawValue) : rawValue;
    })
  );

  // 3. Combine
  const aoa: unknown[][] = [headers, ...data];

  // 4. Tạo worksheet
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 5. Set column widths
  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 20 }));

  // 6. Tạo workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName ?? "Sheet1");

  // 7. Generate file + trigger download
  const filename = options.filename.endsWith(".xlsx")
    ? options.filename
    : `${options.filename}.xlsx`;

  XLSX.writeFile(wb, filename);
}

/**
 * Export audit log entries to Excel
 */
export function exportAuditLogToExcel(entries: unknown[], filename = "audit-log"): void {
  const columns: ExcelColumn<any>[] = [
    { header: "ID", key: "id", width: 40 },
    {
      header: "Thời gian",
      key: "createdAt",
      width: 20,
      format: (v) => (v ? new Date(String(v)).toLocaleString("vi-VN") : ""),
    },
    { header: "Bảng", key: "tableName", width: 25 },
    { header: "Thao tác", key: "operation", width: 12 },
    { header: "Record ID", key: "recordId", width: 40 },
    { header: "User", key: "changedByEmail", width: 30 },
    { header: "Role", key: "changedByRole", width: 20 },
    {
      header: "Old data (JSON)",
      key: "oldData",
      width: 60,
      format: (v) => (v ? JSON.stringify(v) : ""),
    },
    {
      header: "New data (JSON)",
      key: "newData",
      width: 60,
      format: (v) => (v ? JSON.stringify(v) : ""),
    },
    {
      header: "Trường thay đổi",
      key: "changedFields",
      width: 30,
      format: (v) => (Array.isArray(v) ? v.join(", ") : ""),
    },
  ];

  exportToExcel(entries as any[], columns, {
    filename: `${filename}-${new Date().toISOString().split("T")[0]}.xlsx`,
    sheetName: "Audit Log",
  });
}
