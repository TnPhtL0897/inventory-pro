import * as React from "react";
import { cn } from "@/lib/utils";

interface StatPillProps {
 label: string;
 value: number | string;
 tone?: "neutral" | "warning" | "danger" | "success" | "info";
 className?: string;
}

const toneStyles: Record<NonNullable<StatPillProps["tone"]>, string> = {
 neutral: "bg-white/15 text-white",
 warning: "bg-amber-400/25 text-amber-50 ring-1 ring-amber-300/40",
 danger: "bg-rose-400/25 text-rose-50 ring-1 ring-rose-300/40",
 success: "bg-emerald-400/25 text-emerald-50 ring-1 ring-emerald-300/40",
 info: "bg-sky-400/25 text-sky-50 ring-1 ring-sky-300/40",
};

/**
 * StatPill - Compact label + value badge for hero banners.
 * Uses white-on-color tints for use over gradient backgrounds.
 */
export function StatPill({ label, value, tone = "neutral", className }: StatPillProps) {
 return (
 <div
 className={cn(
 "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium backdrop-blur",
 toneStyles[tone],
 className
 )}
 >
 <span className="text-white/80">{label}</span>
 <span className="font-semibold tabular-nums text-white">
 {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
 </span>
 </div>
 );
}
