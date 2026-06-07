"use client";

import Link from "next/link";
import { useState } from "react";
import { useParties, useDeleteParty, type Party } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Trash2, Edit, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PartyForm } from "./party-form";
import type { PartyType, PartyStatus } from "./api";

const STATUS_LABELS: Record<PartyStatus, string> = {
  ACTIVE: "Hoạt động",
  INACTIVE: "Ngưng",
  BLOCKED: "Khóa",
};
const STATUS_COLORS: Record<PartyStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  BLOCKED: "bg-red-100 text-red-800",
};
const TYPE_LABELS: Record<PartyType, string> = {
  SUPPLIER: "Nhà cung cấp",
  CUSTOMER: "Khách hàng",
  BOTH: "NCC + KH",
};

export function PartyTable({ initialData }: { initialData?: { items: Party[]; total: number; page: number; pageSize: number; hasMore: boolean } }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [partyType, setPartyType] = useState<PartyType | "">("");
  const [status, setStatus] = useState<PartyStatus | "">("");
  const [editing, setEditing] = useState<Party | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = {
    page,
    pageSize: 20,
    search: search || undefined,
    partyType: (partyType || undefined) as PartyType | undefined,
    status: (status || undefined) as PartyStatus | undefined,
  };
  const query = useParties(params); const data = initialData ? { items: initialData.items, total: initialData.total, page: initialData.page, pageSize: initialData.pageSize, hasMore: initialData.hasMore } : query.data; const isLoading = initialData ? false : query.isLoading;
  const del = useDeleteParty();

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p: Party) => { setEditing(p); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, mã, MST..."
            className="pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={partyType || "ALL"} onValueChange={(v) => { setPartyType((v === "ALL" ? "" : v) as PartyType | ""); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tất cả loại" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả loại</SelectItem>
            {(Object.keys(TYPE_LABELS) as PartyType[]).map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status || "ALL"} onValueChange={(v) => { setStatus((v === "ALL" ? "" : v) as PartyStatus | ""); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tất cả trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            {(Object.keys(STATUS_LABELS) as PartyStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Thêm đối tác
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Sửa đối tác: ${editing.name}` : "Thêm đối tác mới"}</DialogTitle>
          </DialogHeader>
          {dialogOpen && (
            <PartyForm
              initial={editing ?? undefined}
              onSuccess={() => { closeDialog(); window.location.reload(); }}
              onCancel={closeDialog}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Mã</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Tên</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-left font-medium">Loại</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">MST</th>
              <th className="hidden lg:table-cell px-2 sm:px-3 py-2 text-left font-medium">Liên hệ</th>
              <th className="hidden md:table-cell px-2 sm:px-3 py-2 text-right font-medium">Công nợ</th>
              <th className="px-2 sm:px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-2 sm:px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Chưa có đối tác nào</td></tr>
            )}
            {data?.items.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-2 sm:px-3 py-2 font-mono text-xs whitespace-nowrap">{p.code}</td>
                <td className="px-2 sm:px-3 py-2 font-medium">
                  <div className="flex flex-col">
                    <Link href={`/parties/${p.id}`} className="hover:underline">{p.name}</Link>
                    <span className="md:hidden text-xs text-muted-foreground">
                      {TYPE_LABELS[p.partyType as PartyType] ?? p.partyType}
                    </span>
                  </div>
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2">{TYPE_LABELS[p.partyType as PartyType] ?? p.partyType}</td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-muted-foreground">{p.taxCode ?? "—"}</td>
                <td className="hidden lg:table-cell px-2 sm:px-3 py-2 text-xs">
                  {p.contactName && <div>{p.contactName}</div>}
                  {p.contactPhone && <div className="text-muted-foreground">{p.contactPhone}</div>}
                </td>
                <td className="hidden md:table-cell px-2 sm:px-3 py-2 text-right whitespace-nowrap">{p.creditLimit.toLocaleString("vi-VN")}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_COLORS[p.status as PartyStatus]}`}>
                    {STATUS_LABELS[p.status as PartyStatus] ?? p.status}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Xóa/ngưng "${p.name}"?`)) del.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Trang {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} — Tổng {data.total}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
