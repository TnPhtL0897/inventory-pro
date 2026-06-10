import { ImportStockSnapshotClient } from "@/features/stock/import-stock-snapshot-client";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default function ImportStockSnapshotPage() {
  return <ImportStockSnapshotClient />;
}
