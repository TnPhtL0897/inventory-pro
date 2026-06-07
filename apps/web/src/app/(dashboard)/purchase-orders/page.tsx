"use client";

import { useState } from "react";
import { PoTable } from "@/features/purchase-orders/po-table";
import { PoForm } from "@/features/purchase-orders/po-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { PurchaseOrder } from "@/features/purchase-orders/api";

export default function PurchaseOrdersPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);

  const handleEdit = (po: PurchaseOrder) => { setEditing(po); setOpen(true); };
  const handleNew = () => { setEditing(null); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Đơn mua hàng</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Purchase Order — workflow DRAFT → APPROVED → POSTED</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}><Plus className="mr-2 h-4 w-4" /> Tạo PO</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{editing ? `Sửa: ${editing.poNumber}` : "Tạo đơn mua hàng"}</DialogTitle>
            </DialogHeader>
            <PoForm initial={editing ?? undefined} onSuccess={close} onCancel={close} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sách</CardTitle></CardHeader>
        <CardContent>
          <PoTable onEdit={handleEdit} onNew={handleNew} />
        </CardContent>
      </Card>
    </div>
  );
}
