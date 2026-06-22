"use client";

import { useParams } from "next/navigation";
import { useStockTake } from "@/features/stocktake/api";
import { StockTakeCountPage } from "@/features/stocktake/stocktake-count-page";
import { StockTakeApprovalPanel } from "@/features/stocktake/stocktake-approval-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default function StockTakeDetailRoute() {
  const params = useParams();
  const id = params?.id as string;
  const { data } = useStockTake(id);

  // Hiển thị 2 tab: Đếm (cho thủ kho) và Duyệt (cho Trưởng khoa)
  // Tự động switch dựa trên status
  const status = data?.status;
  const isPendingApproval = status === "POSTED";

  return (
    <div className="space-y-6">
      {isPendingApproval ? (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <StockTakeApprovalPanel stockTakeId={id} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <StockTakeCountPage stockTakeId={id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
