// SSR-friendly table - không dùng hook, nhận data trực tiếp
import Link from "next/link";
import { STOCKTAKE_STATUS_LABELS, STOCKTAKE_STATUS_COLORS, type StockTake, type StockTakeStatus } from "./api";

export function StockTakesTableSSR({ data }: { data: { items: StockTake[]; total: number } }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 sm:px-3 py-2 text-left font-medium">Số phiếu</th>
            <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày KK</th>
            <th className="px-2 sm:px-3 py-2 text-left font-medium">Kho</th>
            <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Dòng</th>
            <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
            <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Đếm lúc</th>
            <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Chốt lúc</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Chưa có phiếu kiểm kê</td></tr>
          )}
          {data.items.map((t) => (
            <tr key={t.id} className="border-t hover:bg-muted/30">
              <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">
                <Link href={`/stock-takes/${t.id}`} className="hover:underline">{t.stockTakeNumber}</Link>
              </td>
              <td className="hidden md:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">{new Date(t.stockTakeDate).toLocaleDateString("vi-VN")}</td>
              <td className="px-2 sm:px-3 py-2 text-xs">{t.warehouseCode ?? "—"}</td>
              <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right tabular-nums">{t.lineCount}</td>
              <td className="px-2 sm:px-3 py-2">
                <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${STOCKTAKE_STATUS_COLORS[t.status as StockTakeStatus] ?? "bg-gray-100"}`}>
                  {STOCKTAKE_STATUS_LABELS[t.status as StockTakeStatus] ?? t.status}
                </span>
              </td>
              <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{t.countedAt ? new Date(t.countedAt).toLocaleString("vi-VN") : "—"}</td>
              <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{t.postedAt ? new Date(t.postedAt).toLocaleString("vi-VN") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-sm text-muted-foreground border-t">
        Tổng: {data.total} phiếu
      </div>
    </div>
  );
}
