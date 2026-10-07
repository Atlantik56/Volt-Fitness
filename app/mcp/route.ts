import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { db } from "@/lib/db.ts";
import { createVoltMcpServer } from "@/lib/volt-mcp-server.ts";
import { publicBaseUrl, validateAccessToken } from "@/lib/volt-oauth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${publicBaseUrl()}/.well-known/oauth-protected-resource"`,
    },
  });
}

async function handle(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization);
  const access = match ? validateAccessToken(db, match[1]) : null;
  if (!access) return unauthorized();

  const server = createVoltMcpServer(db, access.scopes);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true, sessionIdGenerator: undefined });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, {
    authInfo: {
      token: match![1],
      clientId: access.clientId,
      scopes: access.scopes,
      expiresAt: Math.floor(access.expiresAt / 1000),
      extra: { username: access.username },
    },
    });
  } finally { await server.close(); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
