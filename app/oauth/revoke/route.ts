import { readBoundedBody } from "@/lib/bounded-request-body";
import { db } from "@/lib/db.ts";
import { revokeOAuthToken } from "@/lib/volt-oauth.ts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await readBoundedBody(request,16_384);
    revokeOAuthToken(db, new URLSearchParams(raw).get("token") ?? "");
  } catch { /* Invalid or unknown revocation requests reveal no token information. */ }
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}
