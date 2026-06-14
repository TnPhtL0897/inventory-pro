"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavGroup {
 label: string;
 href: string;
 /** Optional badge count to show in the pill */
 count?: number;
}

interface PillNavProps {
 items: NavGroup[];
 className?: string;
}

/**
 * PillNav - Modern SaaS style horizontal nav.
 * Rounded-2xl container with pill-shaped active item.
 */
export function PillNav({ items, className }: PillNavProps) {
 const pathname = usePathname();

 return (
 <nav
 className={cn(
 "inline-flex items-center gap-1 rounded-2xl border bg-card p-1.5 shadow-card",
 className
 )}
 aria-label="Main"
 >
 {items.map((item) => {
 const isActive =
 pathname === item.href ||
 (item.href !== "/" && pathname?.startsWith(item.href + "/")) ||
 (item.href !== "/" && pathname?.startsWith(item.href));

 return (
 <Link
 key={item.href}
 href={item.href}
 className={cn(
 "relative inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
 isActive
 ? "bg-primary/10 text-primary"
 : "text-muted-foreground hover:bg-muted hover:text-foreground"
 )}
 aria-current={isActive ? "page" : undefined}
 >
 <span>{item.label}</span>
 {typeof item.count === "number" && item.count > 0 && (
 <span
 className={cn(
 "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
 isActive
 ? "bg-primary text-primary-foreground"
 : "bg-muted-foreground/15 text-muted-foreground"
 )}
 >
 {item.count > 99 ? "99+" : item.count}
 </span>
 )}
 </Link>
 );
 })}
 </nav>
 );
}
