// Server component - GÃ³i tháº§u
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { BidPackageListClient } from "./list-client";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default async function BidPackagesPage() {
  let items: any[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: any[]; total: number }>(`/api/v1/bid-packages?pageSize=100`);
    items = data.items;
    total = data.total;
  } catch {}

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">GÃ³i tháº§u</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Má»—i gÃ³i cÃ³ thá»ƒ chia thÃ nh nhiá»u lÃ´ â€¢ <strong>{total}</strong> gÃ³i
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sÃ¡ch gÃ³i tháº§u</CardTitle></CardHeader>
        <CardContent>
          <BidPackageListClient initialData={{ items, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

