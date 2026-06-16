"use client";

/**
 * InviteUserDialog - Form tạo tài khoản mới
 * Gọi Edge Function invite-user
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, UserPlus, Copy, CheckCircle2 } from "lucide-react";
import { callActionNoId } from "@/lib/data-access";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface InviteUserRequest {
  email: string;
  full_name: string;
  phone?: string;
  global_role_codes?: string[];
  warehouse_roles?: Array<{ role_code: string; branch_id: string }>;
}

interface InviteUserResponse {
  success: boolean;
  user_id: string;
  email: string;
  full_name: string;
  temp_password: string;
  message: string;
}

const GLOBAL_ROLES = [
  { code: "ADMIN", label: "Admin hệ thống" },
  { code: "DEPT_HEAD", label: "Trưởng khoa" },
  { code: "QC_OFFICER", label: "KTV xét nghiệm (QC)" },
];

const WAREHOUSE_ROLES = [
  { code: "KEEPER_BULK_HC_SP", label: "Thủ kho chẵn HC-SP" },
  { code: "KEEPER_DAILY_HC_SP", label: "Thủ kho lẻ HC-SP" },
  { code: "KEEPER_BULK_VTYT", label: "Thủ kho chẵn VTYT" },
  { code: "KEEPER_DAILY_VTYT", label: "Thủ kho lẻ VTYT" },
];

const DEFAULT_BRANCH_ID = "00000000-0000-0000-0000-000000000002"; // TODO: cho user chọn branch

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedGlobalRoles, setSelectedGlobalRoles] = useState<string[]>([]);
  const [selectedWarehouseRoles, setSelectedWarehouseRoles] = useState<string[]>([]);
  const [result, setResult] = useState<InviteUserResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const qc = useQueryClient();

  const inviteMutation = useMutation({
    mutationFn: (req: InviteUserRequest) =>
      callActionNoId<InviteUserResponse>("invite-user", "invite", req),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Đã tạo user ${data.email}`);
    },
    onError: (e: Error) =>
      toast.error("Lỗi tạo user", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!email || !fullName) {
      toast.error("Vui lòng nhập email + họ tên");
      return;
    }

    if (selectedGlobalRoles.length === 0 && selectedWarehouseRoles.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 role");
      return;
    }

    inviteMutation.mutate({
      email,
      full_name: fullName,
      phone: phone || undefined,
      global_role_codes: selectedGlobalRoles,
      warehouse_roles: selectedWarehouseRoles.map((code) => ({
        role_code: code,
        branch_id: DEFAULT_BRANCH_ID,
      })),
    });
  };

  const handleReset = () => {
    setEmail("");
    setFullName("");
    setPhone("");
    setSelectedGlobalRoles([]);
    setSelectedWarehouseRoles([]);
    setResult(null);
    setCopied(false);
  };

  const toggleGlobalRole = (code: string) => {
    setSelectedGlobalRoles((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleWarehouseRole = (code: string) => {
    setSelectedWarehouseRoles((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const copyPassword = () => {
    if (result?.temp_password) {
      navigator.clipboard.writeText(result.temp_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleReset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Cấp tài khoản mới
          </DialogTitle>
          <DialogDescription>
            Tạo user + gán role. User sẽ nhận mật khẩu tạm và phải đổi khi đăng nhập lần đầu.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="invite-email">Email *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nguyenvana@khoaxn.vn"
                />
              </div>
              <div>
                <Label htmlFor="invite-phone">SĐT</Label>
                <Input
                  id="invite-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0292-xxx-xxx"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="invite-name">Họ tên *</Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
              />
            </div>

            {/* Global roles */}
            <div>
              <Label className="text-sm font-semibold">🌐 Global role (toàn hệ thống)</Label>
              <div className="mt-2 space-y-2 rounded-md border p-3">
                {GLOBAL_ROLES.map((r) => (
                  <div key={r.code} className="flex items-center space-x-2">
                    <Checkbox
                      id={`gr-${r.code}`}
                      checked={selectedGlobalRoles.includes(r.code)}
                      onCheckedChange={() => toggleGlobalRole(r.code)}
                    />
                    <label
                      htmlFor={`gr-${r.code}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {r.label}{" "}
                      <code className="text-xs text-muted-foreground">({r.code})</code>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Warehouse roles */}
            <div>
              <Label className="text-sm font-semibold">🏢 Warehouse role (theo kho)</Label>
              <div className="mt-2 space-y-2 rounded-md border p-3">
                {WAREHOUSE_ROLES.map((r) => (
                  <div key={r.code} className="flex items-center space-x-2">
                    <Checkbox
                      id={`wr-${r.code}`}
                      checked={selectedWarehouseRoles.includes(r.code)}
                      onCheckedChange={() => toggleWarehouseRole(r.code)}
                    />
                    <label
                      htmlFor={`wr-${r.code}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {r.label}{" "}
                      <code className="text-xs text-muted-foreground">({r.code})</code>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmit} disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Tạo tài khoản
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // ============== Success result ==============
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Tạo tài khoản thành công!</AlertTitle>
              <AlertDescription>
                User <strong>{result.email}</strong> đã được tạo.
              </AlertDescription>
            </Alert>

            <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
              <div>
                <strong>User ID:</strong>{" "}
                <code className="text-xs">{result.user_id}</code>
              </div>
              <div>
                <strong>Họ tên:</strong> {result.full_name}
              </div>
              <div>
                <strong>Email:</strong> {result.email}
              </div>
              <div>
                <strong>Mật khẩu tạm:</strong>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 bg-background px-2 py-1 rounded border">
                    {result.temp_password}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyPassword}>
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ⚠️ Gửi mật khẩu này cho user (qua SMS/email nội bộ). User phải đổi khi login lần đầu.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  handleReset();
                  onSuccess?.();
                }}
              >
                Tạo user khác
              </Button>
              <Button
                onClick={() => {
                  onSuccess?.();
                  onOpenChange(false);
                }}
              >
                Xong
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
