import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { DashboardNav, type NavItem } from "@/components/dashboard-nav";

interface SessionUser {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
}

async function getCurrentUser(): Promise<SessionUser | null> {
  // DEV MODE: check dev_session cookie
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

  // PRODUCTION: Supabase
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    full_name: (user.user_metadata?.full_name as string) ?? user.email,
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

const NAV_ITEMS: NavItem[] = [
  { label: "Tổng quan", href: "/dashboard" },
  { label: "Vật tư", href: "/inventory/products" },
  { label: "Tồn kho", href: "/inventory/stock" },
  { label: "Kho", href: "/warehouses" },
  { label: "Đối tác", href: "/parties" },
  { label: "Mua hàng", href: "/purchase-orders" },
  { label: "Nhập kho", href: "/goods-receipts" },
  { label: "Chuyển kho", href: "/transfers" },
  { label: "Kiểm kê", href: "/stock-takes" },
  { label: "Đấu thầu", href: "/bidding/contracts" },
  { label: "Dự trù cuối tháng", href: "/replenishment" },
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
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-14 sm:h-16 items-center gap-2 sm:gap-4">
          {/* Mobile: hamburger + logo */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <DashboardNav items={NAV_ITEMS} user={user} signOutAction={handleSignOut} />
            <Link
              href="/dashboard"
              className="text-sm sm:text-base lg:text-lg font-bold truncate"
            >
              <span className="hidden sm:inline">Quản lý kho vật tư Pro</span>
              <span className="sm:hidden">Kho vật tư Pro</span>
            </Link>
          </div>

          {/* Desktop user info + logout */}
          <div className="hidden lg:flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {user.email}
              {user.role && (
                <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                  {user.role}
                </span>
              )}
            </span>
            <form action={handleSignOut}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="mr-2 h-4 w-4" />
                Đăng xuất
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="container py-4 sm:py-6 px-4 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
