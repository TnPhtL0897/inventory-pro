"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Globe, Lock, Handshake, FileText } from "lucide-react";

interface BidPackage {
  id: string;
  packageNo: string;
  packageName: string;
  bidPlanNo?: string;
  bidPackageType: string;
  bidPackageStatus: string;
  totalEstimatedValue?: number;
  decisionNo?: string;
  lotCount: number;
  procurementMethod?: string;
}

interface Props {
  initialData?: { items: BidPackage[]; total: number };
}

const TYPE_LABELS: Record<string, string> = {
  OPEN: "Rộng rãi",
  LIMITED: "Hạn chế",
  DIRECT: "Chỉ định",
  COMPETITIVE_QUOTE: "Chào hàng cạnh tranh",
};
const TYPE_ICONS: Record<string, any> = {
  OPEN: Globe, LIMITED: Lock, DIRECT: Handshake, COMPETITIVE_QUOTE: FileText,
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  PUBLISHED: "Đã đăng",
  CLOSED: "Đã đóng",
  AWARDED: "Đã chấm",
  CANCELLED: "Đã hủy",
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PUBLISHED: "bg-green-100 text-green-800",
  CLOSED: "bg-yellow-100 text-yellow-800",
  AWARDED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-800",
};

function formatVND(n: number | undefined) {
  if (!n) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}

export function BidPackageListClient({ initialData }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");

  const items = (initialData?.items ?? []).filter((p) => {
    if (status && p.bidPackageStatus !== status) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return p.packageNo.toLowerCase().includes(s) || p.packageName.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm theo mã gói, tên gói..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <div className="text-center py-8 text-muted-foreground">Chưa có gói thầu nào</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Mã gói</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Tên gói</th>
                <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Hình thức</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Tổng dự toán</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Số lô</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const Icon = TYPE_ICONS[p.bidPackageType];
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{p.packageNo}</td>
                    <td className="px-2 sm:px-3 py-2">
                      <div className="font-medium">{p.packageName}</div>
                      {p.decisionNo && <div className="text-xs text-muted-foreground">QĐ: {p.decisionNo}</div>}
                    </td>
                    <td className="hidden md:table-cell px-2 sm:px-3 py-2">
                      {Icon && <Icon className="inline h-3 w-3 mr-1" />}
                      <span className="text-xs">{TYPE_LABELS[p.bidPackageType] ?? p.bidPackageType}</span>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatVND(p.totalEstimatedValue)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums">{p.lotCount}</td>
                    <td className="px-2 sm:px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_COLORS[p.bidPackageStatus] ?? "bg-gray-100"}`}>
                        {STATUS_LABELS[p.bidPackageStatus] ?? p.bidPackageStatus}
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
