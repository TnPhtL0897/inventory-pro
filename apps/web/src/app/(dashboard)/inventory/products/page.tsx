// Server component - fetch data trên server, render trực tiếp vào HTML
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { ProductTable } from "@/features/products/product-table";
import type { Product } from "@/features/products/api";

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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vật tư</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Danh mục sản phẩm, vật tư trong kho • <strong>{total}</strong> sản phẩm
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách vật tư</CardTitle>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="text-red-600 p-4">Lỗi: {errorMsg}</div>
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
