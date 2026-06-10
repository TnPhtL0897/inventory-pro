"use client";

// Client component - fetch parties via Supabase PostgREST
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParties } from "@/features/parties/api";
import { PartyTable } from "@/features/parties/party-table";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function PartiesPage() {
  const { data, isLoading } = useParties({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

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
          {isLoading && items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Chưa có đối tác.</div>
          ) : (
            <PartyTable
              initialData={{ items, total, page: 1, pageSize: 100, hasMore: false }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
