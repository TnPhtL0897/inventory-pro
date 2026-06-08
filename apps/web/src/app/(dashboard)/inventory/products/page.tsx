// Server component - fetch data trÃªn server, render trá»±c tiáº¿p vÃ o HTML
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { ProductTable } from "@/features/products/product-table";
import type { Product } from "@/features/products/api";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default async function ProductsPage() {
  // Fetch on server - mock returns sync
  let products: Product[] = [];
  let total = 0;
  let errorMsg: string | null = null;
  try {
    const data = await api.get<{ items: Product[]; total: number }>("/api/v1/products?pageSize=100");
    products = data.items;
    total = data.total;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Váº­t tÆ°</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Danh má»¥c sáº£n pháº©m, váº­t tÆ° trong kho â€¢ <strong>{total}</strong> sáº£n pháº©m
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sÃ¡ch váº­t tÆ°</CardTitle>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="text-red-600 p-4">Lá»—i: {errorMsg}</div>
          ) : (
            <ProductTable
              initialData={{ items: products, total, page: 1, pageSize: 100, hasMore: false }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

