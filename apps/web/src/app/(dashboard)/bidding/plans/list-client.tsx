"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle2, Clock } from "lucide-react";

interface BidPlan {
  id: string;
  planNo: string;
  fiscalYear: number;
  title: string;
  totalEstimatedValue?: number;
  status: string;
  packageCount: number;
  createdAt: string;
}

interface Props {
  initialData?: { items: BidPlan[]; total: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  IN_PROGRESS: "Đang thực hiện",
  CLOSED: "Đã đóng",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  APPROVED: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  CLOSED: "bg-yellow-100 text-yellow-800",
};

function formatVND(n: number | undefined) {
  if (!n) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}

export function BidPlanListClient({ initialData }: Props) {
  const [search, setSearch] = useState("");

  const items = (initialData?.items ?? []).filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.planNo.toLowerCase().includes(s) || p.title.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo số KHĐT, tiêu đề..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Chưa có KHĐT nào</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Số KHĐT</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Tiêu đề</th>
                <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Năm</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Tổng dự toán</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium">Số gói</th>
                <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{p.planNo}</td>
                  <td className="px-2 sm:px-3 py-2 font-medium">{p.title}</td>
                  <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-center">{p.fiscalYear}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatVND(p.totalEstimatedValue)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right tabular-nums">{p.packageCount}</td>
                  <td className="px-2 sm:px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_COLORS[p.status] ?? "bg-gray-100"}`}>
                      {p.status === "APPROVED" ? <CheckCircle2 className="inline h-3 w-3 mr-1" /> : <Clock className="inline h-3 w-3 mr-1" />}
                      {STATUS_LABELS[p.status] ?? p.status}
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
