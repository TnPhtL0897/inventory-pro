"use client";

import { useState } from "react";
import {
  useUsers,
  useUserRoles,
  useRemoveUserRole,
  ROLE_CODE_LABELS,
  ROLE_CODE_COLORS,
  roleCodeToProductGroup,
} from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, UserCog, Mail, Clock, Building2 } from "lucide-react";
import { UserRoleAssignModal } from "./user-role-form";

export function UserTable() {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const { data, isLoading } = useUsers({ search });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên hoặc email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Tổng: <strong>{total}</strong> user
        </div>
      </div>

      {/* Loading */}
      {isLoading && items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
      )}

      {/* Empty */}
      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            Không có user nào
          </CardContent>
        </Card>
      )}

      {/* User list */}
      <div className="grid gap-3">
        {items.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            expanded={selectedUserId === u.id}
            onToggle={() => setSelectedUserId(selectedUserId === u.id ? null : u.id)}
            onAssign={() => {
              setSelectedUserId(u.id);
              setAssignOpen(true);
            }}
          />
        ))}
      </div>

      {selectedUserId && (
        <UserRoleAssignModal
          userId={selectedUserId}
          open={assignOpen}
          onOpenChange={setAssignOpen}
        />
      )}
    </div>
  );
}

function UserRow({
  user,
  expanded,
  onToggle,
  onAssign,
}: {
  user: { id: string; fullName: string; email: string; status: string; lastLoginAt: string | null };
  expanded: boolean;
  onToggle: () => void;
  onAssign: () => void;
}) {
  const { data: userRoles, isLoading: loadingRoles } = useUserRoles(expanded ? user.id : undefined);
  const removeRole = useRemoveUserRole();

  const statusColor =
    user.status === "ACTIVE"
      ? "bg-green-100 text-green-800"
      : user.status === "INVITED"
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-gray-800";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onToggle} className="flex-1 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{user.fullName}</h3>
              <Badge className={statusColor}>{user.status}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {user.email}
              </span>
              {user.lastLoginAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(user.lastLoginAt).toLocaleString("vi-VN")}
                </span>
              )}
            </div>
          </button>
          <Button size="sm" onClick={onAssign}>
            <UserCog className="h-4 w-4 mr-1" />
            Gán role
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Roles đã gán ({userRoles?.length ?? 0})</h4>
            {loadingRoles ? (
              <div className="text-sm text-muted-foreground">Đang tải...</div>
            ) : !userRoles || userRoles.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Chưa có role nào. Click &quot;Gán role&quot; để thêm.
              </div>
            ) : (
              <div className="grid gap-2">
                {userRoles.map((ur) => {
                  const pg = roleCodeToProductGroup(ur.roleCode);
                  return (
                    <div
                      key={ur.userRoleId}
                      className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={ROLE_CODE_COLORS[ur.roleCode] ?? "bg-gray-100"}>
                          {ROLE_CODE_LABELS[ur.roleCode] ?? ur.roleCode}
                        </Badge>
                        {pg && (
                          <Badge variant="outline" className="text-xs">
                            {pg === "HOA_CHAT_SINH_PHAM" ? "HC-SP" : "VTYT"}
                          </Badge>
                        )}
                        {ur.branchName && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {ur.branchName}
                          </span>
                        )}
                        {ur.expiresAt && (
                          <span className="text-xs text-amber-600">
                            Hết hạn: {new Date(ur.expiresAt).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          removeRole.mutate({ userRoleId: ur.userRoleId, userId: user.id })
                        }
                        disabled={removeRole.isPending}
                      >
                        Xóa
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
