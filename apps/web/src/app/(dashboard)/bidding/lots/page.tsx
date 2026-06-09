// Server component - Lô thầu
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { BidLotListClient } from "./list-client";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default async function BidLotsPage() {
  let items: any[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: any[]; total: number }>(`/api/v1/bid-lots?pageSize=100`);
    items = data.items;
    total = data.total;
  } catch {}

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Lô / Phần thầu</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Mỗi lô thầu có thể trúng 1 nhà thầu riêng • <strong>{total}</strong> lô
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách lô thầu</CardTitle></CardHeader>
        <CardContent>
          <BidLotListClient initialData={{ items, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

