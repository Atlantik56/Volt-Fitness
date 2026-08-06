import { requireAuth } from "@/lib/auth";
import { getSwimRecords } from "@/lib/swim-data";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json(getSwimRecords(), { headers: { "cache-control": "no-store" } });
}
