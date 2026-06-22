"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GrnTable } from "@/features/goods-receipts/grn-table";
import { GrnForm } from "@/features/goods-receipts/grn-form";
import { usePostGrn, type GoodsReceipt } from "@/features/goods-receipts/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";


export const dynamic = "force-dynamic"


export default function GoodsReceiptsPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const post = usePostGrn();
  const confirmDialog = useConfirm();

  const handleNew = () => setOpen(true);
  const close = () => setOpen(false);
  const handlePost = async (g: GoodsReceipt) => {
    const ok = await confirmDialog.confirm({
      title: `Post GRN ${g.grnNumber}?`,
      description: "Hành động này sẽ ghi stock_movements và cập nhật tồn kho. Phiếu sau khi post không thể chỉnh sửa.",
      variant: "warning",
      confirmLabel: "Post GRN",
    });
    if (ok) {
      post.mutate(g.id, { onSuccess: () => router.push(`/goods-receipts/${g.id}`) });
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Phiểu nhập kho</h1>
          <p className="text-sm sm:text-base text-muted-foreground">GRN â€” tạo tá»« PO hoẹc nhập tay. Post Ä‘á»ƒ ghi stock_movements.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}><Plus className="mr-2 h-4 w-4" /> Tạo GRN</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader><DialogTitle>Tạo phiểu nhập kho má»›i</DialogTitle></DialogHeader>
            <GrnForm onSuccess={close} onCancel={close} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sách</CardTitle></CardHeader>
        <CardContent><GrnTable onNew={handleNew} onPost={handlePost} /></CardContent>
      </Card>

      <confirmDialog.ConfirmHost />
    </div>
  );
}

