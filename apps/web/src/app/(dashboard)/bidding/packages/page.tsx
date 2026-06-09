// Server component - Gói thầu
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { BidPackageListClient } from "./list-client";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export const runtime = "edge";

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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Gói thầu</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Má»—i gói có thá»ƒ chia thành nhiá»u lÃ´ â€¢ <strong>{total}</strong> gói
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách gói thầu</CardTitle></CardHeader>
        <CardContent>
          <BidPackageListClient initialData={{ items, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

