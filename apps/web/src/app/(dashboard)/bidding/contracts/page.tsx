// Server component - fetch data trên server
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { BidContract, BidContractListParams } from "@/features/bid-contracts/api";
import { BidContractListClient } from "./list-client";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export const runtime = "edge";

export default async function BidContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; expiringSoon?: string }>;
}) {
  // Next.js 15: searchParams là async, phải await
  const sp = await searchParams;
  const params: BidContractListParams = {
    pageSize: 100,
    status: (sp.status as any) || undefined,
    expiringSoon: sp.expiringSoon === "true",
  };

  let contracts: BidContract[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: BidContract[]; total: number }>(`/api/v1/bid-contracts?pageSize=100`);
    contracts = data.items;
    total = data.total;
  } catch {}

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Hợp đồng thầu</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Quản lý hợp đồng đã ký với nhà thầu trúng • <strong>{total}</strong> hợp đồng
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách hợp đồng thầu</CardTitle></CardHeader>
        <CardContent>
          <BidContractListClient initialData={{ items: contracts, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

