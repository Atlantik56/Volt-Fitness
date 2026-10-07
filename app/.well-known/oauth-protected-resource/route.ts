import { publicBaseUrl, VOLT_SCOPES } from "@/lib/volt-oauth.ts";

export const dynamic = "force-dynamic";
export function GET() {
  const base = publicBaseUrl();
  return Response.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: VOLT_SCOPES,
    resource_name: "VOLT",
  }, { headers: { "cache-control": "public, max-age=300" } });
}
