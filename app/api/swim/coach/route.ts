import { requireAuth, sameOrigin } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { getSwimAnalytics, getSwimHomeData, getSwimRecords } from "@/lib/swim-data";
import { askAnthropicStructured, askMwsStructured } from "@/lib/ai-coach";
import { routeAiHub, type AiHubConfig } from "@/lib/ai-hub";
import { buildSwimCoachContext, buildSwimCoachFallback, parseSwimCoachReply, swimCoachPrompt, type SwimCoachResponse } from "@/lib/swim/coach";

export const runtime="nodejs";
const SYSTEM="Ты — VOLT Swim Coach. Код уже вычислил все показатели. Только объясни переданные факты, не придумывай данные и верни строго JSON заданной схемы.";

function data(){
  const date=new Date().toISOString().slice(0,10);
  const context=buildSwimCoachContext(date,getSwimAnalytics("30d",date),getSwimRecords(date),getSwimHomeData());
  return {context,briefing:buildSwimCoachFallback(context)};
}

function config():AiHubConfig{return {
  anthropicKey:getSetting("anthropic_api_key")||process.env.ANTHROPIC_API_KEY,
  mwsKey:getSetting("mws_api_key")||process.env.MWS_API_KEY,
  mwsProject:getSetting("mws_project")||process.env.MWS_PROJECT,
  mwsModel:getSetting("mws_model")||process.env.MWS_MODEL,
};}

export async function GET(){
  const denied=await requireAuth(); if(denied)return denied;
  const initial=data();
  const response:SwimCoachResponse={...initial,source:"fallback",fallbackReason:null};
  return Response.json(response,{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
  const denied=await requireAuth(); if(denied)return denied;
  if(!sameOrigin(request))return new Response(null,{status:403});
  const initial=data(); const hub=config();
  if(!hub.anthropicKey&&!(hub.mwsKey&&hub.mwsProject&&hub.mwsModel)){
    const response:SwimCoachResponse={...initial,source:"fallback",fallbackReason:"provider_unavailable"};
    return Response.json(response);
  }
  const prompt=swimCoachPrompt(initial.context);
  try{
    const raw=await routeAiHub(hub,"auto",{
      anthropic:(key)=>askAnthropicStructured(key,SYSTEM,[{role:"user",content:prompt}]).then(text=>({text})),
      mws:(key,project,model)=>askMwsStructured(key,project,model,SYSTEM,[{role:"user",content:prompt}]).then(text=>({text})),
    });
    try{
      const response:SwimCoachResponse={context:initial.context,briefing:parseSwimCoachReply(raw.text,initial.context),source:"ai",fallbackReason:null};
      return Response.json(response);
    }catch{
      const response:SwimCoachResponse={...initial,source:"fallback",fallbackReason:"invalid_output"};
      return Response.json(response);
    }
  }catch{
    const response:SwimCoachResponse={...initial,source:"fallback",fallbackReason:"provider_error"};
    return Response.json(response);
  }
}
