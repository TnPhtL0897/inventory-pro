import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

import { api } from "@/lib/api";
import { TransferFormClient } from "./transfer-form-client";
import { TransfersTableSSR } from "@/features/transfers/transfers-table-ssr";
import type { StockTransfer } from "@/features/transfers/api";

export default async function TransfersPage() {
  let transfers: StockTransfer[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: StockTransfer[]; total: number }>("/api/v1/stock-transfers?pageSize=100");
    transfers = data.items;
    total = data.total;
  } catch {}
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Chuyá»ƒn kho</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Phiáº¿u chuyá»ƒn kho ná»™i bá»™ â€¢ <strong>{total}</strong> phiáº¿u</p>
        </div>
        <TransferFormClient />
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sÃ¡ch phiáº¿u chuyá»ƒn</CardTitle></CardHeader>
        <CardContent>
          <TransfersTableSSR data={{ items: transfers, total }} />
        </CardContent>
      </Card>
    </div>
  );
}

