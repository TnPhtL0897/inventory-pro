import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@inventorypro/shared-types";

/**
 * ⚠ DEV ONLY - Test user credentials
 * Khi deploy production phải XÓA block này và dùng Supabase thật.
 */
const DEV_BYPASS_AUTH = process.env.NODE_ENV !== "production" &&
  (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("placeholder") ||
   process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("abcdefghij") ||
   !process.env.NEXT_PUBLIC_SUPABASE_URL);

const TEST_USERS: Record<string, { password: string; user: { id: string; email: string; role: string; tenantId: string; branchIds: string[] } }> = {
  "admin@inventorypro.vn": {
    password: "admin123",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@inventorypro.vn",
      role: "ADMIN",
      tenantId: "00000000-0000-0000-0000-000000000010",
      branchIds: ["00000000-0000-0000-0000-000000000020"],
    },
  },
  "manager@inventorypro.vn": {
    password: "manager123",
    user: {
      id: "00000000-0000-0000-0000-000000000002",
      email: "manager@inventorypro.vn",
      role: "MANAGER",
      tenantId: "00000000-0000-0000-0000-000000000010",
      branchIds: ["00000000-0000-0000-0000-000000000020"],
    },
  },
  "staff@inventorypro.vn": {
    password: "staff123",
    user: {
      id: "00000000-0000-0000-0000-000000000003",
      email: "staff@inventorypro.vn",
      role: "STAFF",
      tenantId: "00000000-0000-0000-0000-000000000010",
      branchIds: ["00000000-0000-0000-0000-000000000020"],
    },
  },
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPaths = ["/login", "/auth/callback", "/api/auth/callback", "/api/auth/dev-login", "/api/auth/dev-logout"];

  // PWA assets must bypass auth (manifest, service worker, offline page)
  const pwaAssets = ["/manifest.json", "/sw.js", "/offline.html", "/icon.svg", "/icon-192.png", "/icon-512.png", "/favicon.ico"];
  if (pwaAssets.some((p) => pathname === p || pathname.startsWith(p + "?"))) {
    return NextResponse.next({ request });
  }

  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  // DEV BYPASS: Nếu env là placeholder và user "đã login" qua cookie, cho phép vào
  if (DEV_BYPASS_AUTH) {
    const sessionCookie = request.cookies.get("dev_session")?.value;
    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie);
        // Nếu đã có session hợp lệ, cho phép truy cập
        if (session?.user?.id) {
          // Nếu vào /login mà đã có session → redirect dashboard
          if (pathname === "/login") {
            const url = request.nextUrl.clone();
            url.pathname = "/dashboard";
            return NextResponse.redirect(url);
          }
          return NextResponse.next({ request });
        }
      } catch {
        // Invalid session, fall through
      }
    }
    // Chưa có session và vào protected route → redirect login
    if (!isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  // PRODUCTION MODE: dùng Supabase thật
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

// Export test users để API auth route dùng
export { TEST_USERS };

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
