// Sprint 6.8 — AI Context Builder.
// Собирает компактный контекст для чата с Coach из уже посчитанных показателей.
// Никогда не передаёт всю базу или полную историю: только то, что нужно для ответа.

import { buildCoachResult, type CoachInput, type CoachResult } from "./coach.ts";
import { computeNutritionWeeklyStats, computeWeightWeeklyTrend, type NutritionWeeklyStats, type WeightWeeklyTrend } from "./coach-weekly.ts";
import { phases, meals, rules, safety, currentProgramWeek } from "../app/personal-data.ts";

export type AiCoachContext={
  date:string;
  profile:{name:string;height:number|null;startWeight:number|null;targetWeight:number|null};
  programWeek:number;
  phase:{p:string;n:string;g:string};
  poolActive:boolean;
  weight:CoachResult["summary"]["weight"];
  weightWeekly:WeightWeeklyTrend;
  nutritionToday:CoachResult["summary"]["nutrition"];
  nutritionWeekly:NutritionWeeklyStats;
  targets:CoachResult["summary"]["targets"];
  plan:{title:string;type:string}|null;
  coachDecision:CoachResult["decision"];
  recentWorkouts:{date:string;title:string;type:string;effort:string;painAfter:number|null}[];
};

export function buildAiCoachContext(input:CoachInput):AiCoachContext{
  const result=buildCoachResult(input);
  const measurements=(input.measurements??[]).filter((m:any)=>m&&typeof m.date==="string");
  const foodLogs=input.foodLogs??[];
  const workouts=(input.workouts??[]) as any[];
  const programWeek=currentProgramWeek(input.profile?.programStart);
  const phase=phases[programWeek<=3?0:programWeek<=14?1:2];
  return {
    date:input.date,
    profile:{
      name:typeof input.profile?.name==="string"?input.profile.name:"Пользователь",
      height:Number(input.profile?.height)||null,
      startWeight:Number(input.profile?.startWeight)||null,
      targetWeight:Number(input.profile?.targetWeight)||null,
    },
    programWeek,
    phase:{p:phase.p,n:phase.n,g:phase.g},
    // Фаза «Недели 1–3» — статичная метка, охватывающая все три недели сразу; сама по
    // себе она не говорит модели, что бассейн по вторникам/четвергам уже подключился со
    // 2-й недели (см. app/personal-data.ts, buildHomeWeek) — без этого явного факта
    // модель либо гадает, либо отрицает бассейн даже когда он уже есть в плане.
    poolActive:programWeek>1,
    weight:result.summary.weight,
    weightWeekly:computeWeightWeeklyTrend(measurements,input.date),
    nutritionToday:result.summary.nutrition,
    nutritionWeekly:computeNutritionWeeklyStats(foodLogs,input.date,{calories:result.summary.targets.calories,protein:result.summary.targets.protein}),
    targets:result.summary.targets,
    plan:input.plan??null,
    coachDecision:result.decision,
    // Только последние 5 тренировок — не вся история.
    recentWorkouts:workouts
      .filter(w=>w&&typeof w.date==="string"&&w.date<=input.date)
      .sort((a,b)=>String(b.date).localeCompare(String(a.date)))
      .slice(0,5)
      .map(w=>({date:w.date,title:String(w.title||""),type:String(w.type||""),effort:String(w.effort||""),painAfter:w.painAfter!=null?Number(w.painAfter):null})),
  };
}

// Компактный текстовый пересказ контекста для системного промпта — без сырых полей формы.
export function renderAiCoachContextText(ctx:AiCoachContext):string{
  const lines:string[]=[];
  lines.push(`Пользователь: ${ctx.profile.name}. Рост ${ctx.profile.height??"—"} см. Вес: старт ${ctx.profile.startWeight??"—"} кг, цель ${ctx.profile.targetWeight??"—"} кг.`);
  if(ctx.weight)lines.push(`Текущий вес: ${ctx.weight.current} кг${ctx.weight.deltaSincePrevious!=null?` (изменение с прошлого замера ${ctx.weight.deltaSincePrevious>0?"+":""}${ctx.weight.deltaSincePrevious} кг)`:""}.`);
  else lines.push("Замеров веса пока нет.");
  if(ctx.weightWeekly.avg7d!=null)lines.push(`Средний вес за 7 дней: ${ctx.weightWeekly.avg7d} кг${ctx.weightWeekly.weekChange!=null?`, изменение к предыдущим 7 дням: ${ctx.weightWeekly.weekChange>0?"+":""}${ctx.weightWeekly.weekChange} кг (тренд: ${ctx.weightWeekly.trend})`:" (для сравнения не хватает данных за предыдущую неделю)"}.`);
  if(ctx.nutritionToday.logged)lines.push(`Сегодня записано: ${Math.round(ctx.nutritionToday.calories??0)} ккал из ${ctx.targets.calories}, белка ${Math.round(ctx.nutritionToday.protein??0)} г из ${ctx.targets.protein}.`);
  else lines.push("Питание за сегодня ещё не записано.");
  if(ctx.nutritionWeekly.daysLogged7d>0)lines.push(`За 7 дней в среднем ${ctx.nutritionWeekly.avgCalories7d} ккал и ${ctx.nutritionWeekly.avgProtein7d} г белка (записей: ${ctx.nutritionWeekly.daysLogged7d} из 7), в цель по калориям попадали ${ctx.nutritionWeekly.planAdherencePct}% дней.`);
  lines.push(`Шаблон питания программы: ${meals.map(m=>`${m[0]} — ${m[1]} (${m[2]})`).join("; ")}.`);
  lines.push(ctx.plan?`План на сегодня: «${ctx.plan.title}» (${ctx.plan.type}).`:"На сегодня плана нет.");
  lines.push(`Фаза программы (неделя ${ctx.programWeek}): «${ctx.phase.p}» — ${ctx.phase.n}. Цель фазы: ${ctx.phase.g}.`);
  lines.push(ctx.poolActive?"Бассейн по вторникам и четвергам уже включён в план (действует со 2-й недели программы) вместо ходьбы/велосипеда.":"Бассейн по вторникам и четвергам в план ещё не включён — начнётся со 2-й недели программы; сейчас в эти дни ходьба или велосипед.");
  lines.push(`Ограничение по здоровью: ${safety}`);
  lines.push(`Принципы программы: ${rules.join("; ")}.`);
  if(ctx.coachDecision)lines.push(`Решение VOLT Coach на сегодня: ${ctx.coachDecision.title}. ${ctx.coachDecision.explanation}`);
  if(ctx.recentWorkouts.length){
    lines.push("Последние тренировки:");
    for(const w of ctx.recentWorkouts)lines.push(`- ${w.date}: ${w.title} (${w.type}), усилие «${w.effort||"не указано"}»${w.painAfter!=null?`, боль после ${w.painAfter}/10`:""}.`);
  }else lines.push("Сохранённых тренировок пока нет.");
  return lines.join("\n");
}
