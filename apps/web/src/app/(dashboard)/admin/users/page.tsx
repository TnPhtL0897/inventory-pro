"use client";

// Admin — User management + role assignment
// Route: /admin/users
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserTable } from "@/features/admin/user-table";
import { Users } from "lucide-react";

// Force dynamic rendering - skip static gen (Cloudflare Pages edge)
export const dynamic = "force-dynamic";

export const runtime = "edge";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 sm:h-8 sm:w-8" />
            Quản lý người dùng
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Khoa XN — gán role thủ kho + Trưởng khoa + KTV QC
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách user trong tenant</CardTitle>
        </CardHeader>
        <CardContent>
          <UserTable />
        </CardContent>
      </Card>

      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        <h3 className="font-medium mb-2">💡 Hướng dẫn</h3>
        <ul className="space-y-1 text-muted-foreground list-disc pl-5">
          <li>
            <strong>Thủ kho BULK_HC_SP / DAILY_HC_SP</strong>: phụ trách kho chẵn/lẻ Hóa chất - Sinh phẩm
          </li>
          <li>
            <strong>Thủ kho BULK_VTYT / DAILY_VTYT</strong>: phụ trách kho chẵn/lẻ Vật tư y tế
          </li>
          <li>
            <strong>QC_OFFICER</strong>: KTV xét nghiệm, duyệt QC cho lô HC-SP
          </li>
          <li>
            <strong>DEPT_HEAD</strong>: Trưởng khoa, duyệt chênh lệch kiểm kê, đề nghị đấu thầu
          </li>
          <li>1 user có thể có nhiều role ở nhiều chi nhánh (vd: cover ca)</li>
          <li>
            Sau khi gán role, user cần <strong>logout/login</strong> để JWT claim cập nhật
          </li>
        </ul>
      </div>
    </div>
  );
}
