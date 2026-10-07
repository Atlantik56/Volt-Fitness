import { publicBaseUrl, VOLT_SCOPES } from "@/lib/volt-oauth.ts";

export const dynamic = "force-dynamic";
export function GET() {
  const issuer = publicBaseUrl();
  return Response.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: VOLT_SCOPES,
    authorization_response_iss_parameter_supported: true,
  }, { headers: { "cache-control": "public, max-age=300" } });
}
