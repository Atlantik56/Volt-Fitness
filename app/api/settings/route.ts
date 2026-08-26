import { requireAuth, sameOrigin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { providerFlagEnabled } from "@/lib/ai-hub";

export async function GET() {
  const denied = await requireAuth(); if (denied) return denied;
  return Response.json({
    anthropicKeySet:!!(getSetting("anthropic_api_key")||process.env.ANTHROPIC_API_KEY),
    anthropicEnabled:providerFlagEnabled(process.env.ANTHROPIC_ENABLED),
    mwsKeySet:!!(getSetting("mws_api_key")||process.env.MWS_API_KEY),
    mwsProject:getSetting("mws_project")||process.env.MWS_PROJECT||"",
    mwsModel:getSetting("mws_model")||process.env.MWS_MODEL||"",
  });
}

export async function POST(req: Request) {
  const denied = await requireAuth(); if (denied) return denied;
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if(body.action==="mws"){
    const key=String(body.mwsKey||"").trim();
    const project=String(body.mwsProject||"").trim();
    const model=String(body.mwsModel||"").trim();
    if(!(key||getSetting("mws_api_key")||process.env.MWS_API_KEY))
      return Response.json({error:"Вставьте API-ключ MWS"},{status:400});
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(project))
      return Response.json({error:"Проверьте имя проекта MWS"},{status:400});
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,100}$/.test(model))
      return Response.json({error:"Проверьте имя модели MWS"},{status:400});
    if(key)setSetting("mws_api_key",key);
    setSetting("mws_project",project);
    setSetting("mws_model",model);
    return Response.json({ok:true});
  }
  const key = String(body.anthropicKey || "").trim();
  if (!key || key.length < 20 || key.length > 200) return Response.json({ error: "Похоже, ключ введён некорректно" }, { status: 400 });
  setSetting("anthropic_api_key", key);
  return Response.json({ ok: true });
}
