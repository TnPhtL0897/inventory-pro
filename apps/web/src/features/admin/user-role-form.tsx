"use client";

import { useState, useEffect } from "react";
import {
  useAllRoles,
  useAllBranches,
  useAssignUserRole,
  ROLE_CODE_LABELS,
  roleCodeToProductGroup,
} from "./api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function UserRoleAssignModal({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: roles, isLoading: loadingRoles } = useAllRoles();
  const { data: branches, isLoading: loadingBranches } = useAllBranches();
  const assign = useAssignUserRole();

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  // Reset khi mở modal
  useEffect(() => {
    if (open) {
      setSelectedRoleId("");
      setSelectedBranchId("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedRoleId || !selectedBranchId) return;
    await assign.mutateAsync({
      userId,
      roleId: selectedRoleId,
      branchId: selectedBranchId,
    });
    onOpenChange(false);
  };

  const selectedRole = roles?.find((r) => r.id === selectedRoleId);
  const selectedRoleCode = selectedRole?.code ?? "";
  const selectedRolePg = roleCodeToProductGroup(selectedRoleCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gán role cho user</DialogTitle>
          <DialogDescription>
            Chọn role và chi nhánh. 1 user có thể có nhiều role ở nhiều chi nhánh.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Role select */}
          <div>
            <Label htmlFor="role-select">Role</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger id="role-select" className="mt-1">
                <SelectValue placeholder={loadingRoles ? "Đang tải..." : "Chọn role..."} />
              </SelectTrigger>
              <SelectContent>
                {roles?.map((r) => {
                  const pg = roleCodeToProductGroup(r.code);
                  return (
                    <SelectItem key={r.id} value={r.id}>
                      <div className="flex items-center gap-2">
                        <span>{ROLE_CODE_LABELS[r.code] ?? r.name}</span>
                        {pg && (
                          <Badge variant="outline" className="text-xs">
                            {pg === "HOA_CHAT_SINH_PHAM" ? "HC-SP" : "VTYT"}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedRole && (
              <p className="text-xs text-muted-foreground mt-1">
                Role type: <strong>{selectedRole.roleType}</strong> • Code:{" "}
                <code>{selectedRole.code}</code>
                {selectedRolePg && ` • Mảng: ${selectedRolePg === "HOA_CHAT_SINH_PHAM" ? "Hóa chất - Sinh phẩm" : "Vật tư y tế"}`}
              </p>
            )}
          </div>

          {/* Branch select */}
          <div>
            <Label htmlFor="branch-select">Chi nhánh</Label>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger id="branch-select" className="mt-1">
                <SelectValue
                  placeholder={loadingBranches ? "Đang tải..." : "Chọn chi nhánh..."}
                />
              </SelectTrigger>
              <SelectContent>
                {branches?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Khoa XN: thường chỉ có 1 chi nhánh BV Trường ĐHYD Cần Thơ.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedRoleId || !selectedBranchId || assign.isPending}
          >
            {assign.isPending ? "Đang lưu..." : "Gán role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
