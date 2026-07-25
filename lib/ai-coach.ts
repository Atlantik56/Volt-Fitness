// Sprint 6.8 — адаптер AI-провайдера для чата с Coach.
// Код только объясняет уже посчитанные показатели через lib/ai-context.ts;
// сам ИИ ничего не считает и не может изменить план без подтверждения пользователя.

import { renderAiCoachContextText, type AiCoachContext } from "./ai-context.ts";

export type AiChatMessage={role:"user"|"assistant";text:string};

export type AiCoachReply={
  answer:string;
  mainRecommendation:string|null;
};

export class AiCoachError extends Error{
  status:number;
  constructor(message:string,status:number){super(message);this.status=status}
}

const SYSTEM_PROMPT=`Ты — VOLT Coach, локальный ИИ-помощник в приложении для похудения и тренировок.
Правила:
- Отвечай только на основе присланного контекста. Не придумывай показатели, которых там нет.
- Если данных не хватает, честно скажи об этом, а не изобретай числа.
- Не ставь диагнозы, не назначай лекарства, не советуй экстремальные диеты.
- Если пользователь описывает боль или тревожные симптомы — посоветуй снизить нагрузку и обратиться к врачу.
- Не меняй план тренировок и не утверждай, что изменил его — только предлагай, окончательное решение за пользователем.
- Отвечай коротко и по делу на понятном русском языке.
- В конце ответа, если уместно, выдели ОДНУ главную рекомендацию.
Формат ответа — строго JSON без markdown-обёртки:
{"answer": "текст ответа", "mainRecommendation": "одна короткая рекомендация или null"}`;

function parseStructuredReply(raw:string):AiCoachReply{
  let jsonText=raw.trim();
  const fence=jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence)jsonText=fence[1].trim();
  let parsed:any;
  try{parsed=JSON.parse(jsonText)}
  catch{throw new AiCoachError("Ответ ИИ не удалось разобрать",502)}
  if(!parsed||typeof parsed.answer!=="string"||!parsed.answer.trim())
    throw new AiCoachError("Ответ ИИ имеет неверный формат",502);
  const mainRecommendation=typeof parsed.mainRecommendation==="string"&&parsed.mainRecommendation.trim()
    ?parsed.mainRecommendation.trim():null;
  return {answer:parsed.answer.trim(),mainRecommendation};
}

export type AnthropicFetch=(url:string,init:RequestInit)=>Promise<Response>;

export async function askAiCoach(
  apiKey:string,
  context:AiCoachContext,
  history:AiChatMessage[],
  question:string,
  fetchImpl:AnthropicFetch=fetch,
):Promise<AiCoachReply>{
  const contextText=renderAiCoachContextText(context);
  const messages=[
    ...history.slice(-10).map(m=>({role:m.role,content:m.text})),
    {role:"user" as const,content:`Контекст пользователя на сегодня (${context.date}):\n${contextText}\n\nВопрос пользователя: ${question}`},
  ];
  let response:Response;
  try{
    response=await fetchImpl("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"content-type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      signal:AbortSignal.timeout(30000),
      body:JSON.stringify({model:"claude-sonnet-5",max_tokens:1000,system:SYSTEM_PROMPT,messages}),
    });
  }catch{
    throw new AiCoachError("Сервис ИИ-тренера не ответил, попробуйте ещё раз",504);
  }
  if(!response.ok)throw new AiCoachError(`Сервис ИИ-тренера недоступен (${response.status})`,502);
  const body=await response.json();
  const text=String((body.content||[]).map((p:any)=>p.text||"").join("\n")).trim();
  if(!text)throw new AiCoachError("Пустой ответ от сервиса ИИ-тренера",502);
  return parseStructuredReply(text);
}
