import { YearlyForecastClient } from "@/features/replenishment/yearly-forecast-client";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default function YearlyForecastPage() {
 return <YearlyForecastClient />;
}
