import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PillNav, type NavGroup } from "@/components/dashboard/pill-nav";
import { UserMenu, type UserInfo } from "@/components/dashboard/user-menu";
import { MobileNav } from "@/components/dashboard/mobile-nav";

interface SessionUser extends UserInfo {
 id: string;
}

async function getCurrentUser(): Promise<SessionUser | null> {
 const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
 process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
 process.env.NEXT_PUBLIC_SUPABASE_URL.includes("abcdefghij");

 if (isPlaceholder) {
 const cookieStore = await cookies();
 const sessionCookie = cookieStore.get("dev_session")?.value;
 if (sessionCookie) {
 try {
 const session = JSON.parse(sessionCookie);
 if (session?.user) return session.user as SessionUser;
 } catch {
 // Invalid
 }
 }
 return null;
 }

 const supabase = await createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return null;

 // Try to fetch role from public.users table (best-effort, may fail under RLS)
 let role: string | undefined;
 try {
 const { data: profile } = await supabase
 .from("users")
 .select("role_codes:user_roles(role:roles(code))")
 .eq("id", user.id)
 .maybeSingle();
 const codes = (profile as any)?.role_codes as Array<{ role: { code: string } }> | undefined;
 if (codes && codes.length > 0) {
 role = codes.map((c) => c.role.code).join(", ");
 }
 } catch {
 // ignore — RLS may block
 }

 return {
 id: user.id,
 email: user.email ?? "",
 full_name: (user.user_metadata?.full_name as string) ?? user.email,
 role,
 };
}

async function handleSignOut() {
 "use server";
 const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
 process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
 process.env.NEXT_PUBLIC_SUPABASE_URL.includes("abcdefghij");

 if (isPlaceholder) {
 const { cookies } = await import("next/headers");
 const cookieStore = await cookies();
 cookieStore.delete("dev_session");
 redirect("/login");
 return;
 }

 const supabase = await createClient();
 await supabase.auth.signOut();
 redirect("/login");
}

/** Top-level nav (6 groups) - rendered as pill nav on desktop, drawer on mobile */
const NAV_ITEMS: NavGroup[] = [
 { label: "Tổng quan", href: "/dashboard" },
 { label: "Vật tư", href: "/inventory/products" },
 { label: "Nhập/Xuất", href: "/goods-receipts" },
 { label: "Kiểm kê", href: "/stocktake" },
 { label: "Dự trù/PO", href: "/replenishment" },
 { label: "Đối tác", href: "/parties" },
];

/** Full nav for mobile drawer */
const MOBILE_NAV: NavGroup[] = [
 { label: "Tổng quan", href: "/dashboard" },
 { label: "Vật tư", href: "/inventory/products" },
 { label: "Tồn kho", href: "/inventory/stock" },
 { label: "Import tồn kho", href: "/inventory/stock/snapshot" },
 { label: "Kho", href: "/warehouses" },
 { label: "Mua hàng (PO)", href: "/purchase-orders" },
 { label: "Nhập kho (GRN)", href: "/goods-receipts" },
 { label: "Chuyển kho", href: "/transfers" },
 { label: "Xuất kho", href: "/stock-issues" },
 { label: "Kiểm kê", href: "/stocktake" },
 { label: "Dự trù cuối tháng", href: "/replenishment" },
 { label: "Dự trù năm", href: "/inventory/replenishment/yearly" },
 { label: "Đấu thầu", href: "/bidding/contracts" },
 { label: "Đối tác", href: "/parties" },
];

export default async function DashboardLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const user = await getCurrentUser();
 if (!user) redirect("/login");

 return (
 <div className="flex min-h-screen flex-col">
 {/* Soft header */}
 <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
 <div className="container flex h-16 items-center gap-3">
 {/* Mobile menu trigger */}
 <MobileNav items={MOBILE_NAV} user={user} signOutAction={handleSignOut}>
 <Menu className="h-5 w-5" />
 </MobileNav>

 {/* Brand */}
 <Link
 href="/dashboard"
 className="flex items-center gap-2 font-semibold tracking-tight"
 >
 <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-700 text-sm font-bold text-white shadow-sm">
 KV
 </span>
 <span className="hidden text-base sm:inline">Kho vật tư Pro</span>
 </Link>

 {/* Pill nav (desktop) */}
 <div className="ml-2 hidden flex-1 lg:flex">
 <PillNav items={NAV_ITEMS} />
 </div>

 {/* Spacer for mobile */}
 <div className="flex-1 lg:hidden" />

 {/* User menu (right) */}
 <UserMenu
 user={user}
 signOutAction={handleSignOut}
 notificationCount={0}
 />
 </div>

 {/* Mobile pill nav (scrollable) */}
 <div className="container pb-3 lg:hidden">
 <div className="overflow-x-auto">
 <PillNav items={NAV_ITEMS} className="inline-flex" />
 </div>
 </div>
 </header>

 <main className="flex-1">
 <div className="container py-6 sm:py-8 px-4 sm:px-6">{children}</div>
 </main>
 </div>
 );
}
