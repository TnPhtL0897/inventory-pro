"use client";

import { useLotAlerts, useResolveAlert } from "./api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Bell } from "lucide-react";
import {
  ALERT_LEVEL_COLORS,
  type LotAlertLevel,
} from "@inventorypro/shared-types";

export function LotAlertsDashboard() {
  const { data: alerts, isLoading } = useLotAlerts({ limit: 30 });
  const resolve = useResolveAlert();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">Đang tải cảnh báo...</CardContent>
      </Card>
    );
  }

  const items = alerts ?? [];
  const critical = items.filter((a: any) => a.alertLevel === "CRITICAL");
  const warning = items.filter((a: any) => a.alertLevel === "WARNING");
  const info = items.filter((a: any) => a.alertLevel === "INFO");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Cảnh báo ({items.length})
          {critical.length > 0 && (
            <Badge className="bg-red-100 text-red-800">{critical.length} nghiêm trọng</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            ✅ Không có cảnh báo nào
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((a: any) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-md border bg-card p-3"
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <AlertTriangle
                    className={`h-4 w-4 mt-0.5 ${
                      a.alertLevel === "CRITICAL"
                        ? "text-red-600"
                        : a.alertLevel === "WARNING"
                          ? "text-amber-600"
                          : "text-blue-600"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={ALERT_LEVEL_COLORS[a.alertLevel as LotAlertLevel]}>
                        {a.alertLevel}
                      </Badge>
                      <code className="text-xs">{a.lot?.lotNumber}</code>
                      <span className="text-xs text-muted-foreground">{a.lot?.product?.name}</span>
                    </div>
                    <p className="text-sm mt-1">{a.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(a.createdAt).toLocaleString("vi-VN")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resolve.mutate(a.id)}
                  disabled={resolve.isPending}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
