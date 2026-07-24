import { requireAuth, sameOrigin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

export async function GET() {
  const denied = await requireAuth(); if (denied) return denied;
  return Response.json({ anthropicKeySet: !!(getSetting("anthropic_api_key") || process.env.ANTHROPIC_API_KEY) });
}

export async function POST(req: Request) {
  const denied = await requireAuth(); if (denied) return denied;
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const key = String(body.anthropicKey || "").trim();
  if (!key || key.length < 20 || key.length > 200) return Response.json({ error: "Похоже, ключ введён некорректно" }, { status: 400 });
  setSetting("anthropic_api_key", key);
  return Response.json({ ok: true });
}
