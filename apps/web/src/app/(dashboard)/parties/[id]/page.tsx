"use client";

import { use } from "react";
import { useParty } from "@/features/parties/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export const runtime = "edge";

export default function PartyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: party, isLoading } = useParty(id);

  if (isLoading) return <div>Đang tải...</div>;
  if (!party) return <div>Không tìm thấy đối tác</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{party.name}</h1>
        <p className="text-muted-foreground font-mono">{party.code}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Loại" value={party.partyType} />
            <Row label="Mã số thuế" value={party.taxCode ?? "—"} />
            <Row label="Trạng thái" value={party.status} />
            <Row label="Ngày tạo" value={new Date(party.createdAt).toLocaleString("vi-VN")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Liên hệ</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Người LH" value={party.contactName ?? "—"} />
            <Row label="Email" value={party.contactEmail ?? "—"} />
            <Row label="SĐT" value={party.contactPhone ?? "—"} />
            <Row label="Địa chỉ" value={party.address ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tài chính</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Thanh toán" value={`${party.paymentTerms} ngày`} />
            <Row label="Hạn mức công nợ" value={party.creditLimit.toLocaleString("vi-VN")} />
            <Row label="Số TK" value={party.bankAccount ?? "—"} />
            <Row label="Ngân hàng" value={party.bankName ?? "—"} />
          </CardContent>
        </Card>

        {party.notes && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Ghi chú</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{party.notes}</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="w-32 text-muted-foreground">{label}</span>
      <span className="flex-1 font-medium">{value}</span>
    </div>
  );
}
