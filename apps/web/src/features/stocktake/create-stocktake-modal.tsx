"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateStockTake } from "./api";
import { sb } from "@/lib/data-access";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ProductGroup } from "@inventorypro/shared-types";
import { Info } from "lucide-react";

interface CreateStockTakeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProductGroup?: ProductGroup;
}

export function CreateStockTakeModal({
  open,
  onOpenChange,
  defaultProductGroup,
}: CreateStockTakeModalProps) {
  const router = useRouter();
  const [productGroup, setProductGroup] = useState<ProductGroup>(
    defaultProductGroup ?? "HOA_CHAT_SINH_PHAM"
  );
  const now = new Date();
  const [periodYear, setPeriodYear] = useState<number>(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number>(now.getMonth() + 1);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const createMutation = useCreateStockTake();

  // Lấy current user id một lần khi modal mở
  useEffect(() => {
    if (open && !currentUserId) {
      sb().auth.getUser().then(({ data }) => {
        if (data.user?.id) setCurrentUserId(data.user.id);
      });
    }
  }, [open, currentUserId]);

  // Reset default khi đổi productGroup tab
  useEffect(() => {
    if (defaultProductGroup) setProductGroup(defaultProductGroup);
  }, [defaultProductGroup]);

  const handleCreate = async () => {
    if (!currentUserId) return;
    const stockTakeId = await createMutation.mutateAsync({
      productGroup,
      periodYear,
      periodMonth,
      assignedTo: currentUserId,
    });
    if (stockTakeId) {
      onOpenChange(false);
      router.push(`/stocktake/${stockTakeId}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo đợt kiểm kê tháng</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ tự động snapshot tồn kho từ các lô hiện có. Idempotent — nếu đã có
            đợt cho kỳ này sẽ trả về đợt cũ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Quy trình Khoa XN: 1 thủ kho kiểm cả 2 kho (BULK + DAILY) cùng mảng.
              Trưởng khoa sẽ duyệt trước khi cập nhật tồn kho.
            </AlertDescription>
          </Alert>

          <div>
            <Label>Mảng nghiệp vụ</Label>
            <Select
              value={productGroup}
              onValueChange={(v) => setProductGroup(v as ProductGroup)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HOA_CHAT_SINH_PHAM">
                  Hóa chất - Sinh phẩm
                </SelectItem>
                <SelectItem value="VAT_TU_Y_TE">Vật tư y tế</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tháng</Label>
              <Select
                value={String(periodMonth)}
                onValueChange={(v) => setPeriodMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      Tháng {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Năm</Label>
              <Input
                type="number"
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
                min={2020}
                max={2100}
              />
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Đợt sẽ được gán cho tài khoản hiện tại. Trưởng khoa có thể reassign sau.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !currentUserId}
          >
            {createMutation.isPending ? "Đang tạo..." : "Tạo đợt kiểm kê"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
