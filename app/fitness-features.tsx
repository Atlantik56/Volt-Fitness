"use client";

import { useMemo, useState } from "react";
import { buildHomeWeek } from "./personal-data";
import { calculateReadiness } from "../lib/readiness";
import {
  ANALYTICS_PERIODS, ANALYTICS_PERIOD_LABELS, buildHeatmap, buildWorkoutsCsv, buildWorkoutsJson,
  computePeriodSummary, computeWellnessSummary, groupVolumeByPeriod, localIso as analyticsLocalIso,
  type AnalyticsPeriod, type WorkoutRecord,
} from "./training-analytics-model";

const iso=(d:Date)=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const post=(body:Record<string,unknown>)=>fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});

export function Readiness({data,refresh}:{data:any;refresh:()=>void}){
 const today=iso(new Date()), current=(data.wellnessLogs||[]).find((x:any)=>x.date===today)||{}, sleep=Number((data.activity||[]).find((x:any)=>x.date===today)?.sleepHours)||0;
 const energy=Number(current.energy||3), pain=Number(current.pain||0), last=(data.workouts||[])[0];
 const {score,decision}=calculateReadiness({sleepHours:sleep,energy,pain,lastWorkoutPain:Number(last?.painAfter)||0});
 const save=async(e:any)=>{e.preventDefault();await post({action:"wellness",date:today,...Object.fromEntries(new FormData(e.currentTarget))});refresh()};
 return <section className={`readiness card ${decision.tone}`}><div className="readiness-score"><b>{score}</b><span>готовность</span></div><div><p className="eyebrow">VOLT COACH · РЕШЕНИЕ НА СЕГОДНЯ</p><h3>{decision.title}</h3><p className="readiness-text">{decision.text}</p><small className="readiness-summary">Сон {sleep||"—"} ч · энергия {energy}/5 · боль {pain}/10</small><form onSubmit={save}><label>Энергия<select name="energy" defaultValue={current.energy||3}>{[1,2,3,4,5].map(x=><option key={x}>{x}</option>)}</select></label><label>Боль 0–10<input name="pain" type="number" min="0" max="10" defaultValue={current.pain||0}/></label><label>Где болит<input name="painArea" placeholder="Например, тазобедренный" defaultValue={current.painArea||""}/></label><label>Комментарий<input name="note" placeholder="Самочувствие сегодня" defaultValue={current.note||""}/></label><button>Оценить</button></form>{pain>0&&<small className="readiness-warning">При боли в тазобедренном суставе замени силовую на прогулку или упражнения для верха тела. При повторяющейся боли обратись к врачу.</small>}</div></section>
}

