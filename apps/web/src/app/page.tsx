import { redirect } from "next/navigation";

/**
 * Root page: luôn redirect về /dashboard.
 * Middleware sẽ handle auth - nếu chưa login thì redirect tiếp về /login.
 */
export default function HomePage() {
  redirect("/dashboard");
}
