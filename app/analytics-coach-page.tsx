"use client";

// Analytics 6A is a projection of the server-built, provider-neutral DTO.
// This component formats values; it does not reconstruct plans, classify sports,
// or aggregate raw workout rows in React.

import { useMemo, useState } from "react";
import { Activity, Bike, CalendarCheck2, ChartNoAxesCombined, ChevronRight, Clock3, Database, Dumbbell, RefreshCw, Sparkles, Target, Waves } from "lucide-react";
import { CoachChatPanel } from "./coach-chat-panel";
import type { CoachResult } from "../lib/coach";
import type { AnalyticsBundle, AnalyticsOverview, AnalyticsRange, AnalyticsTrendPoint, MetricComparison } from "../lib/analytics-core";
import { buildWorkoutsCsv, buildWorkoutsJson, type WorkoutRecord } from "./training-analytics-model";

type Plan={title:string;type:string};
type Metric={label:string;value:string;meta:string;tone?:"good"|"neutral"|"warn";icon:React.ReactNode};
const DISPLAY_RANGES:AnalyticsRange[]=["current_week","4_weeks","8_weeks","12_weeks","current_month"];
const numberRu=(value:number,digits=1)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:digits}).format(value);
const shortDate=(iso:string)=>new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"}).format(new Date(`${iso}T12:00:00`)).replace(".","");
const pluralRu=(value:number,one:string,few:string,many:string)=>{const mod100=Math.abs(value)%100,mod10=mod100%10;return mod100>=11&&mod100<=14?many:mod10===1?one:mod10>=2&&mod10<=4?few:many};
const rangeLabels:Record<AnalyticsRange,string>={current_week:"Неделя",previous_week:"Прошлая", "4_weeks":"4 недели","8_weeks":"8 недель","12_weeks":"12 недель",current_month:"Месяц",previous_month:"Прошлый месяц"};

function comparisonText(comparison:MetricComparison|null){
 if(!comparison||comparison.state==="no_data")return "нет данных для сравнения";
 if(comparison.state==="new")return "новое значение к прошлому периоду";
 if(comparison.state==="same")return "без изменений к прошлому периоду";
 if(comparison.percentChange!==null)return `${comparison.percentChange>0?"+":""}${numberRu(comparison.percentChange)}% к прошлому периоду`;
 return `${comparison.delta>0?"+":""}${numberRu(comparison.delta)} к прошлому периоду`;
}

function downloadText(filename:string,content:string,mime:string){
 const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}

function TrendChart({title,unit,points,valueOf,tone="lime"}:{title:string;unit:string;points:AnalyticsTrendPoint[];valueOf:(point:AnalyticsTrendPoint)=>number;tone?:"lime"|"blue"|"violet"}){
 const values=points.map(valueOf),max=Math.max(0,...values);
 if(max<=0)return <article className="analytics-mini-chart is-empty"><h3>{title}</h3><p>Нет данных за период</p></article>;
 return <article className={`analytics-mini-chart tone-${tone}`}><h3>{title}</h3><div role="img" aria-label={`${title}: ${points.map((point,index)=>`${point.label} — ${numberRu(values[index])} ${unit}`).join(", ")}`}>{points.map((point,index)=><span key={`${point.from}-${title}`} tabIndex={0} aria-label={`${point.from}–${point.to}: ${numberRu(values[index])} ${unit}`} data-tooltip={`${numberRu(values[index])} ${unit}`}><i style={{height:`${Math.max(6,values[index]/max*100)}%`}}/><small>{point.label}</small></span>)}</div><p>Максимум: {numberRu(max)} {unit}</p></article>;
}

function AnalyticsState({status,onRetry}:{status:"loading"|"error";onRetry:()=>void}){
 return <section className={`analytics-state analytics-state-${status}`} role={status==="error"?"alert":"status"} aria-live="polite" aria-busy={status==="loading"}>{status==="loading"?<><span className="analytics-state-spinner"/><h2>Собираем аналитику</h2><p>Нормализуем подтверждённые тренировки и план.</p></>:<><ChartNoAxesCombined size={30}/><h2>Не удалось загрузить аналитику</h2><p>Данные не заменены нулями. Проверьте соединение и повторите запрос.</p><button type="button" onClick={onRetry}><RefreshCw size={15}/>Повторить</button></>}</section>;
}

