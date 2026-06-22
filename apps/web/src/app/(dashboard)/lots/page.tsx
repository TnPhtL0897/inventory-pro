"use client";

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, AlertTriangle, Plus, AlertOctagon, Trash2 } from "lucide-react";
import { LotTable } from "@/features/lots/lot-table";
import { LotAlertsDashboard } from "@/features/lots/lot-alerts-dashboard";
import { LotRecallModal } from "@/features/lots/lot-recall-modal";
import type { ProductGroup } from "@inventorypro/shared-types";

export const dynamic = "force-dynamic";

export default function LotsPage() {
  const [tab, setTab] = useState("hc-sp");
  const [recallOpen, setRecallOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 sm:h-8 sm:w-8" />
            Quản lý lô vật tư
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Khoa XN — vòng đời lô, QC, open-vial, recall, xuất hủy
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => setRecallOpen(true)}>
            <AlertOctagon className="h-4 w-4 mr-1" />
            Tạo Recall
          </Button>
        </div>
      </div>

      {/* Alerts dashboard - always visible */}
      <LotAlertsDashboard />

      {/* Tabs theo mảng */}
      <Tabs defaultValue={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="hc-sp">Hóa chất - Sinh phẩm</TabsTrigger>
          <TabsTrigger value="vtyt">Vật tư y tế</TabsTrigger>
        </TabsList>

        <TabsContent value="hc-sp" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Danh sách lô HC-SP</CardTitle>
            </CardHeader>
            <CardContent>
              <LotTable productGroup={"HOA_CHAT_SINH_PHAM" as ProductGroup} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vtyt" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Danh sách lô VTYT</CardTitle>
            </CardHeader>
            <CardContent>
              <LotTable productGroup={"VAT_TU_Y_TE" as ProductGroup} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LotRecallModal open={recallOpen} onOpenChange={setRecallOpen} />

      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        <h3 className="font-medium mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Trạng thái lô (10 trạng thái)
        </h3>
        <ul className="space-y-1 text-muted-foreground list-disc pl-5 text-xs">
          <li><strong>QUARANTINE</strong>: Vừa nhập, đang kiểm tra sơ bộ</li>
          <li><strong>PENDING_QC</strong>: Chờ QC duyệt (chỉ HC-SP)</li>
          <li><strong>IN_QC</strong>: QC đang kiểm tra</li>
          <li><strong>APPROVED</strong>: Đạt chất lượng, sẵn sàng sử dụng</li>
          <li><strong>IN_USE</strong>: Đang sử dụng (đã mở nắp)</li>
          <li><strong>DEPLETED</strong>: Hết số lượng</li>
          <li><strong>EXPIRED</strong>: Hết hạn (auto EXPIRED lúc 00:30 sáng)</li>
          <li><strong>DESTROYED</strong>: Đã xuất hủy</li>
          <li><strong>QC_FAILED</strong>: QC không đạt</li>
          <li><strong>BLOCKED</strong>: Bị recall / vấn đề chất lượng</li>
        </ul>
      </div>
    </div>
  );
}
