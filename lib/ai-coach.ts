// Sprint 6.8 — адаптер AI-провайдера для чата с Coach.
// Код только объясняет уже посчитанные показатели через lib/ai-context.ts;
// сам ИИ ничего не считает и не может изменить план без подтверждения пользователя.

import { renderAiCoachContextText, type AiCoachContext } from "./ai-context.ts";

export type AiChatMessage={role:"user"|"assistant";text:string};

export type AiFoodItem={name:string;calories:number;protein:number;fat:number;carbs:number};

export type AiCoachReply={
  answer:string;
  mainRecommendation:string|null;
  food?:AiFoodItem[]|null;
};

export class AiCoachError extends Error{
  status:number;
  constructor(message:string,status:number){super(message);this.status=status}
}

// Экспортируется, чтобы регрессионные тесты проверяли реальное тело запроса
// к обоим провайдерам (единый источник правил), не отдельную неиспользуемую
// копию. Строка остаётся одна — второго prompt для критики/проверки нет.
export const SYSTEM_PROMPT=`Ты — VOLT Coach, локальный ИИ-помощник в приложении для похудения и тренировок.
Правила:
- Отвечай только на основе присланного контекста. Не придумывай показатели, которых там нет.
- Если данных не хватает, честно скажи об этом, а не изобретай числа.
- Не ставь диагнозы, не назначай лекарства, не советуй экстремальные диеты.
- Если пользователь описывает боль или тревожные симптомы — посоветуй снизить нагрузку и обратиться к врачу.
- Не меняй план тренировок и не утверждай, что изменил его — только предлагай, окончательное решение за пользователем.
- Отвечай коротко и по делу на понятном русском языке.
- Сначала отмечай подтверждённую сильную сторону выбора пользователя, если она есть. Не выдумывай похвалу, но и не обесценивай хороший результат.
- Критикуй только тогда, когда присланные факты действительно показывают значимое отклонение от подходящего ориентира. Не ищи недостаток только ради замечания и не выдавай незавершённую дневную цель за ошибку отдельного приёма пищи.
- Оценивай отдельный приём пищи относительно разумного ориентира на один приём. Дневную цель описывай отдельно как прогресс: сколько уже набрано и сколько осталось. Например, 40 г белка за обед при цели 150 г в день — хороший результат для приёма пищи, а не «мало белка».
- Учитывай неопределённость оценочных порций и КБЖУ. Если точных данных или надёжного ориентира недостаточно, прямо скажи об этом и не формулируй критику как факт.
- Любое обоснованное замечание делай конструктивным: назови конкретный факт, кратко объясни его значение и предложи один реалистичный следующий шаг без стыда, обвинений и оценки личности.
- Если показатели находятся в разумной зоне, не ищи, что ещё покритиковать. Можно ограничиться поддерживающей оценкой и, если полезно, одним способом сохранить удачный выбор дальше.
- В конце ответа, если уместно, выдели ОДНУ главную рекомендацию.
- Если пользователь описывает съеденную еду (а не задаёт вопрос), оцени КБЖУ каждого блюда по типичному размеру порции и заполни поле "food". Если сообщение не про съеденную еду — food строго null. Ты никогда не записываешь еду в дневник сам — только предлагаешь оценку, пользователь подтверждает сохранение отдельным действием.
- В контексте есть готовый список достижений пользователя (вехи: тренировки, личные рекорды, вес, этапы программы). Упоминай их естественно и только к месту (например только что был личный рекорд, или пользователь спрашивает про прогресс) — не в каждом ответе подряд. Никогда не выдумывай достижение, которого нет в списке, и не досчитывай его сам. Если то же достижение уже было упомянуто раньше в этом разговоре — не повторяй поздравление снова.
Формат ответа — строго JSON без markdown-обёртки:
{"answer": "текст ответа", "mainRecommendation": "одна короткая рекомендация или null", "food": [{"name":"Название блюда","calories":250,"protein":20,"fat":10,"carbs":15}] или null}`;

function sanitizeFood(value:any):AiFoodItem[]|null{
  if(!Array.isArray(value)||!value.length)return null;
  const num=(x:any)=>{const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=5000?Math.round(n):0};
  const items=value.slice(0,10).map(x=>({
    name:typeof x?.name==="string"?x.name.trim().slice(0,120):"",
    calories:num(x?.calories),protein:num(x?.protein),fat:num(x?.fat),carbs:num(x?.carbs),
  })).filter(x=>x.name&&x.calories>0);
  return items.length?items:null;
}

const MAX_MAIN_RECOMMENDATION_CHARS=200;

