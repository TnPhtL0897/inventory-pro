"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service (Sentry sau này)
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Đã xảy ra lỗi</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hệ thống gặp lỗi không mong muốn. Vui lòng thử lại hoặc liên hệ quản trị viên nếu lỗi tiếp tục.
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-muted-foreground font-mono">
              Mã lỗi: {error.digest}
            </p>
          )}
        </div>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => reset()}>
            <RotateCw className="mr-2 h-4 w-4" />
            Thử lại
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            <Home className="mr-2 h-4 w-4" />
            Về Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
