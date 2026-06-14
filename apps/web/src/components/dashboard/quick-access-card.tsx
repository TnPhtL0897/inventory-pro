import * as React from "react";
import Link from "next/link";
import {
 Package,
 AlertTriangle,
 ArrowDownToLine,
 ArrowLeftRight,
 ShoppingCart,
 ClipboardList,
 Building2,
 TrendingUp,
 type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CardTone =
 | "green"
 | "orange"
 | "blue"
 | "purple"
 | "yellow"
 | "mint"
 | "slate"
 | "pink";

const toneStyles: Record<CardTone, { icon: string; ring: string }> = {
 green: { icon: "bg-icon-green", ring: "ring-emerald-100" },
 orange: { icon: "bg-icon-orange", ring: "ring-orange-100" },
 blue: { icon: "bg-icon-blue", ring: "ring-sky-100" },
 purple: { icon: "bg-icon-purple", ring: "ring-violet-100" },
 yellow: { icon: "bg-icon-yellow", ring: "ring-amber-100" },
 mint: { icon: "bg-icon-mint", ring: "ring-emerald-100" },
 slate: { icon: "bg-icon-slate", ring: "ring-slate-100" },
 pink: { icon: "bg-icon-pink", ring: "ring-pink-100" },
};

const iconMap: Record<string, LucideIcon> = {
 package: Package,
 alert: AlertTriangle,
 inbox: ArrowDownToLine,
 transfer: ArrowLeftRight,
 cart: ShoppingCart,
 clipboard: ClipboardList,
 building: Building2,
 forecast: TrendingUp,
};

interface QuickAccessCardProps {
 title: string;
 icon: keyof typeof iconMap;
 tone: CardTone;
 value?: number | string;
 subtext?: string;
 href: string;
 className?: string;
}

/**
 * QuickAccessCard - Soft rounded card with large icon + number for module grid.
 */
export function QuickAccessCard({
 title,
 icon,
 tone,
 value,
 subtext,
 href,
 className,
}: QuickAccessCardProps) {
 const Icon = iconMap[icon] ?? Package;
 const t = toneStyles[tone];

 return (
 <Link
 href={href}
 className={cn(
 "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
 className
 )}
 >
 <div
 className={cn(
 "inline-flex h-12 w-12 items-center justify-center rounded-2xl",
 t.icon
 )}
 aria-hidden="true"
 >
 <Icon className="h-6 w-6" strokeWidth={2.25} />
 </div>
 <div className="flex flex-col gap-0.5">
 <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
 {value !== undefined && (
 <div className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
 {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
 </div>
 )}
 {subtext && (
 <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
 {subtext}
 </p>
 )}
 </div>
 </Link>
 );
}
