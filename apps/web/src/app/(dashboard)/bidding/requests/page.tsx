// Server component - Dự trù mua sắm
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default async function PurchaseRequestsPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dự trù mua sắm</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Dự trù nhu cầu từ các khoa/phòng - gom thành gói thầu
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Danh sách dự trù
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Module Dự trù đang được phát triển.</p>
            <p className="text-xs mt-2">
              Các trang chính đã sẵn sàng: <a href="/bidding/plans" className="text-blue-600 hover:underline">Kế hoạch đấu thầu</a> · <a href="/bidding/packages" className="text-blue-600 hover:underline">Gói thầu</a> · <a href="/bidding/lots" className="text-blue-600 hover:underline">Lô thầu</a> · <a href="/bidding/contracts" className="text-blue-600 hover:underline">Hợp đồng thầu</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
