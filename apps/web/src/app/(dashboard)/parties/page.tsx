import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

import { api } from "@/lib/api";
import { PartyTable } from "@/features/parties/party-table";
import type { Party } from "@/features/parties/api";

export const runtime = "edge";

export default async function PartiesPage() {
  let parties: Party[] = [];
  let total = 0;
  try {
    const data = await api.get<{ items: Party[]; total: number }>("/api/v1/parties?pageSize=100");
    parties = data.items;
    total = data.total;
  } catch {}
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Đối tác</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Nhà cung cấp, khách hàng • <strong>{total}</strong> đối tác</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách đối tác</CardTitle></CardHeader>
        <CardContent>
          {parties.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Chưa có đối tác.</div>
          ) : (
            <PartyTable
              initialData={{ items: parties, total, page: 1, pageSize: 100, hasMore: false }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