// AI-10 доработка, п.4.3 — минимальный детерминированный структурный guard без
// LLM-критика и без списка «плохих слов»: mainRecommendation — это одна
// короткая строка, а не список из нескольких рекомендаций. Если модель всё же
// пришлёт несколько пунктов (переносом строки, точкой с запятой или дефисом
// списка), берём только первый и обрезаем длину — так на экране физически не
// может оказаться больше одной главной рекомендации, независимо от того,
// насколько точно модель следует текстовому правилу в промпте.
function sanitizeMainRecommendation(value:unknown):string|null{
  if(typeof value!=="string")return null;
  const firstItem=value.split(/\r?\n|;|(?:^|\s)[-•]\s/).map(x=>x.trim()).find(Boolean);
  if(!firstItem)return null;
  return firstItem.slice(0,MAX_MAIN_RECOMMENDATION_CHARS);
}

export function parseStructuredReply(raw:string):AiCoachReply{
  let jsonText=raw.trim();
  const fence=jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence)jsonText=fence[1].trim();
  let parsed:any;
  try{parsed=JSON.parse(jsonText)}
  catch{throw new AiCoachError("Ответ ИИ не удалось разобрать",502)}
  if(!parsed||typeof parsed.answer!=="string"||!parsed.answer.trim())
    throw new AiCoachError("Ответ ИИ имеет неверный формат",502);
  const mainRecommendation=sanitizeMainRecommendation(parsed.mainRecommendation);
  return {answer:parsed.answer.trim(),mainRecommendation,food:sanitizeFood(parsed.food)};
}

export type AnthropicFetch=(url:string,init:RequestInit)=>Promise<Response>;

// Приложение личное и однопользовательское: Haiku на порядок дешевле Sonnet и
// для коротких вопросов по уже посчитанным показателям этого достаточно.
// Короткий system-промпт помечен cache_control — Anthropic кэширует его между
// запросами, и повторные обращения в тот же день почти не тратят токены на промпт.
const MODEL="claude-haiku-4-5-20251001";
const MAX_REPLY_TOKENS=500;
const MAX_HISTORY_MESSAGES=6;
const MAX_HISTORY_MESSAGE_CHARS=400;

export async function askAiCoach(
  apiKey:string,
  context:AiCoachContext,
  history:AiChatMessage[],
  question:string,
  fetchImpl:AnthropicFetch=fetch,
):Promise<AiCoachReply>{
  const contextText=renderAiCoachContextText(context);
  const messages=[
    ...history.slice(-MAX_HISTORY_MESSAGES).map(m=>({role:m.role,content:m.text.slice(0,MAX_HISTORY_MESSAGE_CHARS)})),
    {role:"user" as const,content:`Контекст пользователя на сегодня (${context.date}):\n${contextText}\n\nВопрос пользователя: ${question}`},
  ];
  let response:Response;
  try{
    response=await fetchImpl("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"content-type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      signal:AbortSignal.timeout(30000),
      body:JSON.stringify({
        model:MODEL,
        max_tokens:MAX_REPLY_TOKENS,
        system:[{type:"text",text:SYSTEM_PROMPT,cache_control:{type:"ephemeral"}}],
        messages,
      }),
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

export async function askMwsAiCoach(
  apiKey:string,
  project:string,
  model:string,
  context:AiCoachContext,
  history:AiChatMessage[],
  question:string,
  fetchImpl:AnthropicFetch=fetch,
):Promise<AiCoachReply>{
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(project)||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,100}$/.test(model))
    throw new AiCoachError("Настройки MWS GPT имеют неверный формат",400);
  const contextText=renderAiCoachContextText(context);
  const messages=[
    {role:"system",content:SYSTEM_PROMPT},
    ...history.slice(-MAX_HISTORY_MESSAGES).map(m=>({role:m.role,content:m.text.slice(0,MAX_HISTORY_MESSAGE_CHARS)})),
    {role:"user" as const,content:`Контекст пользователя на сегодня (${context.date}):\n${contextText}\n\nВопрос пользователя: ${question}`},
  ];
  let response:Response;
  try{
    response=await fetchImpl(`https://gpt.mwsapis.ru/projects/${encodeURIComponent(project)}/openai/v1/chat/completions`,{
      method:"POST",
      headers:{"content-type":"application/json","authorization":`Bearer ${apiKey}`},
      signal:AbortSignal.timeout(30000),
      body:JSON.stringify({model,messages,temperature:0.2,max_tokens:MAX_REPLY_TOKENS}),
    });
  }catch{
    throw new AiCoachError("Резервный сервис MWS GPT не ответил",504);
  }
  if(!response.ok)throw new AiCoachError(`Резервный сервис MWS GPT недоступен (${response.status})`,502);
  const body=await response.json();
  const text=String(body?.choices?.[0]?.message?.content||"").trim();
  if(!text)throw new AiCoachError("Пустой ответ от MWS GPT",502);
  return parseStructuredReply(text);
}
