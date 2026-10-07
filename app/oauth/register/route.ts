import { readBoundedBody } from "@/lib/bounded-request-body";
import { db } from "@/lib/db.ts";
import { DEFAULT_VOLT_SCOPE, registerOAuthClient } from "@/lib/volt-oauth.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = await readBoundedBody(request, 32768);
    if (raw.length > 32_768) return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.token_endpoint_auth_method != null && body.token_endpoint_auth_method !== "none") {
      return Response.json({ error: "invalid_client_metadata", error_description: "Only public PKCE clients are supported" }, { status: 400 });
    }
    const client = registerOAuthClient(db, { clientName: body.client_name, redirectUris: body.redirect_uris });
    return Response.json({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: DEFAULT_VOLT_SCOPE,
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "registration_rate_limited") return Response.json({error:"temporarily_unavailable"},{status:429,headers:{"retry-after":"3600","cache-control":"no-store"}});
    return Response.json({ error: "invalid_client_metadata" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
