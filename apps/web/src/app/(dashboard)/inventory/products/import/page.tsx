import { ImportProductsClient } from "@/features/products/import-products-client";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default function ImportProductsPage() {
  return <ImportProductsClient />;
}
