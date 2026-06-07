// SSR-friendly table
import Link from "next/link";
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_COLORS, type StockTransfer, type StockTransferStatus } from "./api";

export function TransfersTableSSR({ data }: { data: { items: StockTransfer[]; total: number } }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 sm:px-3 py-2 text-left font-medium">Số phiếu</th>
            <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày</th>
            <th className="px-2 sm:px-3 py-2 text-left font-medium">Từ → Đến</th>
            <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Dòng</th>
            <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Chưa có phiếu chuyển kho</td></tr>
          )}
          {data.items.map((t) => (
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
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-sm text-muted-foreground border-t">Tổng: {data.total} phiếu</div>
    </div>
  );
}
