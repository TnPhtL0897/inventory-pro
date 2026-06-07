"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  href: string;
}

export interface DashboardNavProps {
  items: NavItem[];
  user: { email: string; full_name?: string; role?: string };
  signOutAction: () => Promise<void>;
}

export function DashboardNav({ items, user, signOutAction }: DashboardNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const renderLink = (item: NavItem, onClick?: () => void) => {
    const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClick}
        className={cn(
          "block rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-foreground/80 hover:text-foreground"
        )}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden lg:flex items-center gap-1 text-sm">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 transition-colors hover:bg-muted hover:text-foreground",
                isActive ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile menu button */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mở menu" className="-ml-2">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0 w-72">
            <SheetHeader className="px-4 py-4 border-b">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {items.map((item) => renderLink(item, () => setOpen(false)))}
            </div>
            <div className="border-t px-4 py-3 space-y-2">
              <div className="text-xs text-muted-foreground break-all">
                {user.email}
                {user.role && (
                  <span className="ml-1 inline-block text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {user.role}
                  </span>
                )}
              </div>
              <form action={signOutAction}>
                <Button
                  variant="outline"
                  size="sm"
                  type="submit"
                  className="w-full justify-start"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Đăng xuất
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
