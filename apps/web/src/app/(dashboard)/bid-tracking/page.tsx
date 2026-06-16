"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, DollarSign, TrendingUp, Calendar } from "lucide-react";
import {
  useBidContractDashboard,
  useBidContractExpiring,
  BID_ALERT_COLORS,
  BID_ALERT_LABELS,
  formatVND,
} from "@/features/bid-tracking/api";

export default function BidTrackingPage() {
  const { data: dashboard, isLoading: dl } = useBidContractDashboard();
  const { data: expiring, isLoading: el } = useBidContractExpiring();
  const expiringList = Array.isArray(expiring)
    ? expiring
    : (expiring as any)?.items ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">📋 Theo dõi HĐ Thầu</h1>
        <p className="text-muted-foreground mt-1">
          Dashboard + cảnh báo hết hạn 90/60/30 ngày + theo dõi cơ số đã dùng
        </p>
      </div>

      {/* Loading */}
      {dl && (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {/* Dashboard cards */}
      {dashboard && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tổng HĐ</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.totalContracts}</div>
              <p className="text-xs text-muted-foreground">
                {dashboard.activeContracts} đang ACTIVE
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tổng giá trị HĐ</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {formatVND(dashboard.totalContractValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Còn lại: {formatVND(dashboard.totalRemainingValue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">% sử dụng TB</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {(dashboard.avgUsagePercent * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Đã dùng: {formatVND(dashboard.totalUsedValue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sắp hết hạn</CardTitle>
              <Calendar className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {dashboard.expiring30Days}
              </div>
              <p className="text-xs text-muted-foreground">
                HĐ hết hạn trong 30 ngày ({dashboard.expiring60Days} trong 60,{" "}
                {dashboard.expiring90Days} trong 90)
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Expiring contracts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            HĐ sắp hết hạn (90 ngày tới)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {el && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          )}

          {!el && expiringList.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              ✅ Không có HĐ nào sắp hết hạn trong 90 ngày tới
            </p>
          )}

          {!el && expiringList.length > 0 && (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Số HĐ</th>
                    <th className="px-3 py-2 text-left">NCC</th>
                    <th className="px-3 py-2 text-left">Hết hạn</th>
                    <th className="px-3 py-2 text-right">Giá trị</th>
                    <th className="px-3 py-2 text-right">% dùng</th>
                    <th className="px-3 py-2 text-center">Cảnh báo</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringList.map((c) => (
                    <tr key={c.contractId} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">
                        {c.contractNumber}
                      </td>
                      <td className="px-3 py-2">{c.supplierName}</td>
                      <td className="px-3 py-2">
                        {c.endDate}
                        <div className="text-xs text-muted-foreground">
                          {c.daysUntilExpiry < 0
                            ? `Quá ${Math.abs(c.daysUntilExpiry)} ngày`
                            : `Còn ${c.daysUntilExpiry} ngày`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatVND(c.totalContractValue)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-medium">
                          {(c.usagePercent * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={BID_ALERT_COLORS[c.alertLevel]}>
                          {BID_ALERT_LABELS[c.alertLevel]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
