"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoodsReceipt, usePostGrn, useCancelGrn, GRN_STATUS_LABELS, GRN_STATUS_COLORS, type GrnStatus } from "@/features/goods-receipts/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Send, X } from "lucide-react";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: grn, isLoading } = useGoodsReceipt(id);
  const post = usePostGrn();
  const cancel = useCancelGrn();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (isLoading) return <div>Đang tải...</div>;
  if (!grn) return <div>Không tìm thấy GRN</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-mono">{grn.grnNumber}</h1>
            <p className="text-muted-foreground">Phiếu nhập kho</p>
          </div>
          <span className={`rounded px-2 py-1 text-xs ${GRN_STATUS_COLORS[grn.status as GrnStatus]}`}>
            {GRN_STATUS_LABELS[grn.status as GrnStatus] ?? grn.status}
          </span>
        </div>
        <div className="flex gap-2">
          {grn.status === "DRAFT" && (
            <>
              <Button onClick={() => post.mutate(grn.id)} disabled={post.isPending}>
                <Send className="mr-2 h-4 w-4" /> Post (ghi stock_movements)
              </Button>
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <X className="mr-2 h-4 w-4" /> Hủy
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Thông tin</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Số GRN" value={grn.grnNumber} mono />
            <Row label="Ngày nhận" value={new Date(grn.receiptDate).toLocaleDateString("vi-VN")} />
            <Row label="Số HĐ NCC" value={grn.supplierInvoiceNo ?? "—"} />
            <Row label="Ngày HĐ" value={grn.supplierInvoiceDate ? new Date(grn.supplierInvoiceDate).toLocaleDateString("vi-VN") : "—"} />
            {grn.poNumber && <Row label="PO" value={grn.poNumber} mono />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>NCC</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Mã" value={grn.partyCode ?? "—"} mono />
            <Row label="Tên" value={grn.partyName ?? "—"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Kho</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Mã" value={grn.warehouseCode ?? "—"} mono />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Dòng hàng ({grn.lineCount})</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Danh sách dòng chi tiết từ <code>GET /api/v1/goods-receipts/{grn.id}</code> (khi backend trả về <code>lines</code> trong detail response).
          </p>
        </CardContent>
      </Card>

      {grn.notes && (
        <Card>
          <CardHeader><CardTitle>Ghi chú</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{grn.notes}</CardContent>
        </Card>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hủy phiếu nhập kho</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Lý do hủy *</label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Đóng</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancel.isPending}
              onClick={async () => {
                await cancel.mutateAsync({ id: grn.id, reason: cancelReason });
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex">
      <span className="w-32 text-muted-foreground">{label}</span>
      <span className={`flex-1 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
