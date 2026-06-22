"use client";

import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { WeeklyDetailPage } from "@/features/replenishment-weekly/weekly-detail-page";

export const dynamic = "force-dynamic";

export default function WeeklyReplenishmentDetailRoute() {
  const params = useParams();
  const id = params?.id as string;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <WeeklyDetailPage runId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