export function AnalyticsCoachPage({data,analyticsStatus,onRetry,coach,today,plan,originalPlan,planChanged,changeReasonCode,mode,onModeChange,onFoodSaved,onStartWorkout,onOpenNutrition}:{
 data:any;analyticsStatus:"loading"|"ready"|"error";onRetry:()=>void;coach:CoachResult;today:string;plan:Plan|null;originalPlan:Plan|null;planChanged:boolean;changeReasonCode:string;mode:"insights"|"coach";onModeChange:(mode:"insights"|"coach")=>void;onFoodSaved:()=>void;onStartWorkout:()=>void;onOpenNutrition:()=>void;
}){
 const bundle=data.analytics as AnalyticsBundle|undefined;
 const [period,setPeriod]=useState<AnalyticsRange>(bundle?.defaultRange??"4_weeks");
 const summary:AnalyticsOverview|undefined=bundle?.ranges?.[period];
 const exportRows=useMemo(()=>summary?(data.workouts||[]).filter((item:any)=>item.externalActivitySource!=="strava"&&item.date>=summary.period.from&&item.date<=summary.period.to) as WorkoutRecord[]:[],[data.workouts,summary]);
 if(analyticsStatus!=="ready"||!summary)return <div className="analytics-coach-page"><header className="analytics-page-heading"><div><h1>Аналитика</h1><p>Понимай. Действуй. Прогрессируй.</p></div></header><AnalyticsState status={analyticsStatus==="error"||analyticsStatus==="ready"?"error":"loading"} onRetry={onRetry}/></div>;

 const periodLabel=`${shortDate(summary.period.from)} — ${shortDate(summary.period.to)}`;
 const planTone=summary.plan.completionPercent!==null&&summary.plan.completionPercent>=80?"good":summary.plan.completionPercent!==null&&summary.plan.completionPercent<50?"warn":"neutral";
 const metrics:Metric[]=[
  {label:"Выполнение плана",value:summary.plan.completionPercent===null?"—":`${summary.plan.completionPercent}%`,meta:summary.plan.planned?`${summary.plan.completed} из ${summary.plan.planned} обязательных`:"нет обязательных тренировок",tone:planTone,icon:<CalendarCheck2 size={17}/>},
  {label:"Тренировки",value:String(summary.overview.workouts),meta:comparisonText(summary.comparisons.workouts),tone:summary.comparisons.workouts.state==="up"?"good":"neutral",icon:<Dumbbell size={17}/>},
  {label:"Активное время",value:`${summary.overview.durationMinutes} мин`,meta:comparisonText(summary.comparisons.durationMinutes),icon:<Clock3 size={17}/>},
  {label:"Дистанция",value:summary.overview.distanceMeters===null?"—":`${numberRu(summary.overview.distanceMeters/1000)} км`,meta:summary.overview.distanceMeters===null?"дистанция не записана":comparisonText(summary.comparisons.distanceMeters),icon:<Target size={17}/>},
 ];
 const insightIcons=[<Target key="target" size={20}/>,<Dumbbell key="gym" size={20}/>,<Waves key="swim" size={20}/>,<Bike key="bike" size={20}/>,<Sparkles key="sparkles" size={20}/>];
 const coachSuggestions=["Что видно по выполнению плана?","Как меняется тренировочный объём?","Разбери прогресс в зале","Подготовь обзор недели"];

 return <div className="analytics-coach-page">
  <header className="analytics-page-heading"><div><h1>Аналитика</h1><p>Понимай. Действуй. Прогрессируй.</p></div><div className="analytics-heading-actions"><div className="analytics-period-select" role="group" aria-label="Период аналитики">{DISPLAY_RANGES.map(item=><button type="button" key={item} aria-pressed={period===item} className={period===item?"active":""} onClick={()=>setPeriod(item)}>{rangeLabels[item]}</button>)}</div><div className="analytics-export-menu"><span>{periodLabel}</span><button type="button" onClick={()=>downloadText(`volt-workouts-${summary.period.from}_${summary.period.to}.csv`,buildWorkoutsCsv(exportRows),"text/csv")}>CSV</button><button type="button" onClick={()=>downloadText(`volt-workouts-${summary.period.from}_${summary.period.to}.json`,buildWorkoutsJson(exportRows),"application/json")}>JSON</button></div></div></header>
  <div className="analytics-mode-tabs" role="tablist" aria-label="Аналитика и AI Coach"><button type="button" role="tab" aria-selected={mode==="insights"} className={mode==="insights"?"active":""} onClick={()=>onModeChange("insights")}><Sparkles size={17}/>Инсайты</button><button type="button" role="tab" aria-selected={mode==="coach"} className={mode==="coach"?"active":""} onClick={()=>onModeChange("coach")}><Activity size={17}/>AI Coach</button></div>
  <div className={`analytics-coach-layout mode-${mode}`}>
   <section className="analytics-insights-column" aria-label="Инсайты и динамика">
    <div className="analytics-metric-strip">{metrics.map(metric=><article key={metric.label} className={metric.tone?`tone-${metric.tone}`:""}><span>{metric.icon}{metric.label}</span><b>{metric.value}</b><small>{metric.meta}</small></article>)}</div>
    <section className="analytics-insights-panel"><header><div><p className="eyebrow">КЛЮЧЕВЫЕ ИНСАЙТЫ</p><h2>Что меняется сейчас</h2></div><span>{periodLabel}</span></header><div className="analytics-insight-list">{summary.insights.map((insight,index)=><article key={insight.id} className={`tone-${insight.tone}`}><span className="analytics-insight-icon">{insightIcons[index]??<Sparkles size={20}/>}</span><div><h3>{insight.title}</h3><p>{insight.summary}</p><small>{insight.evidence}</small></div><ChevronRight size={17}/></article>)}</div></section>
    <section className="analytics-trends-panel"><header><div><p className="eyebrow">ДИНАМИКА ЗА ПЕРИОД</p><h2>Фактический тренировочный ритм</h2></div><span>По календарным неделям</span></header><div className="analytics-chart-grid"><TrendChart title="Тренировки" unit="сесс." points={summary.trends.weekly} valueOf={point=>point.sessions}/><TrendChart title="Дистанция" unit="м" tone="blue" points={summary.trends.weekly} valueOf={point=>point.distanceMeters}/><TrendChart title="Силовой объём" unit="кг·повт." tone="violet" points={summary.trends.weekly} valueOf={point=>point.strengthVolumeKg}/></div></section>
    <section className="analytics-sport-panel" aria-labelledby="analytics-sports-title"><header><div><p className="eyebrow">ПО ВИДАМ НАГРУЗКИ</p><h2 id="analytics-sports-title">Зал, плавание и велосипед</h2></div><span>{summary.overview.activeWeeks} из {summary.consistency.totalWeeks} активных недель</span></header><div className="analytics-sport-grid">
     <article><Dumbbell size={19}/><h3>Зал</h3><b>{summary.strength.workouts}</b><p>{summary.strength.sets} {pluralRu(summary.strength.sets,"подход","подхода","подходов")} · {summary.strength.reps} {pluralRu(summary.strength.reps,"повторение","повторения","повторений")}</p><small>{numberRu(summary.strength.volumeKg)} кг·повт. · {summary.strength.exercises} {pluralRu(summary.strength.exercises,"упражнение","упражнения","упражнений")}</small></article>
     <article><Waves size={19}/><h3>Плавание</h3><b>{summary.swim.workouts}</b><p>{summary.swim.distanceMeters===null?"Дистанция не записана":`${numberRu(summary.swim.distanceMeters)} м`} · {summary.swim.durationMinutes} мин</p><small>План: {summary.swim.completedPlanned} из {summary.swim.planned}</small></article>
     <article><Bike size={19}/><h3>Велосипед</h3><b>{summary.cycling.workouts}</b><p>{summary.cycling.distanceMeters===null?"Дистанция не записана":`${numberRu(summary.cycling.distanceMeters/1000)} км`} · {summary.cycling.durationMinutes} мин</p><small>{summary.cycling.avgSpeedKph===null?"Скорость не записана":`${numberRu(summary.cycling.avgSpeedKph)} км/ч`} · cadence/power нет</small></article>
    </div></section>
    <section className="analytics-coverage-panel" aria-labelledby="analytics-coverage-title"><header><div><p className="eyebrow">КАЧЕСТВО ДАННЫХ</p><h2 id="analytics-coverage-title">Покрытие и provenance</h2></div><Database size={18}/></header><div className="analytics-coverage-grid"><span><b>{summary.dataCoverage.manualWorkouts}</b> вручную</span><span><b>{summary.dataCoverage.importedFitWorkouts}</b> FIT</span><span><b>{summary.dataCoverage.withHeartRate}/{summary.dataCoverage.includedWorkouts}</b> с пульсом</span><span><b>{summary.dataCoverage.withDistance}/{summary.dataCoverage.includedWorkouts}</b> с дистанцией</span></div><p>Strava исключена до агрегации: {summary.dataCoverage.excludedStravaWorkouts} записей за период. Недоступные поля не восстанавливаются: cadence, power, elevation gain, SWOLF, lengths и интервалы.</p></section>
   </section>
   <aside className="analytics-coach-column" aria-label="AI Coach"><div className="analytics-coach-identity"><span><Sparkles size={22}/></span><div><h2>AI Coach <i>online</i></h2><p>Персональный тренер, который объясняет данные RITMOVIS и предлагает следующий шаг.</p></div></div><CoachChatPanel open embedded onClose={()=>onModeChange("insights")} plan={plan} originalPlan={originalPlan} planChanged={planChanged} changeReasonCode={changeReasonCode} today={today} onFoodSaved={onFoodSaved} suggestedQuestions={coachSuggestions} quickActions={[{label:"Начать тренировку",icon:"▶",onClick:onStartWorkout},{label:"Открыть питание",icon:"◉",onClick:onOpenNutrition}]}/><div className="analytics-coach-facts"><small>Решение на сегодня</small><p>{coach.decision?.explanation||coach.advice?.[0]?.reason||"Coach ждёт сохранённые данные дня и не придумывает показатели."}</p></div></aside>
  </div>
 </div>;
}
