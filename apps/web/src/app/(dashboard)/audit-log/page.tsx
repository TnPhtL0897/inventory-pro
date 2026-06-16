"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  History,
  Download,
  Search,
} from "lucide-react";
import {
  useAuditLog,
  AUDITED_TABLES,
  OPERATION_COLORS,
  OPERATION_LABELS,
  type AuditLogEntry,
  type AuditOperation,
} from "@/features/audit-log/api";

export default function AuditLogPage() {
  const [tableName, setTableName] = useState<string>("all");
  const [operation, setOperation] = useState<string>("all");
  const [userEmail, setUserEmail] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useAuditLog({
    tableName: tableName === "all" ? undefined : tableName,
    operation: operation === "all" ? undefined : (operation as AuditOperation),
    userId: undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    page,
    pageSize: 50,
  });

  const items = data?.items ?? [];

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-7 w-7" />
            Audit Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Tra cứu lịch sử thao tác INSERT/UPDATE/DELETE (lưu 5 năm theo TT54)
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Xuất Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <Label htmlFor="filter-table">Bảng</Label>
              <Select value={tableName} onValueChange={setTableName}>
                <SelectTrigger id="filter-table">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {AUDITED_TABLES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-op">Thao tác</Label>
              <Select value={operation} onValueChange={setOperation}>
                <SelectTrigger id="filter-op">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="INSERT">Thêm mới</SelectItem>
                  <SelectItem value="UPDATE">Cập nhật</SelectItem>
                  <SelectItem value="DELETE">Xóa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-from">Từ ngày</Label>
              <Input
                id="filter-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="filter-to">Đến ngày</Label>
              <Input
                id="filter-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="filter-user">User email</Label>
              <Input
                id="filter-user"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="vd: nguyen.a@khoaxn.vn"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            📜 Kết quả ({items.length} bản ghi)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              📭 Không có bản ghi nào khớp filter
            </p>
          )}

          {!isLoading && items.length > 0 && (
            <div className="space-y-1">
              {items.map((entry) => (
                <AuditLogRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedIds.has(entry.id)}
                  onToggle={() => toggleExpand(entry.id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {items.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Trang {page}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  ← Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={items.length < 50}
                  onClick={() => setPage(page + 1)}
                >
                  Sau →
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditLogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border rounded-md">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Badge className={OPERATION_COLORS[entry.operation]}>
          {OPERATION_LABELS[entry.operation]}
        </Badge>
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {entry.tableName}
        </code>
        <div className="flex-1 text-sm text-muted-foreground">
          {entry.changedByEmail ?? entry.changedBy ?? "(system)"} ·{" "}
          {new Date(entry.createdAt).toLocaleString("vi-VN")}
        </div>
        {entry.changedFields && entry.changedFields.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {entry.changedFields.length} trường thay đổi
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-3 space-y-3">
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-semibold mb-1">📤 Old data:</div>
              <pre className="bg-background p-2 rounded overflow-x-auto max-h-40">
                {entry.oldData
                  ? JSON.stringify(entry.oldData, null, 2)
                  : "(INSERT - không có)"}
              </pre>
            </div>
            <div>
              <div className="font-semibold mb-1">📥 New data:</div>
              <pre className="bg-background p-2 rounded overflow-x-auto max-h-40">
                {entry.newData
                  ? JSON.stringify(entry.newData, null, 2)
                  : "(DELETE - không có)"}
              </pre>
            </div>
          </div>
          {entry.changedFields && entry.changedFields.length > 0 && (
            <div className="text-xs">
              <span className="font-semibold">Trường thay đổi: </span>
              {entry.changedFields.map((f) => (
                <code
                  key={f}
                  className="bg-background px-1.5 py-0.5 rounded mr-1"
                >
                  {f}
                </code>
              ))}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Record ID: {entry.recordId}
          </div>
        </div>
      )}
    </div>
  );
}
