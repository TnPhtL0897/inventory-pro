"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Thử login qua Supabase trước (nếu env thật)
      const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
        process.env.NEXT_PUBLIC_SUPABASE_URL.includes("abcdefghij");

      if (isPlaceholder) {
        // DEV MODE: dùng API route mock
        const res = await fetch("/api/auth/dev-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error("Đăng nhập thất bại", { description: data.error?.message ?? "Sai email hoặc mật khẩu" });
          return;
        }
        toast.success("Đăng nhập thành công (DEV MODE)");
        router.push(redirect);
        router.refresh();
        return;
      }

      // PRODUCTION: dùng Supabase thật
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error("Đăng nhập thất bại", { description: error.message });
        return;
      }

      toast.success("Đăng nhập thành công");
      router.push(redirect);
      router.refresh();
    } catch (err) {
      toast.error("Đã có lỗi xảy ra", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          Quản lý kho vật tư Pro
        </CardTitle>
        <CardDescription>
          Đăng nhập vào hệ thống để tiếp tục
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="ten@congty.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mật khẩu</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Đăng nhập
          </Button>
          <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-3 text-xs space-y-1 w-full">
            <p className="font-semibold text-blue-900 dark:text-blue-100">🧪 Tài khoản test (DEV MODE):</p>
            <p className="text-blue-800 dark:text-blue-200 font-mono">admin@inventorypro.vn / admin123</p>
            <p className="text-blue-800 dark:text-blue-200 font-mono">manager@inventorypro.vn / manager123</p>
            <p className="text-blue-800 dark:text-blue-200 font-mono">staff@inventorypro.vn / staff123</p>
            <p className="text-blue-700 dark:text-blue-300 text-[10px] mt-1">
              ⚠ Khi deploy production phải setup Supabase thật + xóa mock login
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Chưa có tài khoản? Liên hệ quản trị viên.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
