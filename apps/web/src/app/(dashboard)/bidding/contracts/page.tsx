"use client";

// Client component - list-client has its own useBidContracts hook (PostgREST).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBidContracts } from "@/features/bid-contracts/api";
import { BidContractListClient } from "./list-client";

export const dynamic = "force-dynamic";


export default function BidContractsPage() {
  // Page-level query just to display the total count in the header
  const { data } = useBidContracts({ page: 1, pageSize: 1 });
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trang</p>
<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hợp đồng thầu</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Quản lý hợp đồng đã ký với nhà thầu trúng • {total} hợp đồng
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
