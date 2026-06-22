"use client";

// Client component - fetch bid packages + per-package lot counts + plan no via PostgREST
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sb } from "@/lib/data-access";
import { BidPackageListClient } from "./list-client";

export const dynamic = "force-dynamic";


interface BidPackageRow {
  id: string;
  package_no: string;
  package_name: string;
  bid_plan_id: string | null;
  bid_package_type: string;
  bid_package_status: string;
  total_estimated_value: number | null;
  decision_no: string | null;
  procurement_method: string | null;
  bid_plans: { plan_no: string } | null; // via bid_plan_id
}

export default function BidPackagesPage() {
  const pkgsQuery = useQuery({
    queryKey: ["bid-packages", "page"],
    queryFn: async () => {
      const { data: rows, count, error } = await sb()
        .from("bid_packages")
        .select(
          "id,package_no,package_name,bid_plan_id,bid_package_type,bid_package_status," +
            "total_estimated_value,decision_no,procurement_method," +
            "bid_plans:bid_plan_id(plan_no)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(0, 99);
      if (error) throw new Error(`bid_packages: ${error.message}`);
      return { rows: (rows ?? []) as unknown as BidPackageRow[], total: count ?? 0 };
    },
  });

  // Per-package lot count (small, fetch all then count)
  const lotsQuery = useQuery({
    queryKey: ["bid-lots", "all-for-counts"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("bid_lots")
        .select("id,bid_package_id")
        .range(0, 9999);
      if (error) throw new Error(`bid_lots: ${error.message}`);
      return (data ?? []) as { id: string; bid_package_id: string }[];
    },
  });

  const lotCounts: Record<string, number> = {};
  for (const l of lotsQuery.data ?? []) {
    lotCounts[l.bid_package_id] = (lotCounts[l.bid_package_id] ?? 0) + 1;
  }

  const items = (pkgsQuery.data?.rows ?? []).map((r) => ({
    id: r.id,
    packageNo: r.package_no,
    packageName: r.package_name,
    bidPlanNo: r.bid_plans?.plan_no,
    bidPackageType: r.bid_package_type,
    bidPackageStatus: r.bid_package_status,
    totalEstimatedValue: r.total_estimated_value,
    decisionNo: r.decision_no,
    lotCount: lotCounts[r.id] ?? 0,
    procurementMethod: r.procurement_method,
  }));
  const total = pkgsQuery.data?.total ?? 0;
  const isLoading = pkgsQuery.isLoading && items.length === 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trang</p>
<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Gói thầu</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Mỗi gói có thể chia thành nhiều lô • {total} gói
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách gói thầu</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <BidPackageListClient initialData={{ items, total }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
