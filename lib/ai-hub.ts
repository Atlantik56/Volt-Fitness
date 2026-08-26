import { AiCoachError, askAiCoach, askMwsAiCoach, type AiChatMessage, type AiCoachReply } from "./ai-coach.ts";
import type { AiCoachContext } from "./ai-context.ts";

export type AiHubProvider="anthropic"|"mws"|"anthropic+mws";
export type AiHubRoute="auto"|"anthropic"|"mws"|"consensus";
export type AiHubReply=AiCoachReply&{provider:AiHubProvider;routeReason:"primary"|"primary_unavailable"|"fallback"|"consensus"};
export type AiHubConfig={
  anthropicKey?:string|null;
  anthropicEnabled?:boolean;
  mwsKey?:string|null;
  mwsProject?:string|null;
  mwsModel?:string|null;
};

export function providerFlagEnabled(value:string|undefined|null):boolean{
  return !["0","false","off","disabled"].includes(String(value??"").trim().toLowerCase());
}

export async function routeAiHub<T>(
  config:AiHubConfig,
  route:Exclude<AiHubRoute,"consensus">,
  adapters:{anthropic:(key:string)=>Promise<T>;mws:(key:string,project:string,model:string)=>Promise<T>},
):Promise<T&{provider:Exclude<AiHubProvider,"anthropic+mws">;routeReason:Exclude<AiHubReply["routeReason"],"consensus">}>{
  const anthropicReady=config.anthropicEnabled!==false&&!!config.anthropicKey;
  const mwsReady=!!(config.mwsKey&&config.mwsProject&&config.mwsModel);
  if(route==="anthropic"){
    if(config.anthropicEnabled===false)throw new AiCoachError("Anthropic отключён на сервере",503,{code:"provider_disabled",provider:"anthropic",allowFallback:false});
    if(!config.anthropicKey)throw new AiCoachError("Anthropic не настроен",503,{code:"invalid_config",provider:"anthropic",allowFallback:false});
    return {...await adapters.anthropic(config.anthropicKey),provider:"anthropic",routeReason:"primary"};
  }
  if(route==="mws"){
    if(!mwsReady)throw new AiCoachError("MWS GPT не настроен",503,{code:"invalid_config",provider:"mws",allowFallback:false});
    return {...await adapters.mws(config.mwsKey!,config.mwsProject!,config.mwsModel!),provider:"mws",routeReason:"primary"};
  }
  if(anthropicReady){
    try{return {...await adapters.anthropic(config.anthropicKey!),provider:"anthropic",routeReason:"primary"};}
    catch(error){
      if(!mwsReady||!(error instanceof AiCoachError)||!error.allowFallback)throw error;
      return {...await adapters.mws(config.mwsKey!,config.mwsProject!,config.mwsModel!),provider:"mws",routeReason:"fallback"};
    }
  }
  if(mwsReady)return {...await adapters.mws(config.mwsKey!,config.mwsProject!,config.mwsModel!),provider:"mws",routeReason:"primary_unavailable"};
  throw new AiCoachError("AI Hub не настроен: добавьте ключ Anthropic или MWS GPT",503);
}

export async function askAiHub(
  config:AiHubConfig,
  context:AiCoachContext,
  history:AiChatMessage[],
  question:string,
  route:AiHubRoute="auto",
  adapters={
    anthropic:askAiCoach,
    mws:askMwsAiCoach,
  },
):Promise<AiHubReply>{
  const anthropicReady=config.anthropicEnabled!==false&&!!config.anthropicKey;
  const mwsReady=!!(config.mwsKey&&config.mwsProject&&config.mwsModel);
  if(route==="consensus"){
    if(!anthropicReady||!mwsReady)throw new AiCoachError("Консилиум доступен только при включённых Anthropic и MWS GPT",503,{code:"invalid_config",allowFallback:false});
    const draft=await adapters.anthropic(config.anthropicKey!,context,history,question);
    const reviewQuestion=`Вопрос пользователя: ${question}\n\nЧерновик другого AI:\n${draft.answer}${draft.mainRecommendation?`\nГлавная рекомендация: ${draft.mainRecommendation}`:""}\n\nПроверь черновик по контексту. Исправь только фактические противоречия и риски. Верни один короткий итоговый ответ в заданном JSON-формате.`;
    const reply=await adapters.mws(config.mwsKey!,config.mwsProject!,config.mwsModel!,context,[],reviewQuestion);
    return {...reply,provider:"anthropic+mws",routeReason:"consensus"};
  }
  return routeAiHub(config,route,{
    anthropic:(key)=>adapters.anthropic(key,context,history,question),
    mws:(key,project,model)=>adapters.mws(key,project,model,context,history,question),
  });
}