function downloadText(filename:string,content:string,mime:string){
 const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
const KIND_LABELS:Record<string,string>={strength:"Силовые",cardio:"Кардио",recovery:"Восстановление",rest:"Отдых"};

export function TrainingAnalytics({data}:{data:any}){
 const [period,setPeriod]=useState<AnalyticsPeriod>("3M");
 const workouts=useMemo(()=>(data.workouts||[]) as WorkoutRecord[],[data.workouts]);
 const planDays=useMemo(()=>buildHomeWeek(data.profile?.programStart).map(d=>({day:d.day,type:d.type})),[data.profile?.programStart]);
 const anchor=useMemo(()=>new Date(),[]);
 const summary=useMemo(()=>computePeriodSummary(workouts,planDays,period,anchor),[workouts,planDays,period,anchor]);
 const inPeriod=useMemo(()=>workouts.filter(w=>w.date>=summary.fromDate&&w.date<=summary.toDate),[workouts,summary.fromDate,summary.toDate]);
 const wellness=useMemo(()=>computeWellnessSummary(inPeriod),[inPeriod]);
 const granularity=period==="4W"?"week":"month";
 const volume=useMemo(()=>groupVolumeByPeriod(inPeriod,granularity),[inPeriod,granularity]);
 const cards:[string|number,string][]=[
  [summary.totalWorkouts,"тренировок"],
  [summary.planCompletionPct!=null?`${summary.planCompletionPct}%`:"—","выполнение плана"],
  [`${summary.regularityPct}%`,"регулярность"],
  [summary.activeDays,"активных дней"],
 ];
 return <section className="analytics card">
  <div className="section-head"><div><p className="eyebrow">АНАЛИТИКА</p><h3>Динамика тренировок и восстановления</h3></div><div className="period-tabs">{ANALYTICS_PERIODS.map(p=><button type="button" key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{ANALYTICS_PERIOD_LABELS[p]}</button>)}</div></div>
  <div className="analytics-grid">{cards.map(([v,l])=><article key={l}><b>{v}</b><span>{l}</span></article>)}</div>
  <div className="analytics-kind-split">{(Object.keys(summary.byKind) as (keyof typeof summary.byKind)[]).filter(k=>summary.byKind[k]>0).map(k=><span key={k}>{KIND_LABELS[k]}: {summary.byKind[k]}</span>)}{summary.totalWorkouts===0&&<span>Нет тренировок за период</span>}</div>

  <h4 className="analytics-subhead">Объём по {granularity==="week"?"неделям":"месяцам"}</h4>
  <div className="volume-rows">{volume.length===0?<p className="detail-lead">Нет тренировок за период.</p>:volume.map(b=><article key={b.key} className="volume-row"><b>{b.key}</b>
   {b.strengthSessions>0&&<span>Силовая: {b.strengthSessions} трен. · {b.strengthActiveMinutes} мин{b.strengthTotalReps>0?` · ${b.strengthTotalReps} повт.`:""}</span>}
   {b.cardioSessions>0&&<span>Кардио: {b.cardioSessions} трен. · {Math.round(b.cardioDistanceMeters/100)/10} км · {b.cardioActiveMinutes} мин{b.cardioAvgHeartRate?` · пульс ~${b.cardioAvgHeartRate}`:""}</span>}
  </article>)}</div>

  <h4 className="analytics-subhead">Самочувствие после нагрузки</h4>
  {wellness.sessionsTotal===0?<p className="detail-lead">Нет тренировок за период.</p>:<div className="wellness-summary">
   <span>{wellness.sessionsWithPain} из {wellness.sessionsTotal} сессий с болью после</span>
   <span>Средняя боль после: {wellness.avgPain}/10</span>
   <span>{wellness.hardEffortSessions} с тяжёлым или болезненным усилием</span>
  </div>}
  <p className="detail-lead small">Это совпадения в сохранённых данных, а не диагноз и не причинно-следственная связь.</p>

  <div className="analytics-export"><button type="button" className="ghost-btn" onClick={()=>downloadText(`volt-workouts-${summary.fromDate}_${summary.toDate}.csv`,buildWorkoutsCsv(inPeriod),"text/csv")}>Экспорт CSV</button><button type="button" className="ghost-btn" onClick={()=>downloadText(`volt-workouts-${summary.fromDate}_${summary.toDate}.json`,buildWorkoutsJson(inPeriod),"application/json")}>Экспорт JSON</button></div>
 </section>
}

const HEATMAP_WEEKDAYS=[1,2,3,4,5,6,7] as const;
function heatmapWeekday(date:Date){const d=date.getDay();return d===0?7:d}
function heatmapLevel(count:number,max:number){if(!count)return 0;return Math.min(4,Math.ceil((count/max)*4))}

export function TrainingCalendar({data}:{data:any}){
 const [months,setMonths]=useState(6);
 const workouts=useMemo(()=>(data.workouts||[]) as WorkoutRecord[],[data.workouts]);
 const anchor=useMemo(()=>new Date(),[]);
 const fromIso=useMemo(()=>{const d=new Date(anchor);d.setMonth(d.getMonth()-months+1);d.setDate(1);return analyticsLocalIso(d)},[anchor,months]);
 const toIso=analyticsLocalIso(anchor);
 const cells=useMemo(()=>buildHeatmap(workouts,fromIso,toIso),[workouts,fromIso,toIso]);
 const weeks=useMemo(()=>{
  const firstWeekday=heatmapWeekday(new Date(`${fromIso}T00:00:00`));
  const padded:({date:string;count:number}|null)[]=[...Array.from({length:firstWeekday-1},()=>null),...cells];
  const out:({date:string;count:number}|null)[][]=[];
  for(let i=0;i<padded.length;i+=7)out.push(padded.slice(i,i+7));
  return out;
 },[cells,fromIso]);
 const max=Math.max(1,...cells.map(c=>c.count));
 return <section className="calendar card heatmap-card">
  <div className="section-head"><div><p className="eyebrow">КАЛЕНДАРЬ НАГРУЗКИ</p><h3>Активность за {months===6?"6 месяцев":"год"}</h3></div><div className="period-tabs"><button type="button" className={months===6?"active":""} onClick={()=>setMonths(6)}>6 мес</button><button type="button" className={months===12?"active":""} onClick={()=>setMonths(12)}>1 год</button></div></div>
  {cells.every(c=>c.count===0)?<p className="detail-lead">Пока нет тренировок за выбранный период.</p>:<>
  <div className="heatmap-grid">{weeks.map((week,wi)=><div className="heatmap-col" key={wi}>{HEATMAP_WEEKDAYS.map((wd,di)=>{const cell=week[di];return cell?<span key={cell.date} className={`heatmap-cell level-${heatmapLevel(cell.count,max)}`} title={`${cell.date}: ${cell.count} трен.`}/>:<span key={`${wi}-${wd}`} className="heatmap-cell empty"/>})}</div>)}</div>
  <div className="heatmap-legend"><small>Меньше</small>{[0,1,2,3,4].map(l=><span key={l} className={`heatmap-cell level-${l}`}/>)}<small>Больше</small></div>
  </>}
 </section>
}

export function ScheduleEditor({data,refresh}:{data:any;refresh:()=>void}){
 const [message,setMessage]=useState("");const plans=buildHomeWeek(data.profile?.programStart).filter(x=>x.type!=="Отдых");
 const save=async(e:any)=>{e.preventDefault();const raw:any=Object.fromEntries(new FormData(e.currentTarget)), selected=plans.find(x=>x.title===raw.planTitle)||plans[0], prev=new Date(`${raw.scheduledDate}T12:00:00`);prev.setDate(prev.getDate()-1);const next=new Date(`${raw.scheduledDate}T12:00:00`);next.setDate(next.getDate()+1);const collision=(data.scheduleOverrides||[]).some((x:any)=>x.planTitle.includes("Гантели")&&[iso(prev),iso(next)].includes(x.scheduledDate));if(selected.type==="Силовая"&&collision&&!confirm("Рядом уже стоит силовая тренировка. Всё равно сохранить?"))return;const r=await post({action:"schedule",...raw});setMessage(r.ok?"План обновлён":"Не удалось сохранить");refresh()};
 const base=new Date();return <section className="schedule-editor card"><div><p className="eyebrow">ГИБКИЙ ПЛАН</p><h3>Перенести или заменить тренировку</h3><p>Приложение предупредит о двух силовых днях подряд.</p></div><form onSubmit={save}><label>Тренировка<select name="planTitle">{plans.map(x=><option key={`${x.day}-${x.title}`}>{x.title}</option>)}</select></label><label>Плановая дата<input name="originalDate" type="date" required defaultValue={iso(base)}/></label><label>Новая дата<input name="scheduledDate" type="date" required defaultValue={iso(base)}/></label><label>Замена<select name="replacementTitle"><option value="">Без замены</option><option>Прогулка и мобильность</option><option>Плавание в бассейне</option><option>Шоссейный велосипед</option></select></label><button>Сохранить</button></form>{message&&<small>{message}</small>}</section>
}

export function StrengthAdvice({data}:{data:any}){
 const groups=useMemo(()=>Object.groupBy((data.strengthLogs||[]) as any[],(x:any)=>x.exercise),[data.strengthLogs]);const advice=Object.entries(groups).map(([name,raw])=>{const list=(raw||[]).slice(0,2) as any[],last=list[0],related=(data.workouts||[]).find((w:any)=>w.details?.some((d:any)=>d.name===name));let text="Сохрани вес и технику";if(related?.effort==="Легко")text=`Можно добавить 1–2 повтора или ${Number(last?.weight||0)+1} кг`;if(related?.effort==="Тяжело")text="Сохрани вес, не добавляй нагрузку";if(related?.effort==="Боль"||Number(related?.painAfter)>=3)text="Останови прогрессию и замени упражнение";return {name,text}}).slice(0,5);
 if(!advice.length)return null;return <section className="advice card"><p className="eyebrow">ПРОГРЕССИЯ НАГРУЗКИ</p><h3>Рекомендации на следующую тренировку</h3>{advice.map(x=><article key={x.name}><b>{x.name}</b><span>{x.text}</span></article>)}</section>
}

export function NutritionTools({data}:{data:any}){
 const [favorites,setFavorites]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem("volt-food-favorites")||"[]")}catch{return[]}});const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);const logs=(data.foodLogs||[]).filter((x:any)=>x.date===iso(yesterday));
 const add=(name:string)=>{const next=Array.from(new Set([...favorites,name]));setFavorites(next);localStorage.setItem("volt-food-favorites",JSON.stringify(next))};
 return <section className="food-tools card"><p className="eyebrow">БЫСТРОЕ ДОБАВЛЕНИЕ</p><h3>Избранное и вчерашний рацион</h3><div>{logs.length?logs.map((x:any)=><button key={x.id} onClick={()=>x.items.forEach((i:any)=>add(`${i.name} — ${i.calories} ккал (Б ${i.protein} / Ж ${i.fat} / У ${i.carbs})`))}>☆ {x.mealType} · сохранить блюда</button>):<span>Вчера записей не было</span>}</div>{favorites.length>0&&<ul>{favorites.map(x=><li key={x}><button title="Скопировать для вставки в дневник" onClick={()=>navigator.clipboard.writeText(x)}>Копировать</button><span>{x}</span><button onClick={()=>{const next=favorites.filter(y=>y!==x);setFavorites(next);localStorage.setItem("volt-food-favorites",JSON.stringify(next))}}>×</button></li>)}</ul>}</section>
}
