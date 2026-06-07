"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Award, FileText } from "lucide-react";

interface BidLot {
  id: string;
  lotNo: string;
  lotName: string;
  bidPackageNo?: string;
  bidLotStatus: string;
  productCategory?: string;
  estimatedValue?: number;
  quantityTotal?: number;
  unit?: string;
  awardedBidderName?: string;
  awardedValue?: number;
  awardedDate?: string;
  contractNo?: string;
}

interface Props {
  initialData?: { items: BidLot[]; total: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PUBLISHED: "Đã đăng",
  EVALUATING: "Đang chấm",
  AWARDED: "Đã trúng",
  CANCELLED: "Đã hủy",
  NO_BIDDER: "Không có NCC",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  PUBLISHED: "bg-blue-100 text-blue-800",
  EVALUATING: "bg-yellow-100 text-yellow-800",
  AWARDED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  NO_BIDDER: "bg-gray-100 text-gray-600",
};

function formatVND(n: number | undefined) {
  if (!n) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}

export function BidLotListClient({ initialData }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");

  const items = (initialData?.items ?? []).filter((l) => {
    if (status && l.bidLotStatus !== status) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return l.lotNo.toLowerCase().includes(s) ||
      l.lotName.toLowerCase().includes(s) ||
      (l.awardedBidderName?.toLowerCase().includes(s)) ||
      false;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo mã lô, tên lô, NCC..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Chưa có lô thầu nào</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Mã lô</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Tên lô</th>
                <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Gói thầu</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Giá trị</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">NCC trúng</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/30">
                  <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{l.lotNo}</td>
                  <td className="px-2 sm:px-3 py-2">
                    <div className="font-medium">{l.lotName}</div>
                    {l.productCategory && <div className="text-xs text-muted-foreground">Nhóm: {l.productCategory}</div>}
                  </td>
                  <td className="hidden md:table-cell px-2 sm:px-3 py-2 font-mono text-xs">{l.bidPackageNo}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    <div className="text-xs text-muted-foreground">dự toán: {formatVND(l.estimatedValue)}</div>
                    {l.awardedValue && (
                      <div className="font-semibold text-green-700">trúng: {formatVND(l.awardedValue)}</div>
                    )}
                  </td>
                  <td className="px-2 sm:px-3 py-2">
                    {l.awardedBidderName ? (
                      <div>
                        <div className="font-medium text-green-700">{l.awardedBidderName}</div>
                        {l.contractNo && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <FileText className="h-3 w-3" />{l.contractNo}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 sm:px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_COLORS[l.bidLotStatus] ?? "bg-gray-100"}`}>
                      {l.bidLotStatus === "AWARDED" && <Award className="inline h-3 w-3 mr-1" />}
                      {STATUS_LABELS[l.bidLotStatus] ?? l.bidLotStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
