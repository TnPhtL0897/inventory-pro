"use client";

import Link from "next/link";
import { useState } from "react";
import { useStockIssues, ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS, PURPOSE_LABELS, type IssueStatus, type IssuePurpose, type StockIssue } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronLeft, ChevronRight, Send } from "lucide-react";

export function IssueTable({ onNew, onPost }: { onNew: () => void; onPost: (i: StockIssue) => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IssueStatus | "">("");
  const [purpose, setPurpose] = useState<IssuePurpose | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = {
    page, pageSize: 20, search: search || undefined,
    status: (status || undefined) as IssueStatus | undefined,
    purpose: (purpose || undefined) as IssuePurpose | undefined,
    dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
  };
  const { data, isLoading } = useStockIssues(params);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Input placeholder="Tìm số phiếu, số chứng từ..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[150px]" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[150px]" />
        <Select value={purpose || "ALL"} onValueChange={(v) => { setPurpose((v === "ALL" ? "" : v) as IssuePurpose | ""); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mục đích" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {(Object.keys(PURPOSE_LABELS) as IssuePurpose[]).filter((p) => p !== "TRANSFER_OUT" && p !== "ADJUSTMENT").map((p) => (
              <SelectItem key={p} value={p}>{PURPOSE_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as IssueStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {(Object.keys(ISSUE_STATUS_LABELS) as IssueStatus[]).map((s) => <SelectItem key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" /> Tạo phiếu xuất</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Số phiếu</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Ngày</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Mục đích / Kho</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Khách hàng</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Số CT</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>}
            {!isLoading && data?.items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Chưa có phiếu xuất</td></tr>}
            {data?.items.map((s) => (
              <tr key={s.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">
                  <Link href={`/stock-issues/${s.id}`} className="hover:underline">{s.issueNumber}</Link>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 whitespace-nowrap">{new Date(s.issueDate).toLocaleDateString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2 text-xs">
                  <div className="font-medium">{PURPOSE_LABELS[s.purpose as IssuePurpose] ?? s.purpose}</div>
                  <div className="text-muted-foreground">{s.warehouseCode ?? "—"}</div>
                </td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs">{s.partyName ?? "—"}</td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-xs font-mono">{s.referenceNo ?? "—"}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${ISSUE_STATUS_COLORS[s.status as IssueStatus] ?? "bg-gray-100"}`}>
                    {ISSUE_STATUS_LABELS[s.status as IssueStatus] ?? s.status}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  {s.status === "DRAFT" && (
                    <Button size="icon" variant="ghost" onClick={() => onPost(s)} className="h-10 w-10 sm:h-8 sm:w-10" aria-label="Đăng">
                      <Send className="h-4 w-4 text-blue-600" />
                    </Button>
                  )}
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
    </div>
  );
}
