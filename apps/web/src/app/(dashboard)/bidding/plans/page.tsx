// Server component - Káº¿ hoáº¡ch Ä‘áº¥u tháº§u nÄƒm
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

export default async function BidPlansPage() {
  let plans: BidPlan[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: any[]; total: number }>(`/api/v1/bid-plans?pageSize=100`);
    plans = data.items as BidPlan[];
    total = data.total;
  } catch {
    // Fallback to mock khi API chÆ°a cháº¡y
    plans = MOCK_BID_PLANS as any;
    total = plans.length;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Káº¿ hoáº¡ch Ä‘áº¥u tháº§u</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            KHÄT nÄƒm - gom cÃ¡c gÃ³i tháº§u dá»± kiáº¿n trong nÄƒm â€¢ <strong>{total}</strong> KHÄT
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sÃ¡ch KHÄT</CardTitle></CardHeader>
        <CardContent>
          <BidPlanListClient initialData={{ items: plans, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

