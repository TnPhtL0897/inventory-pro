"use client";

// Client component - fetch data via Supabase PostgREST (useProducts hook)
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Plus, RefreshCw } from "lucide-react";
import { useProducts } from "@/features/products/api";
import { ProductTable } from "@/features/products/product-table";
import { EmptyState, EmptyStatePresets } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Button as Button_ } from "@/components/ui/button";

export const dynamic = "force-dynamic";


export default function ProductsPage() {
  const { data, isLoading, error, refetch, isRefetching } = useProducts({ pageSize: 100 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const errorMsg = error instanceof Error ? error.message : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trang</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vật tư</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Danh mục sản phẩm, vật tư trong kho • {total} sản phẩm
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            aria-label="Làm mới"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
          <Link href="/inventory/products/import">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import Excel
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách vật tư</CardTitle>
        </CardHeader>
        <CardContent>
          {errorMsg ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Không thể tải dữ liệu</AlertTitle>
              <AlertDescription>
                {errorMsg}
                <Button_ variant="outline" size="sm" className="ml-2" onClick={() => refetch()}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Thử lại
                </Button_>
              </AlertDescription>
            </Alert>
          ) : isLoading && items.length === 0 ? (
            <TableSkeleton rows={8} cols={6} showSearch showFilters />
          ) : items.length === 0 ? (
            <EmptyState
              {...EmptyStatePresets.noProducts}
              size="md"
            />
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
