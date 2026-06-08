"use client";

import { useRouter } from "next/navigation";
import { MovementForm } from "@/features/stock/movement-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default function NewMovementPage() {
  const router = useRouter();
  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ghi stock movement thá»§ cÃ´ng</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          IN/OUT/ADJUST/RETURN. Trigger trong DB sáº½ tá»± cáº­p nháº­t báº£ng stock.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ThÃ´ng tin movement</CardTitle>
        </CardHeader>
        <CardContent>
          <MovementForm onSuccess={() => router.push("/inventory/stock")} onCancel={() => router.back()} />
        </CardContent>
      </Card>
    </div>
  );
}

