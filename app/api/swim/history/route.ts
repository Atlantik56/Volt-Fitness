import { requireAuth } from "@/lib/auth";
import { getSwimHistory } from "@/lib/swim-data";
export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json(getSwimHistory(), { headers: { "cache-control": "no-store" } });
}
