import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildUserDataExport } from "@/lib/user-data-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const data = buildUserDataExport(db);
  return new Response(JSON.stringify(data,null,2),{headers:{
    "content-type":"application/json; charset=utf-8",
    "content-disposition":`attachment; filename="volt-data-${data.exportedAt.slice(0,10)}.json"`,
    "cache-control":"private, no-store",
    "x-content-type-options":"nosniff",
  }});
}
