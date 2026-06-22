"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { usePurchaseOrder, useApprovePo, usePostPo, useCancelPo, PO_STATUS_LABELS, PO_STATUS_COLORS, type PoStatus } from "@/features/purchase-orders/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Check, Send, X } from "lucide-react";


export const dynamic = "force-dynamic"


export default function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const approve = useApprovePo();
  const post = usePostPo();
  const cancel = useCancelPo();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (isLoading) return <div>Đang tải...</div>;
  if (!po) return <div>Không tìm thấy PO</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-mono">{po.poNumber}</h1>
            <p className="text-muted-foreground">Đơn mua hàng</p>
          </div>
          <span className={`rounded px-2 py-1 text-xs ${PO_STATUS_COLORS[po.status as PoStatus]}`}>
            {PO_STATUS_LABELS[po.status as PoStatus] ?? po.status}
          </span>
        </div>
        <div className="flex gap-2">
          {po.status === "DRAFT" && (
            <Button onClick={() => approve.mutate({ id: po.id })} disabled={approve.isPending}>
              <Check className="mr-2 h-4 w-4" /> Duyệt
            </Button>
          )}
          {po.status === "APPROVED" && (
            <Button onClick={() => post.mutate(po.id)} disabled={post.isPending}>
              <Send className="mr-2 h-4 w-4" /> Post (đặt hàng)
            </Button>
          )}
          {["DRAFT", "APPROVED", "POSTED"].includes(po.status) && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              <X className="mr-2 h-4 w-4" /> Hủy
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Số PO" value={po.poNumber} mono />
            <Row label="Ngày đặt" value={new Date(po.orderDate).toLocaleDateString("vi-VN")} />
            <Row label="Ngày dự kiến" value={po.expectedDate ? new Date(po.expectedDate).toLocaleDateString("vi-VN") : "—"} />
            <Row label="Tiền tệ" value={po.currency} />
            <Row label="Thanh toán" value={`${po.paymentTerms} ngày`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nhà cung cấp</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Mã" value={po.partyCode ?? "—"} mono />
            <Row label="Tên" value={po.partyName ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tổng tiền</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Tạm tính" value={po.subtotal.toLocaleString("vi-VN")} />
            <Row label="Chiết khấu" value={po.discountAmount.toLocaleString("vi-VN")} />
            <Row label="VAT" value={po.taxAmount.toLocaleString("vi-VN")} />
            <Row label="Phí ship" value={po.shippingAmount.toLocaleString("vi-VN")} />
            <Row label="Tổng cộng" value={po.total.toLocaleString("vi-VN")} bold />
            <Row label="Đã thanh toán" value={po.paidAmount.toLocaleString("vi-VN")} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Dòng hàng ({po.lineCount})</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tính năng xem dòng hàng chi tiết sẽ hiển thị tại đây sau khi load từ <code>GET /api/v1/purchase-orders/{po.id}</code> trả về lines.
            Tạm thời xem qua API: <a href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000"}/api/v1/purchase-orders/${po.id}`} target="_blank" className="underline text-blue-600">mở Swagger</a>
          </p>
        </CardContent>
      </Card>

      {po.notes && (
        <Card>
          <CardHeader><CardTitle>Ghi chú</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{po.notes}</CardContent>
        </Card>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hủy đơn mua hàng</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Lý do hủy *</label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} placeholder="Nhập lý do..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Đóng</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancel.isPending}
              onClick={async () => {
                await cancel.mutateAsync({ id: po.id, reason: cancelReason });
                setCancelOpen(false);
              }}
            >
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex">
      <span className="w-32 text-muted-foreground">{label}</span>
      <span className={`flex-1 ${mono ? "font-mono text-xs" : ""} ${bold ? "font-bold text-base" : ""}`}>{value}</span>
    </div>
  );
}
