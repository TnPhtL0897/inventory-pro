import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div>
          <p className="text-7xl font-bold text-primary">404</p>
          <h1 className="mt-4 text-2xl font-bold">Trang không tồn tại</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Trang bạn tìm không tồn tại hoặc đã được di chuyển. Vui lòng kiểm tra lại đường dẫn.
          </p>
        </div>
        <div className="flex gap-2 justify-center">
          <Button asChild>
            <Link href="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              Về Dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/inventory/products">
              <Search className="mr-2 h-4 w-4" />
              Xem vật tư
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
