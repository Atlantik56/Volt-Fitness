import { AiCoachError, askAiCoach, askMwsAiCoach, type AiChatMessage, type AiCoachReply } from "./ai-coach.ts";
import type { AiCoachContext } from "./ai-context.ts";

export type AiHubProvider="anthropic"|"mws";
export type AiHubRoute="auto"|AiHubProvider;
export type AiHubReply=AiCoachReply&{provider:AiHubProvider;routeReason:"primary"|"primary_unavailable"|"fallback"};
export type AiHubConfig={
  anthropicKey?:string|null;
  mwsKey?:string|null;
  mwsProject?:string|null;
  mwsModel?:string|null;
};

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
  const mwsReady=!!(config.mwsKey&&config.mwsProject&&config.mwsModel);
  if(route==="anthropic"){
    if(!config.anthropicKey)throw new AiCoachError("Anthropic не настроен",503);
    const reply=await adapters.anthropic(config.anthropicKey,context,history,question);
    return {...reply,provider:"anthropic",routeReason:"primary"};
  }
  if(route==="mws"){
    if(!mwsReady)throw new AiCoachError("MWS GPT не настроен",503);
    const reply=await adapters.mws(config.mwsKey!,config.mwsProject!,config.mwsModel!,context,history,question);
    return {...reply,provider:"mws",routeReason:"primary"};
  }
  if(config.anthropicKey){
    try{
      const reply=await adapters.anthropic(config.anthropicKey,context,history,question);
      return {...reply,provider:"anthropic",routeReason:"primary"};
    }catch(error){
      if(!mwsReady||!(error instanceof AiCoachError)||error.status<500)throw error;
      const reply=await adapters.mws(config.mwsKey!,config.mwsProject!,config.mwsModel!,context,history,question);
      return {...reply,provider:"mws",routeReason:"fallback"};
    }
  }
  if(mwsReady){
    const reply=await adapters.mws(config.mwsKey!,config.mwsProject!,config.mwsModel!,context,history,question);
    return {...reply,provider:"mws",routeReason:"primary_unavailable"};
  }
  throw new AiCoachError("AI Hub не настроен: добавьте ключ Anthropic или MWS GPT",503);
}
