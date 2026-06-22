"use client";

// Admin — User management + role assignment
// Route: /admin/users
// Features: list users + assign role + cấp tài khoản mới
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserTable } from "@/features/admin/user-table";
import { InviteUserDialog } from "@/features/admin/invite-user-dialog";
import { Users, UserPlus, ShieldCheck } from "lucide-react";
import { useState } from "react";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 sm:h-8 sm:h-8" />
            Quản lý người dùng
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Khoa XN — cấp tài khoản + gán role thủ kho + Trưởng khoa + KTV QC
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} size="lg" className="shrink-0">
          <UserPlus className="mr-2 h-4 w-4" />
          Cấp tài khoản mới
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Danh sách user trong tenant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UserTable />
        </CardContent>
      </Card>

      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        <h3 className="font-medium mb-2">💡 Hướng dẫn phân quyền</h3>
        <ul className="space-y-1 text-muted-foreground list-disc pl-5">
          <li>
            <strong>Global role</strong>: áp dụng toàn hệ thống (Admin / Trưởng khoa / QC_OFFICER)
          </li>
          <li>
            <strong>Warehouse role</strong>: áp dụng cho 1 kho cụ thể (BULK/DAILY × HC-SP/VTYT)
          </li>
          <li>
            <strong>Thủ kho BULK_HC_SP / DAILY_HC_SP</strong>: phụ trách kho chẵn/lẻ Hóa chất - Sinh phẩm
          </li>
          <li>
            <strong>Thủ kho BULK_VTYT / DAILY_VTYT</strong>: phụ trách kho chẵn/lẻ Vật tư y tế
          </li>
          <li>
            <strong>QC_OFFICER</strong>: KTV xét nghiệm, duyệt QC cho lô HC-SP, mở nắp
          </li>
          <li>
            <strong>DEPT_HEAD</strong>: Trưởng khoa, duyệt chênh lệch kiểm kê, đề nghị đấu thầu
          </li>
          <li>1 user có thể có nhiều role ở nhiều chi nhánh (vd: cover ca)</li>
          <li>
            Sau khi gán role, user cần <strong>logout/login</strong> để JWT claim cập nhật
          </li>
          <li>
            Mọi thay đổi role được ghi vào <code>audit_log</code> (xem tại{" "}
            <a href="/audit-log" className="underline">/audit-log</a>)
          </li>
        </ul>
      </div>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={() => {
          // Refresh user list
        }}
      />
    </div>
  );
}
