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

export default function StockIssuesPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const post = usePostIssue();

  const handleNew = () => setOpen(true);
  const close = () => setOpen(false);
  const handlePost = (i: StockIssue) => {
    if (confirm(`Post phiếu xuất ${i.issueNumber}? Sẽ trừ tồn kho.`)) {
      post.mutate(i.id, { onSuccess: () => router.push(`/stock-issues/${i.id}`) });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Phiếu xuất kho</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Bán hàng, sử dụng nội bộ, hủy hàng, mẫu, quà tặng</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}><Plus className="mr-2 h-4 w-4" /> Tạo phiếu xuất</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader><DialogTitle>Tạo phiếu xuất kho</DialogTitle></DialogHeader>
            <IssueForm onSuccess={close} onCancel={close} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sách</CardTitle></CardHeader>
        <CardContent><IssueTable onNew={handleNew} onPost={handlePost} /></CardContent>
      </Card>
    </div>
  );
}
