import { requireAuth } from "@/lib/auth";
import { getSwimHomeData } from "@/lib/swim-data";
export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json(getSwimHomeData(), { headers: { "cache-control": "no-store" } });
}
