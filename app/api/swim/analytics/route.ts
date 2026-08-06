import { requireAuth } from "@/lib/auth";
import { getSwimAnalytics } from "@/lib/swim-data";
import type { SwimAnalyticsPeriod } from "@/app/swim/types";

export const runtime = "nodejs";

const PERIODS = new Set<SwimAnalyticsPeriod>(["30d", "90d", "1y"]);

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const requested = new URL(request.url).searchParams.get("period") as SwimAnalyticsPeriod | null;
  const period = requested && PERIODS.has(requested) ? requested : "30d";
  return Response.json(getSwimAnalytics(period), { headers: { "cache-control": "no-store" } });
}
