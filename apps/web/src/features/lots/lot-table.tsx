"use client";

import { useState } from "react";
import {
  useLots,
  useResolveAlert,
  type LotListParams,
} from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LOT_STATUS_LABELS,
  LOT_STATUS_COLORS,
  type LotStatus,
  type ProductGroup,
  ALERT_LEVEL_COLORS,
  type LotAlertLevel,
} from "@inventorypro/shared-types";
import { Search, AlertTriangle, Check, X, FlaskConical, Syringe } from "lucide-react";
import { LotQCModal } from "./lot-qc-modal";
import { LotOpenVialModal } from "./lot-open-vial-modal";

export function LotTable({
  productGroup,
  initialStatus,
}: {
  productGroup?: ProductGroup | "";
  initialStatus?: LotStatus;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LotStatus | "">(initialStatus ?? "");
  const [expiringDays, setExpiringDays] = useState<number | undefined>(undefined);

  // Modal states
  const [qcLotId, setQcLotId] = useState<string | null>(null);
  const [openVialLotId, setOpenVialLotId] = useState<string | null>(null);

  const params: LotListParams = {
    productGroup: productGroup || undefined,
    status: (status as LotStatus) || undefined,
    expiringWithin: expiringDays,
    search: search || undefined,
    limit: 50,
    offset: (page - 1) * 50,
  };

  const { data, isLoading } = useLots(params);
  const items = data ?? [];
  const total = items.length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo số lô..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus((v as LotStatus) || "")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả trạng thái</SelectItem>
            {(Object.keys(LOT_STATUS_LABELS) as LotStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {LOT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={expiringDays?.toString() ?? ""}
          onValueChange={(v) => setExpiringDays(v ? Number(v) : undefined)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Hạn sử dụng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            <SelectItem value="7">Sắp hết hạn 7 ngày</SelectItem>
            <SelectItem value="15">Trong 15 ngày</SelectItem>
            <SelectItem value="30">Trong 30 ngày</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          Hiển thị: <strong>{total}</strong> lô
        </div>
      </div>

      {isLoading && items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
      )}

      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            Không có lô nào phù hợp
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((lot: any) => {
          const isHCSP = lot.product?.productGroup === "HOA_CHAT_SINH_PHAM";
          const needsQC = lot.status === "PENDING_QC" || lot.status === "IN_QC";
          const canOpenVial =
            isHCSP && (lot.status === "APPROVED" || lot.status === "IN_USE");
          const expDays = lot.expirationDate
            ? Math.floor(
                (new Date(lot.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              )
            : 999;
          const expLevel: LotAlertLevel =
            expDays < 0
              ? "CRITICAL"
              : expDays <= 7
                ? "CRITICAL"
                : expDays <= 15
                  ? "WARNING"
                  : expDays <= 30
                    ? "INFO"
                    : "INFO";

          return (
            <Card key={lot.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold font-mono">{lot.lotNumber}</h3>
                      <Badge className={LOT_STATUS_COLORS[lot.status as LotStatus]}>
                        {LOT_STATUS_LABELS[lot.status as LotStatus]}
                      </Badge>
                      {lot.recallNoticeId && (
                        <Badge className="bg-purple-100 text-purple-800">Recall</Badge>
                      )}
                      {expDays <= 30 && expDays >= 0 && (
                        <Badge className={ALERT_LEVEL_COLORS[expLevel]}>
                          {expDays === 0
                            ? "Hết hạn hôm nay"
                            : `Còn ${expDays} ngày`}
                        </Badge>
                      )}
                      {expDays < 0 && (
                        <Badge className="bg-red-100 text-red-800">
                          Quá hạn {Math.abs(expDays)} ngày
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm">
                      <strong>{lot.product?.name ?? "—"}</strong> ({lot.product?.sku})
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                      <span>Kho: {lot.warehouse?.name ?? "—"}</span>
                      <span>Tồn: {lot.quantity}</span>
                      <span>HSD: {new Date(lot.expirationDate).toLocaleDateString("vi-VN")}</span>
                      {lot.openVialExpirationDate && (
                        <span className="text-amber-600">
                          Open-vial HSD: {new Date(lot.openVialExpirationDate).toLocaleDateString("vi-VN")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {needsQC && (
                      <Button size="sm" variant="default" onClick={() => setQcLotId(lot.id)}>
                        <FlaskConical className="h-4 w-4 mr-1" />
                        QC
                      </Button>
                    )}
                    {canOpenVial && (
                      <Button size="sm" variant="outline" onClick={() => setOpenVialLotId(lot.id)}>
                        <Syringe className="h-4 w-4 mr-1" />
                        Mở nắp
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pagination */}
      {total >= 50 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Trước
          </Button>
          <span className="text-sm text-muted-foreground self-center">Trang {page}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={items.length < 50}
          >
            Sau
          </Button>
        </div>
      )}

      {/* Modals */}
      {qcLotId && <LotQCModal lotId={qcLotId} open={!!qcLotId} onOpenChange={(o) => !o && setQcLotId(null)} />}
      {openVialLotId && (
        <LotOpenVialModal
          lotId={openVialLotId}
          open={!!openVialLotId}
          onOpenChange={(o) => !o && setOpenVialLotId(null)}
        />
      )}
    </div>
  );
}
