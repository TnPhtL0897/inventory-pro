"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Package,
} from "lucide-react";
import {
  useFefoComplianceReport,
  FEFO_AUDIT_LEVEL_COLORS,
  FEFO_AUDIT_LEVEL_LABELS,
  type FefoAuditLevel,
} from "@/features/fefo/api";

const MONTHS = [
  { value: 1, label: "Tháng 1" },
  { value: 2, label: "Tháng 2" },
  { value: 3, label: "Tháng 3" },
  { value: 4, label: "Tháng 4" },
  { value: 5, label: "Tháng 5" },
  { value: 6, label: "Tháng 6" },
  { value: 7, label: "Tháng 7" },
  { value: 8, label: "Tháng 8" },
  { value: 9, label: "Tháng 9" },
  { value: 10, label: "Tháng 10" },
  { value: 11, label: "Tháng 11" },
  { value: 12, label: "Tháng 12" },
];

export default function FefoReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: report, isLoading, error } = useFefoComplianceReport({
    year,
    month,
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            📊 Báo cáo FEFO Compliance
          </h1>
          <p className="text-muted-foreground mt-1">
            Theo dõi tỷ lệ tuân thủ quy tắc FEFO (First-Expire-First-Out) trong khoa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(month)}
            onValueChange={(v) => setMonth(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">❌ Lỗi tải báo cáo: {String(error)}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      {report && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng xuất</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.totalPicks}</div>
                <p className="text-xs text-muted-foreground">lượt pick trong tháng</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tuân thủ FEFO</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {report.compliantPicks}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold">
                    {(report.complianceRate * 100).toFixed(1)}%
                  </span>{" "}
                  tổng số
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Override</CardTitle>
                <TrendingDown className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {report.overridePicks}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold">
                    {(report.overrideRate * 100).toFixed(1)}%
                  </span>{" "}
                  có lý do
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Dùng lô hết hạn</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {report.expiredPicks}
                </div>
                <p className="text-xs text-muted-foreground">
                  CRITICAL — cần điều tra
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top overridden products */}
          {report.topOverriddenProducts && report.topOverriddenProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  📦 Top sản phẩm hay bị override
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.topOverriddenProducts.map((p, i) => (
                    <div
                      key={p.productId}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-muted-foreground w-6">
                          #{i + 1}
                        </div>
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.sku}</div>
                        </div>
                      </div>
                      <Badge variant="outline">{p.overrideCount} lần</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top override users */}
          {report.topOverrideUsers && report.topOverrideUsers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  👥 Top thủ kho hay override
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.topOverrideUsers.map((u, i) => (
                    <div
                      key={u.userId}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-muted-foreground w-6">
                          #{i + 1}
                        </div>
                        <div className="font-medium">{u.email ?? u.userId}</div>
                      </div>
                      <Badge variant="outline">{u.overrideCount} lần</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top reasons */}
          {report.topOverrideReasons && report.topOverrideReasons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  💬 Top lý do override
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.topOverrideReasons.map((r) => (
                    <div
                      key={r.overrideReason}
                      className="flex items-center justify-between border-b pb-2 last:border-0"
                    >
                      <div className="font-medium">{r.overrideReason}</div>
                      <Badge variant="outline">{r.reasonCount} lần</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {report.totalPicks === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                📭 Chưa có lượt pick nào trong tháng {month}/{year}.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
