"use client";

// Client component - fetch data via Supabase PostgREST (useProducts hook)
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useProducts } from "@/features/products/api";
import { ProductTable } from "@/features/products/product-table";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function ProductsPage() {
  const { data, isLoading, error } = useProducts({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const errorMsg = error instanceof Error ? error.message : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vật tư</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Danh mục sản phẩm, vật tư trong kho • <strong>{total}</strong> sản phẩm
          </p>
        </div>
        <Link href="/inventory/products/import">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import Excel
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách vật tư</CardTitle>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <div className="text-red-600 p-4">Lỗi: {errorMsg}</div>
          ) : isLoading && items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <ProductTable
              initialData={{ items, total, page: 1, pageSize: 100, hasMore: false }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
