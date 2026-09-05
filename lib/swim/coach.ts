import { z } from "zod";
import type { SwimAnalyticsData, SwimHomeData, SwimRecordsData } from "@/app/swim/types";

export type SwimCoachFact={id:string;label:string;value:string};
export type SwimCoachContext={date:string;hasHistory:boolean;facts:SwimCoachFact[];nextWorkout:SwimHomeData["nextWorkout"];unavailable:string[]};

const observationSchema=z.object({title:z.string().trim().min(1).max(80),text:z.string().trim().min(1).max(280),evidenceIds:z.array(z.string()).min(1).max(3)});
const briefingSchema=z.object({
  currentSummary:z.string().trim().min(1).max(500),
  guidance:z.object({recommendation:z.string().trim().min(1).max(300),primaryFocus:z.string().trim().min(1).max(120),adjustment:z.string().trim().max(220).nullable()}),
  observations:z.array(observationSchema).max(3),
});
export type SwimCoachBriefing=z.infer<typeof briefingSchema>;
export type SwimCoachResponse={context:SwimCoachContext;briefing:SwimCoachBriefing;source:"ai"|"fallback";fallbackReason:"provider_unavailable"|"provider_error"|"invalid_output"|null};

const duration=(seconds:number)=>seconds>=3600?`${Math.floor(seconds/3600)} ч ${Math.round(seconds%3600/60)} мин`:`${Math.round(seconds/60)} мин`;
const distance=(meters:number)=>meters>=1000?`${(meters/1000).toLocaleString("ru-RU",{maximumFractionDigits:1})} км`:`${Math.round(meters)} м`;

export function buildSwimCoachContext(date:string,analytics:SwimAnalyticsData,records:SwimRecordsData,home:SwimHomeData):SwimCoachContext{
  const facts:SwimCoachFact[]=[];
  if(analytics.workoutCount>0)facts.push({id:"recent_frequency",label:"Частота за 30 дней",value:`${analytics.workoutCount} заплывов`});
  if(analytics.distanceMeters>0)facts.push({id:"recent_volume",label:"Объём за 30 дней",value:distance(analytics.distanceMeters)});
  if(analytics.durationSeconds>0)facts.push({id:"recent_duration",label:"Время за 30 дней",value:duration(analytics.durationSeconds)});
  if(analytics.avgPaceLabel)facts.push({id:"recent_pace",label:"Средний темп за 30 дней",value:`${analytics.avgPaceLabel} /100 м`});
  if(analytics.avgHeartRate)facts.push({id:"recent_hr",label:"Средний пульс",value:`${analytics.avgHeartRate} уд/мин`});
  if(analytics.calories)facts.push({id:"recent_calories",label:"Калории",value:`${analytics.calories} ккал`});
  if(records.largestSwim)facts.push({id:"distance_record",label:"Рекорд дистанции",value:`${distance(records.largestSwim.value)}, ${records.largestSwim.date}`});
  if(records.fastestPace)facts.push({id:"pace_record",label:"Рекорд темпа",value:`${duration(records.fastestPace.value)} /100 м, ${records.fastestPace.date}`});
  if(home.nextWorkout)facts.push({id:"next_session",label:"Следующая тренировка",value:`${home.nextWorkout.title}, ${distance(home.nextWorkout.distanceMeters)}, около ${home.nextWorkout.estimatedMinutes} мин`});
  const unavailable=[!analytics.avgHeartRate&&"Пульс",!analytics.calories&&"Калории","SWOLF","Частота и тип гребков"].filter(Boolean) as string[];
  return {date,hasHistory:analytics.hasAnyHistory,facts,nextWorkout:home.nextWorkout,unavailable};
}

export function buildSwimCoachFallback(context:SwimCoachContext):SwimCoachBriefing{
  if(!context.hasHistory)return {
    currentSummary:"Подтверждённых заплывов пока нет — честный разбор прогресса ещё невозможен.",
    guidance:{recommendation:context.nextWorkout?`Следующая тренировка — «${context.nextWorkout.title}». Выполни её по плану и сохрани фактические результаты.`:"Открой план и заверши первую тренировку, чтобы Coach получил фактическую точку отсчёта.",primaryFocus:"Зафиксировать первый результат",adjustment:null},
    observations:[],
  };
  const byId=new Map(context.facts.map(f=>[f.id,f]));
  const summary=[byId.get("recent_frequency"),byId.get("recent_volume"),byId.get("recent_pace"),byId.get("recent_duration")].filter(Boolean).map(f=>`${f!.label}: ${f!.value}`).join(" · ");
  const observations:SwimCoachBriefing["observations"]=[];
  const volume=byId.get("recent_volume"); if(volume)observations.push({title:"Текущий объём",text:`За последние 30 дней зафиксировано ${volume.value}. Это факт журнала, не оценка нагрузки.`,evidenceIds:[volume.id]});
  const record=byId.get("distance_record"); if(record)observations.push({title:"Ориентир дистанции",text:`Лучший подтверждённый результат: ${record.value}.`,evidenceIds:[record.id]});
  const next=context.nextWorkout;
  return {
    currentSummary:summary||"В истории есть заплывы, но для сводки не хватает записанных дистанции, времени и темпа.",
    guidance:{recommendation:next?`Пройди «${next.title}» по текущему плану: ${distance(next.distanceMeters)}, около ${next.estimatedMinutes} мин.`:"Следуй следующей доступной тренировке из плана без автоматического увеличения нагрузки.",primaryFocus:next?next.goal:"Сохранить регулярность",adjustment:context.facts.length<4?"Записывай дистанцию и время: без них Coach не сможет сравнить темп и объём.":null},
    observations:observations.slice(0,3),
  };
}

export function parseSwimCoachBriefing(value:unknown,context:SwimCoachContext):SwimCoachBriefing{
  const parsed=briefingSchema.parse(value);
  const allowed=new Set(context.facts.map(f=>f.id));
  if(parsed.observations.some(item=>item.evidenceIds.some(id=>!allowed.has(id))))throw new Error("Unknown evidence id");
  return parsed;
}

export function parseSwimCoachReply(raw:string,context:SwimCoachContext):SwimCoachBriefing{
  const fenced=raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/i);
  return parseSwimCoachBriefing(JSON.parse(fenced?.[1] ?? raw),context);
}

export function swimCoachPrompt(context:SwimCoachContext):string{
  return `Составь короткий брифинг RITMOVIS Swim Coach на русском. Используй только факты ниже. Не оценивай технику без SWOLF/гребков, не ставь диагнозы и не называй восстановление или перетренированность фактом. Наблюдений максимум 3; каждое обязано ссылаться на evidenceIds из facts. Факты и предложения различай явно. Верни только JSON: {"currentSummary":"...","guidance":{"recommendation":"...","primaryFocus":"...","adjustment":null},"observations":[{"title":"...","text":"...","evidenceIds":["..."]}]}.\n${JSON.stringify(context)}`;
}
