// Server component - Kể hoạch Ä‘ấu thầu nÄƒm
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { MOCK_BID_PLANS } from "@/lib/dev-mock";
import { BidPlanListClient } from "./list-client";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

interface BidPlan {
  id: string;
  planNo: string;
  fiscalYear: number;
  title: string;
  totalEstimatedValue?: number;
  status: string;
  packageCount: number;
  createdAt: string;
}

export const runtime = "edge";

export default async function BidPlansPage() {
  let plans: BidPlan[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: any[]; total: number }>(`/api/v1/bid-plans?pageSize=100`);
    plans = data.items as BidPlan[];
    total = data.total;
  } catch {
    // Fallback to mock khi API chưa chạy
    plans = MOCK_BID_PLANS as any;
    total = plans.length;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kế hoạch đấu thầu</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            KHĐT năm - gom các gói thầu dự kiến trong năm • <strong>{total}</strong> KHĐT
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách KHĐT</CardTitle></CardHeader>
        <CardContent>
          <BidPlanListClient initialData={{ items: plans, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

