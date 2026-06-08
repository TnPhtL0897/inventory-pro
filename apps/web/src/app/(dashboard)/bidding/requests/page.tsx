// Server component - Dá»± trÃ¹ mua sáº¯m
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";


// Force dynamic rendering - skip static gen (Vercel free 60s/lambda limit)
export const dynamic = "force-dynamic"

export default async function PurchaseRequestsPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dá»± trÃ¹ mua sáº¯m</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Dá»± trÃ¹ nhu cáº§u tá»« cÃ¡c khoa/phÃ²ng - gom thÃ nh gÃ³i tháº§u
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Danh sÃ¡ch dá»± trÃ¹
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Module Dá»± trÃ¹ Ä‘ang Ä‘Æ°á»£c phÃ¡t triá»ƒn.</p>
            <p className="text-xs mt-2">
              CÃ¡c trang chÃ­nh Ä‘Ã£ sáºµn sÃ ng: <a href="/bidding/plans" className="text-blue-600 hover:underline">Káº¿ hoáº¡ch Ä‘áº¥u tháº§u</a> Â· <a href="/bidding/packages" className="text-blue-600 hover:underline">GÃ³i tháº§u</a> Â· <a href="/bidding/lots" className="text-blue-600 hover:underline">LÃ´ tháº§u</a> Â· <a href="/bidding/contracts" className="text-blue-600 hover:underline">Há»£p Ä‘á»“ng tháº§u</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

