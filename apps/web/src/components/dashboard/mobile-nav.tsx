"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
 Sheet,
 SheetContent,
 SheetHeader,
 SheetTitle,
 SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { PillNav, type NavGroup } from "./pill-nav";
import { UserMenu, type UserInfo } from "./user-menu";
import { cn } from "@/lib/utils";

interface MobileNavProps {
 items: NavGroup[];
 user: UserInfo;
 signOutAction: () => Promise<void>;
 children: React.ReactNode;
}

/**
 * MobileNav - Drawer with full nav list for small screens.
 * Renders the trigger as a compact icon button.
 */
export function MobileNav({ items, user, signOutAction, children }: MobileNavProps) {
 const [open, setOpen] = React.useState(false);
 const pathname = usePathname();

 // Close drawer on navigation
 React.useEffect(() => {
 setOpen(false);
 }, [pathname]);

 return (
 <Sheet open={open} onOpenChange={setOpen}>
 <SheetTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-muted lg:hidden"
 aria-label="Mở menu"
 >
 {children}
 </Button>
 </SheetTrigger>
 <SheetContent
 side="left"
 className="flex w-72 flex-col gap-0 p-0"
 >
 <SheetHeader className="border-b px-5 py-4">
 <SheetTitle className="text-base">Menu</SheetTitle>
 </SheetHeader>
 <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile">
 <ul className="space-y-0.5">
 {items.map((item) => {
 const isActive =
 pathname === item.href ||
 (item.href !== "/" && pathname?.startsWith(item.href + "/"));
 return (
 <li key={item.href}>
 <Link
 href={item.href}
 className={cn(
 "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
 isActive
 ? "bg-primary/10 text-primary"
 : "text-foreground/80 hover:bg-muted hover:text-foreground"
 )}
 aria-current={isActive ? "page" : undefined}
 >
 <span>{item.label}</span>
 </Link>
 </li>
 );
 })}
 </ul>
 </nav>
 <div className="border-t p-3">
 <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-muted/60 p-2.5">
 <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-700 text-sm font-semibold text-white">
 {user.full_name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase() ?? "?"}
 </span>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-medium">{user.full_name || user.email}</p>
 {user.role && (
 <p className="truncate text-[11px] text-muted-foreground">{user.role}</p>
 )}
 </div>
 </div>
 <form action={signOutAction}>
 <Button
 type="submit"
 variant="ghost"
 className="w-full justify-start text-rose-600 hover:bg-rose-50 hover:text-rose-700"
 >
 <LogOut className="mr-2 h-4 w-4" />
 Đăng xuất
 </Button>
 </form>
 </div>
 </SheetContent>
 </Sheet>
 );
}
