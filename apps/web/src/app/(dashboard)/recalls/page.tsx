"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ShieldAlert, CheckCircle2, XCircle, FileText, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listTable } from "@/lib/data-access";

interface RecallNotice {
  id: string;
  recallNumber: string;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recallDate: string;
  status: "ACTIVE" | "RESOLVED" | "CLOSED";
  affectedLotNumbers: string[];
  affectedLotsCount: number;
  blockedLotsCount: number;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
}

const SEVERITY_COLORS: Record<RecallNotice["severity"], string> = {
  LOW: "bg-blue-100 text-blue-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const SEVERITY_LABELS: Record<RecallNotice["severity"], string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

const STATUS_COLORS: Record<RecallNotice["status"], string> = {
  ACTIVE: "bg-red-100 text-red-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

const STATUS_LABELS: Record<RecallNotice["status"], string> = {
  ACTIVE: "Đang xử lý",
  RESOLVED: "Đã giải quyết",
  CLOSED: "Đã đóng",
};

export default function RecallsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["recall-notices"],
    queryFn: () => listTable<RecallNotice>("recall_notices", { pageSize: 50 }),
  });

  const items: RecallNotice[] = (data as any)?.items ?? (Array.isArray(data) ? data : []);
  const active = items.filter((i) => i.status === "ACTIVE");
  const resolved = items.filter((i) => i.status === "RESOLVED");
  const critical = active.filter((i) => i.severity === "CRITICAL");

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-red-600" />
            Quản lý Recall
          </h1>
          <p className="text-muted-foreground mt-1">
            Theo dõi lô bị NCC thu hồi + auto-block lô matching lot_number
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Tạo recall mới
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Đang xử lý</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{active.length}</div>
            <p className="text-xs text-muted-foreground">
              Recall đang cần xử lý
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CRITICAL</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{critical.length}</div>
            <p className="text-xs text-muted-foreground">
              Severity CRITICAL — cần xử lý ngay
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Đã giải quyết</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolved.length}</div>
            <p className="text-xs text-muted-foreground">
              Recall đã hoàn tất
            </p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📋 Danh sách recall</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              ✅ Không có recall nào
            </p>
          )}

          {!isLoading && items.length > 0 && (
            <div className="space-y-2">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Badge className={SEVERITY_COLORS[r.severity]}>
                      {SEVERITY_LABELS[r.severity]}
                    </Badge>
                    <Badge className={STATUS_COLORS[r.status]}>
                      {STATUS_LABELS[r.status]}
                    </Badge>
                    <div>
                      <div className="font-medium">
                        <FileText className="inline h-3 w-3 mr-1" />
                        {r.recallNumber}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.reason} · Ngày: {r.recallDate}
                      </div>
                      {r.affectedLotNumbers && r.affectedLotNumbers.length > 0 && (
                        <div className="text-xs text-red-600 mt-1">
                          {r.affectedLotNumbers.length} lô ảnh hưởng:{" "}
                          {r.affectedLotNumbers.slice(0, 3).join(", ")}
                          {r.affectedLotNumbers.length > 3 && " ..."}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {r.blockedLotsCount ?? 0} lô đã BLOCK
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
