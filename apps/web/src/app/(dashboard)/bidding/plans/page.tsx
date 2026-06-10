"use client";

// Client component - fetch bid plans + per-plan package counts via PostgREST
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listTable } from "@/lib/data-access";
import { BidPlanListClient } from "./list-client";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

interface BidPlanRow {
  id: string;
  planNo: string;
  fiscalYear: number;
  title: string;
  totalEstimatedValue: number | null;
  status: string;
  createdAt: string;
}

export default function BidPlansPage() {
  // 1) fetch all plans
  const plansQuery = useQuery({
    queryKey: ["bid-plans", "page"],
    queryFn: () =>
      listTable<BidPlanRow>("bid_plans", {
        pageSize: 100,
        orderBy: "created_at",
        orderDesc: true,
      }),
  });

  // 2) fetch all packages (small list) to compute packageCount per plan
  const packagesQuery = useQuery({
    queryKey: ["bid-packages", "all-for-counts"],
    queryFn: () =>
      listTable<{ id: string; bidPlanId: string | null }>("bid_packages", {
        pageSize: 1000,
        select: "id,bid_plan_id",
      }),
  });

  // 3) compute packageCount per planId
  const packageCounts: Record<string, number> = {};
  for (const p of packagesQuery.data?.items ?? []) {
    if (p.bidPlanId) {
      packageCounts[p.bidPlanId] = (packageCounts[p.bidPlanId] ?? 0) + 1;
    }
  }

  const plans = (plansQuery.data?.items ?? []).map((p) => ({
    id: p.id,
    planNo: p.planNo,
    fiscalYear: p.fiscalYear,
    title: p.title,
    totalEstimatedValue: p.totalEstimatedValue,
    status: p.status,
    packageCount: packageCounts[p.id] ?? 0,
    createdAt: p.createdAt,
  }));
  const total = plansQuery.data?.total ?? 0;
  const isLoading = plansQuery.isLoading && plans.length === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Kế hoạch đấu thầu</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            KHĐT năm - gom các gói thầu dự kiến trong năm • <strong>{total}</strong> KHĐT
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách KHĐT</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <BidPlanListClient initialData={{ items: plans, total }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
