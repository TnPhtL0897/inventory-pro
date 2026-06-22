"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IssueTable } from "@/features/stock-issues/issue-table";
import { IssueForm } from "@/features/stock-issues/issue-form";
import { usePostIssue, type StockIssue } from "@/features/stock-issues/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";


export const dynamic = "force-dynamic"


export default function StockIssuesPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const post = usePostIssue();
  const confirmDialog = useConfirm();

  const handleNew = () => setOpen(true);
  const close = () => setOpen(false);
  const handlePost = async (i: StockIssue) => {
    const ok = await confirmDialog.confirm({
      title: `Post phiểu xuất ${i.issueNumber}?`,
      description: "Sẽ trừ tồn kho và ghi stock_movements. Hành động này không thể hoàn tác.",
      variant: "warning",
      confirmLabel: "Post phiếu",
    });
    if (ok) {
      post.mutate(i.id, { onSuccess: () => router.push(`/stock-issues/${i.id}`) });
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Phiểu xuất kho</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Bán hàng, sá»­ dá»¥ng ná»™i bá»™, há»§y hàng, mẫu, quà tẹng</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}><Plus className="mr-2 h-4 w-4" /> Tạo phiểu xuất</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader><DialogTitle>Tạo phiểu xuất kho</DialogTitle></DialogHeader>
            <IssueForm onSuccess={close} onCancel={close} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sách</CardTitle></CardHeader>
        <CardContent><IssueTable onNew={handleNew} onPost={handlePost} /></CardContent>
      </Card>

      <confirmDialog.ConfirmHost />
    </div>
  );
}

