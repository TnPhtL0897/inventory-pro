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


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default function GoodsReceiptsPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const post = usePostGrn();

  const handleNew = () => setOpen(true);
  const close = () => setOpen(false);
  const handlePost = (g: GoodsReceipt) => {
    if (confirm(`Post GRN ${g.grnNumber}? HÃ nh Ä‘á»™ng nÃ y sáº½ ghi stock_movements vÃ  cáº­p nháº­t tá»“n kho.`)) {
      post.mutate(g.id, { onSuccess: () => router.push(`/goods-receipts/${g.id}`) });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Phiáº¿u nháº­p kho</h1>
          <p className="text-sm sm:text-base text-muted-foreground">GRN â€” táº¡o tá»« PO hoáº·c nháº­p tay. Post Ä‘á»ƒ ghi stock_movements.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}><Plus className="mr-2 h-4 w-4" /> Táº¡o GRN</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader><DialogTitle>Táº¡o phiáº¿u nháº­p kho má»›i</DialogTitle></DialogHeader>
            <GrnForm onSuccess={close} onCancel={close} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sÃ¡ch</CardTitle></CardHeader>
        <CardContent><GrnTable onNew={handleNew} onPost={handlePost} /></CardContent>
      </Card>
    </div>
  );
}

