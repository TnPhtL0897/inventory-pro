"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBidContracts, type BidContract, type BidContractListParams, type BidContractStatus } from "@/features/bid-contracts/api";
import { Search, AlertTriangle, CheckCircle2, XCircle, FileText } from "lucide-react";

interface Props {
  initialData?: { items: BidContract[]; total: number };
}

const STATUS_LABELS: Record<BidContractStatus, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Đang hiệu lực",
  EXPIRED: "Hết hạn",
  TERMINATED: "Đã hủy",
  COMPLETED: "Hoàn thành",
};

const STATUS_COLORS: Record<BidContractStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-yellow-100 text-yellow-800",
  TERMINATED: "bg-red-100 text-red-800",
  COMPLETED: "bg-blue-100 text-blue-800",
};

function formatVND(n: number) {
  return n.toLocaleString("vi-VN") + " ₫";
}

export function BidContractListClient({ initialData }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BidContractStatus | "">("");

  const params: BidContractListParams = {
    page: 1,
    pageSize: 50,
    status: (status || undefined) as BidContractStatus | undefined,
  };
  const query = useBidContracts(params);
  const data = initialData ?? query.data;
  const isLoading = initialData ? false : query.isLoading;

  const items = (data?.items ?? []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.contractNo.toLowerCase().includes(s) ||
      (c.winningPartyName?.toLowerCase().includes(s)) ||
      (c.lotName?.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm số HĐ, NCC, lô thầu..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status || "ALL"} onValueChange={(v) => setStatus((v === "ALL" ? "" : v) as BidContractStatus | "")}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {(Object.keys(STATUS_LABELS) as BidContractStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Chưa có hợp đồng thầu nào</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Số HĐ</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Lô thầu</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Nhà thầu</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Giá trị</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Đã dùng / Còn lại</th>
                <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Hạn HĐ</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const pct = c.contractValue > 0 ? (c.usedValue / c.contractValue) * 100 : 0;
                const expiringSoon = c.daysToExpiry < 30 && c.daysToExpiry > 0;
                return (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{c.contractNo}</td>
                    <td className="px-2 sm:px-3 py-2">
                      <div className="font-medium">{c.lotNo}</div>
                      <div className="text-xs text-muted-foreground">{c.lotName}</div>
                    </td>
                    <td className="px-2 sm:px-3 py-2">
                      <div className="font-medium">{c.winningPartyName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.winningPartyCode}</div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">
                      {formatVND(c.contractValue)}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right">
                      <div className="text-xs text-muted-foreground">đã dùng {pct.toFixed(1)}%</div>
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden my-1">
                        <div
                          className={`h-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="text-xs tabular-nums">Còn {formatVND(c.remainingValue)}</div>
                    </td>
                    <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-xs">
                      <div>{c.contractStartDate}</div>
                      <div className="text-muted-foreground">→ {c.contractEndDate}</div>
                      {expiringSoon ? (
                        <div className="text-amber-700 font-medium flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> còn {c.daysToExpiry} ngày
                        </div>
                      ) : (
                        <div className="text-muted-foreground mt-1">
                          {c.daysToExpiry > 0 ? `còn ${c.daysToExpiry} ngày` : `đã qua ${Math.abs(c.daysToExpiry)} ngày`}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_COLORS[c.bidContractStatus] ?? "bg-gray-100"}`}>
                        {STATUS_LABELS[c.bidContractStatus] ?? c.bidContractStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
