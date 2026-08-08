"use client";

// VOLT 2.0 — единое пространство «Аналитика + AI Coach».
// Здесь нет собственных API или расчётов: экран компонует уже загруженные
// данные /api/fitness, детерминированную training analytics model и существующий
// Coach chat поверх /api/coach-chat.

import { useMemo, useState } from "react";
import {
  Activity, Apple, CalendarCheck2, ChartNoAxesCombined, ChevronRight, Dumbbell,
  Moon, Scale, Sparkles, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { buildHomeWeek } from "./personal-data";
import { CoachChatPanel } from "./coach-chat-panel";
import type { CoachResult } from "../lib/coach";
import {
  ANALYTICS_PERIOD_LABELS, ANALYTICS_PERIODS,
  buildWorkoutsCsv, buildWorkoutsJson, computePeriodSummary,
  groupVolumeByPeriod, type AnalyticsPeriod, type WorkoutRecord,
} from "./training-analytics-model";

type Plan={title:string;type:string};
type InsightTone="good"|"neutral"|"warn";
type Insight={id:string;title:string;summary:string;evidence:string;tone:InsightTone;icon:React.ReactNode};
type Metric={label:string;value:string;meta:string;tone?:InsightTone;icon:React.ReactNode};

const numberRu=(value:number,maximumFractionDigits=1)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits}).format(value);
const shortDate=(iso:string)=>new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"}).format(new Date(`${iso}T12:00:00`)).replace(".","");

function downloadText(filename:string,content:string,mime:string){
 const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}

function average(values:number[]){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null}

