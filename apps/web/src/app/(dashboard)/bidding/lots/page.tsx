"use client";

// Client component - fetch bid lots + joins (package no, bidder, contract no) via PostgREST
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sb } from "@/lib/data-access";
import { BidLotListClient } from "./list-client";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

interface BidLotRow {
  id: string;
  lot_no: string;
  lot_name: string;
  bid_package_id: string;
  bid_lot_status: string;
  product_category: string | null;
  estimated_value: number | null;
  quantity_total: number | null;
  unit: string | null;
  awarded_bidder_id: string | null;
  awarded_value: number | null;
  awarded_date: string | null;
  contract_id: string | null;
  // embedded (snake_case from PostgREST, deepMap converts)
  bid_packages: { package_no: string } | null;
  parties: { name: string } | null;             // via awarded_bidder_id
  bid_contracts: { contract_no: string } | null; // via contract_id
}

export default function BidLotsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["bid-lots", "page"],
    queryFn: async () => {
      const { data: rows, count, error } = await sb()
        .from("bid_lots")
        .select(
          "id,lot_no,lot_name,bid_package_id,bid_lot_status,product_category," +
            "estimated_value,quantity_total,unit,awarded_bidder_id,awarded_value," +
            "awarded_date,contract_id," +
            "bid_packages(package_no)," +
            "parties:awarded_bidder_id(name)," +
            "bid_contracts:contract_id(contract_no)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(0, 99);
      if (error) throw new Error(`bid_lots: ${error.message}`);
      return { rows: (rows ?? []) as unknown as BidLotRow[], total: count ?? 0 };
    },
  });

  const items = (data?.rows ?? []).map((r) => ({
    id: r.id,
    lotNo: r.lot_no,
    lotName: r.lot_name,
    bidPackageNo: r.bid_packages?.package_no,
    bidLotStatus: r.bid_lot_status,
    productCategory: r.product_category,
    estimatedValue: r.estimated_value,
    quantityTotal: r.quantity_total,
    unit: r.unit,
    awardedBidderName: r.parties?.name,
    awardedValue: r.awarded_value,
    awardedDate: r.awarded_date,
    contractNo: r.bid_contracts?.contract_no,
  }));
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Lô / Phần thầu</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Mỗi lô thầu có thể trúng 1 nhà thầu riêng • <strong>{total}</strong> lô
          </p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách lô thầu</CardTitle></CardHeader>
        <CardContent>
          {isLoading && items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <BidLotListClient initialData={{ items, total }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
