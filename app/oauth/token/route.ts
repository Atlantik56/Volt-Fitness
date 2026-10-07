import { readBoundedBody } from "@/lib/bounded-request-body";
import { db } from "@/lib/db.ts";
import { exchangeAuthorizationCode, rotateRefreshToken } from "@/lib/volt-oauth.ts";

export const runtime = "nodejs";

const oauthError = (error: string, status = 400) => Response.json({ error }, {
  status,
  headers: { "cache-control": "no-store", pragma: "no-cache" },
});

export async function POST(request: Request) {
  try {
    const raw = await readBoundedBody(request, 16384);
    if (raw.length > 16_384) return oauthError("invalid_request");
    const form = new URLSearchParams(raw), grantType = form.get("grant_type") ?? "";
    let result;
    if (grantType === "authorization_code") {
      result = exchangeAuthorizationCode(db, {
        code: form.get("code") ?? "",
        clientId: form.get("client_id") ?? "",
        redirectUri: form.get("redirect_uri") ?? "",
        codeVerifier: form.get("code_verifier") ?? "",
      });
    } else if (grantType === "refresh_token") {
      result = rotateRefreshToken(db, {
        refreshToken: form.get("refresh_token") ?? "",
        clientId: form.get("client_id") ?? "",
      });
    } else return oauthError("unsupported_grant_type");
    return Response.json(result, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
  } catch (error) {
    const code = error instanceof Error && error.message === "invalid_grant" ? "invalid_grant" : "invalid_request";
    return oauthError(code);
  }
}