export function AnalyticsCoachPage({
 data,coach,today,plan,originalPlan,planChanged,changeReasonCode,mode,onModeChange,onFoodSaved,onStartWorkout,onOpenNutrition,
}:{
 data:any;coach:CoachResult;today:string;plan:Plan|null;originalPlan:Plan|null;planChanged:boolean;changeReasonCode:string;
 mode:"insights"|"coach";onModeChange:(mode:"insights"|"coach")=>void;
 onFoodSaved:()=>void;onStartWorkout:()=>void;onOpenNutrition:()=>void;
}){
 const [period,setPeriod]=useState<AnalyticsPeriod>("3M");
 const workouts=useMemo(()=>(data.workouts||[]) as WorkoutRecord[],[data.workouts]);
 const planDays=useMemo(()=>buildHomeWeek(data.profile?.programStart).map(day=>({day:day.day,type:day.type})),[data.profile?.programStart]);
 const anchor=useMemo(()=>new Date(),[]);
 const summary=useMemo(()=>computePeriodSummary(workouts,planDays,period,anchor,data.scheduleOverrides||[],data.weekScheduleChanges||[]),[workouts,planDays,period,anchor,data.scheduleOverrides,data.weekScheduleChanges]);
 const inPeriod=useMemo(()=>workouts.filter(workout=>workout.date>=summary.fromDate&&workout.date<=summary.toDate),[workouts,summary.fromDate,summary.toDate]);
 const measurements=useMemo(()=>[...(data.measurements||[])].filter((item:any)=>item.date>=summary.fromDate&&item.date<=summary.toDate&&Number(item.weight)>0).sort((a:any,b:any)=>a.date.localeCompare(b.date)),[data.measurements,summary.fromDate,summary.toDate]);
 const foodLogs=useMemo(()=>(data.foodLogs||[]).filter((item:any)=>item.date>=summary.fromDate&&item.date<=summary.toDate),[data.foodLogs,summary.fromDate,summary.toDate]);
 const activityRows=useMemo(()=>(data.activity||[]).filter((item:any)=>item.date>=summary.fromDate&&item.date<=summary.toDate),[data.activity,summary.fromDate,summary.toDate]);
 const strengthLogs=useMemo(()=>(data.strengthLogs||[]).filter((item:any)=>item.date>=summary.fromDate&&item.date<=summary.toDate),[data.strengthLogs,summary.fromDate,summary.toDate]);
 const granularity=period==="4W"?"week":"month";
 const volume=useMemo(()=>groupVolumeByPeriod(inPeriod,granularity),[inPeriod,granularity]);

 const currentWeight=measurements.at(-1)?.weight??(data.measurements||[])[0]?.weight??null;
 const firstWeight=measurements[0]?.weight??null;
 const weightDelta=measurements.length>=2&&currentWeight!=null&&firstWeight!=null?Number(currentWeight)-Number(firstWeight):null;
 const foodDays=new Set(foodLogs.map((item:any)=>item.date)).size;
 const avgCalories=foodDays?foodLogs.reduce((sum:number,item:any)=>sum+Number(item.calories||0),0)/foodDays:null;
 const sleepValues=activityRows.map((item:any)=>Number(item.sleepHours||0)).filter((value:number)=>value>0);
 const avgSleep=average(sleepValues);
 const totalMinutes=Math.round(inPeriod.reduce((sum,workout)=>sum+Number(workout.durationSeconds||0),0)/60);

 const strengthImprovement=useMemo(()=>{
  const grouped=new Map<string,any[]>();
  for(const log of strengthLogs){const list=grouped.get(log.exercise)||[];list.push(log);grouped.set(log.exercise,list)}
  const changes=[...grouped].map(([exercise,logs])=>{
   const sorted=[...logs].sort((a,b)=>a.date.localeCompare(b.date));
   const first=Number(sorted[0]?.weight||0),last=Number(sorted.at(-1)?.weight||0);
   return {exercise,first,last,delta:last-first,entries:sorted.length};
  }).filter(item=>item.entries>1&&item.first>0&&item.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return changes[0]||null;
 },[strengthLogs]);

 const metrics:Metric[]=[
  {label:"Выполнение плана",value:summary.planCompletionPct==null?"—":`${summary.planCompletionPct}%`,meta:summary.planCompletionPct==null?"нет плановых дней":`${summary.totalWorkouts} тренировок · ${summary.expectedTrainingDays} плановых дней`,tone:summary.planCompletionPct!=null&&summary.planCompletionPct>=80?"good":"neutral",icon:<CalendarCheck2 size={17}/>},
  {label:"Тренировки",value:String(summary.totalWorkouts),meta:`${totalMinutes} мин за период`,icon:<Dumbbell size={17}/>},
  {label:"Вес",value:currentWeight==null?"—":`${numberRu(Number(currentWeight))} кг`,meta:weightDelta==null?"нужно 2 замера":`${weightDelta>0?"+":""}${numberRu(weightDelta)} кг за период`,tone:weightDelta!=null&&weightDelta<0?"good":weightDelta!=null&&weightDelta>0?"warn":"neutral",icon:<Scale size={17}/>},
  {label:"Питание",value:avgCalories==null?"—":`${numberRu(avgCalories,0)} ккал`,meta:avgCalories==null?"нет записей":`среднее за ${foodDays} ${foodDays===1?"день":"дней"}`,icon:<Apple size={17}/>},
 ];

 const insights=useMemo<Insight[]>(()=>{
  const items:Insight[]=[];
  if(summary.planCompletionPct!=null)items.push({id:"plan",title:summary.planCompletionPct>=80?"План выполняется устойчиво":summary.planCompletionPct>=50?"План выполняется частично":"План требует более ровного ритма",summary:`Выполнено ${summary.planCompletionPct}% плановых тренировок за выбранный период.`,evidence:`${summary.totalWorkouts} тренировок · ${summary.activeWeeks} из ${summary.totalWeeks} активных недель`,tone:summary.planCompletionPct>=80?"good":summary.planCompletionPct>=50?"neutral":"warn",icon:<Target size={20}/>});
  if(weightDelta!=null)items.push({id:"weight",title:weightDelta<0?"Вес снижается":"Вес изменился за период",summary:`От ${numberRu(Number(firstWeight))} до ${numberRu(Number(currentWeight))} кг.`,evidence:`${weightDelta>0?"+":""}${numberRu(weightDelta)} кг · ${measurements.length} замеров`,tone:weightDelta<0?"good":weightDelta>0?"warn":"neutral",icon:weightDelta<=0?<TrendingDown size={20}/>:<TrendingUp size={20}/>});
  if(strengthImprovement)items.push({id:"strength",title:strengthImprovement.delta>0?"Рабочий вес вырос":"Рабочий вес снизился",summary:`${strengthImprovement.exercise}: ${numberRu(strengthImprovement.first)} → ${numberRu(strengthImprovement.last)} кг.`,evidence:`${strengthImprovement.delta>0?"+":""}${numberRu(strengthImprovement.delta)} кг по сохранённым подходам`,tone:strengthImprovement.delta>0?"good":"neutral",icon:<Dumbbell size={20}/>});
  if(avgCalories!=null)items.push({id:"food",title:"Питание регулярно фиксируется",summary:`Среднее по записанным дням — ${numberRu(avgCalories,0)} ккал.`,evidence:`${foodLogs.length} приёмов пищи · ${foodDays} дней с данными`,tone:"neutral",icon:<Apple size={20}/>});
  if(avgSleep!=null)items.push({id:"sleep",title:"Сон доступен для анализа",summary:`Среднее значение — ${numberRu(avgSleep)} ч по заполненным дням.`,evidence:`${sleepValues.length} дней с данными · без вывода о причинности`,tone:avgSleep>=7?"good":avgSleep<6?"warn":"neutral",icon:<Moon size={20}/>});
  if(!items.length)items.push({id:"empty",title:"Пока недостаточно данных для тренда",summary:"Добавляй тренировки, замеры или питание — Analytics покажет только подтверждённые изменения.",evidence:"Синтетические показатели не используются",tone:"neutral",icon:<Sparkles size={20}/>});
  return items.slice(0,5);
 },[summary,weightDelta,firstWeight,currentWeight,measurements.length,strengthImprovement,avgCalories,foodLogs.length,foodDays,avgSleep,sleepValues.length]);

 const maxSessions=Math.max(1,...volume.map(bucket=>bucket.strengthSessions+bucket.cardioSessions));
 const periodLabel=`${shortDate(summary.fromDate)} — ${shortDate(summary.toDate)}`;
 const coachSuggestions=["Почему изменился мой вес?","Что видно по выполнению плана?","Проанализируй питание","Что изменить в тренировках?"];

 return <div className="analytics-coach-page">
  <header className="analytics-page-heading">
   <div><h1>Аналитика</h1><p>Понимай. Действуй. Прогрессируй.</p></div>
   <div className="analytics-heading-actions">
    <div className="analytics-period-select" role="group" aria-label="Период аналитики">{ANALYTICS_PERIODS.map(item=><button type="button" key={item} className={period===item?"active":""} onClick={()=>setPeriod(item)}>{ANALYTICS_PERIOD_LABELS[item]}</button>)}</div>
    <div className="analytics-export-menu"><span>{periodLabel}</span><button type="button" onClick={()=>downloadText(`volt-workouts-${summary.fromDate}_${summary.toDate}.csv`,buildWorkoutsCsv(inPeriod),"text/csv")}>CSV</button><button type="button" onClick={()=>downloadText(`volt-workouts-${summary.fromDate}_${summary.toDate}.json`,buildWorkoutsJson(inPeriod),"application/json")}>JSON</button></div>
   </div>
  </header>

  <div className="analytics-mode-tabs" role="tablist" aria-label="Аналитика и AI Coach">
   <button type="button" role="tab" aria-selected={mode==="insights"} className={mode==="insights"?"active":""} onClick={()=>onModeChange("insights")}><Sparkles size={17}/>Инсайты</button>
   <button type="button" role="tab" aria-selected={mode==="coach"} className={mode==="coach"?"active":""} onClick={()=>onModeChange("coach")}><Activity size={17}/>AI Coach</button>
  </div>

  <div className={`analytics-coach-layout mode-${mode}`}>
   <section className="analytics-insights-column" aria-label="Инсайты и динамика">
    <div className="analytics-metric-strip">{metrics.map(metric=><article key={metric.label} className={metric.tone?`tone-${metric.tone}`:""}><span>{metric.icon}{metric.label}</span><b>{metric.value}</b><small>{metric.meta}</small></article>)}</div>

    <section className="analytics-insights-panel">
     <header><div><p className="eyebrow">КЛЮЧЕВЫЕ ИНСАЙТЫ</p><h2>Что меняется сейчас</h2></div><span>{periodLabel}</span></header>
     <div className="analytics-insight-list">{insights.map(insight=><article key={insight.id} className={`tone-${insight.tone}`}><span className="analytics-insight-icon">{insight.icon}</span><div><h3>{insight.title}</h3><p>{insight.summary}</p><small>{insight.evidence}</small></div><ChevronRight size={17}/></article>)}</div>
    </section>

    <section className="analytics-trends-panel">
     <header><div><p className="eyebrow">ДИНАМИКА ЗА ПЕРИОД</p><h2>Как держится тренировочный ритм</h2></div><span>{granularity==="week"?"По неделям":"По месяцам"}</span></header>
     {volume.length?<figure className="analytics-volume-chart" aria-label="Количество тренировок по периодам">
      <div>{volume.map(bucket=>{const sessions=bucket.strengthSessions+bucket.cardioSessions;return <span key={bucket.key} title={`${bucket.key}: ${sessions} тренировок`}><i style={{height:`${Math.max(8,sessions/maxSessions*100)}%`}}/><small>{bucket.key.slice(5)||bucket.key}</small></span>})}</div>
      <figcaption>Столбцы показывают только фактически сохранённые тренировки. За период: {summary.totalWorkouts}, активное время — {totalMinutes} мин.</figcaption>
     </figure>:<div className="analytics-empty-chart"><ChartNoAxesCombined size={28}/><p>За выбранный период тренировок нет. График не заполняется искусственными значениями.</p></div>}
    </section>
   </section>

   <aside className="analytics-coach-column" aria-label="AI Coach">
    <div className="analytics-coach-identity"><span><Sparkles size={22}/></span><div><h2>AI Coach <i>online</i></h2><p>Персональный тренер, который объясняет данные VOLT и предлагает следующий шаг.</p></div></div>
    <CoachChatPanel
     open embedded onClose={()=>onModeChange("insights")} plan={plan} originalPlan={originalPlan} planChanged={planChanged}
     changeReasonCode={changeReasonCode} today={today} onFoodSaved={onFoodSaved} suggestedQuestions={coachSuggestions}
     quickActions={[{label:"Начать тренировку",icon:"▶",onClick:onStartWorkout},{label:"Открыть питание",icon:"◉",onClick:onOpenNutrition}]}
    />
    <div className="analytics-coach-facts"><small>Решение на сегодня</small><p>{coach.decision?.explanation||coach.advice?.[0]?.reason||"Coach ждёт сохранённые данные дня и не придумывает показатели."}</p></div>
   </aside>
  </div>
 </div>;
}
