"use client";

// Client component - list-client has its own useBidContracts hook (PostgREST).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBidContracts } from "@/features/bid-contracts/api";
import { BidContractListClient } from "./list-client";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function BidContractsPage() {
  // Page-level query just to display the total count in the header
  const { data } = useBidContracts({ page: 1, pageSize: 1 });
  const total = data?.total ?? 0;

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
          <BidContractListClient />
        </CardContent>
      </Card>
    </div>
  );
}
