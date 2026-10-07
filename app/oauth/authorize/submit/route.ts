import { db } from "@/lib/db.ts";
import { isAuthenticated, sameOrigin } from "@/lib/auth.ts";
import { createAuthorizationCode, publicBaseUrl, validateAuthorizationRequest } from "@/lib/volt-oauth.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "invalid_request" }, { status: 403 });
  if (!(await isAuthenticated())) return Response.json({ error: "access_denied" }, { status: 401 });
  try {
    const form = await request.formData();
    const value = (name: string) => String(form.get(name) ?? "");
    const input = {
      clientId: value("client_id"), redirectUri: value("redirect_uri"), responseType: value("response_type"),
      codeChallenge: value("code_challenge"), codeChallengeMethod: value("code_challenge_method"), scope: value("scope"),
    };
    const validated = validateAuthorizationRequest(db, input);
    const code = createAuthorizationCode(db, { ...input, scope: validated.scope });
    const redirect = new URL(input.redirectUri);
    redirect.searchParams.set("code", code);
    const state = value("state");
    if (state) redirect.searchParams.set("state", state);
    redirect.searchParams.set("iss", publicBaseUrl());
    return new Response(null,{status:303,headers:{location:redirect.toString(),"cache-control":"no-store","referrer-policy":"no-referrer"}});
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
