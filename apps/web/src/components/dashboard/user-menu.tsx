"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export interface UserInfo {
  email: string;
  full_name?: string;
  role?: string;
}

interface UserMenuProps {
  user: UserInfo;
  notificationCount?: number;
  className?: string;
}

function initialsOf(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  }
  if (email) return email[0]?.toUpperCase() ?? "?";
  return "?";
}

/**
 * UserMenu - Avatar + bell + dropdown for header.
 * Sign-out dùng client-side (Supabase auth.signOut + clear cookies + redirect).
 * Tránh vấn đề server action không hoạt động trên Cloudflare Pages edge runtime.
 */
export function UserMenu({
  user,
  notificationCount = 0,
  className,
}: UserMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);
  const initials = initialsOf(user.full_name, user.email);
  const displayName = user.full_name?.trim() || user.email;
  const roleCode = user.role?.trim() || "";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();

      // Xóa tất cả cookies liên quan
      if (typeof document !== "undefined") {
        const cookies = document.cookie.split(";");
        for (const cookie of cookies) {
          const name = cookie.split("=")[0].trim();
          if (
            name.startsWith("sb-") ||
            name.includes("supabase") ||
            name === "dev_session"
          ) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          }
        }
      }

      // Hard reload về /login (dùng window.location để chắc chắn xóa state)
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      } else {
        router.push("/login");
        router.refresh();
      }
    } catch (err) {
      console.error("[SignOut] Error:", err);
      // Fallback: vẫn redirect về login
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-10 w-10 rounded-full text-muted-foreground hover:bg-muted"
        aria-label={`${notificationCount} thông báo`}
      >
        <Bell className="h-5 w-5" />
        {notificationCount > 0 && (
          <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-card">
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-full bg-muted/60 p-1 pr-3 transition-colors hover:bg-muted"
            aria-label="Menu người dùng"
          >
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-700 text-sm font-semibold text-white shadow-sm"
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="hidden text-left leading-tight sm:inline">
              <span className="block text-sm font-medium text-foreground">
                {displayName}
              </span>
              {roleCode && (
                <span className="block text-[11px] text-muted-foreground">
                  {roleCode}
                </span>
              )}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{displayName}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
              {roleCode && (
                <span className="mt-1 inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {roleCode}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Sign out button - dùng onClick client-side (KHÔNG form action) */}
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={signingOut}
            className="cursor-pointer text-rose-600 focus:text-rose-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {signingOut ? "Đang đăng xuất..." : "Đăng xuất"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
