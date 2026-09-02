"use client";

import { useMemo, useState } from "react";
import { buildHomeWeek } from "./personal-data";
import { calculateReadiness } from "../lib/readiness";
import { progressionAllowed, type CoachAction } from "../lib/coach";
import { useToast } from "./toast";

const iso=(d:Date)=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const post=(body:Record<string,unknown>)=>fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});

// Readiness только оценивает текущее состояние. Решение по сегодняшнему плану
// принимает VOLT Coach — здесь основного тренировочного действия нет.
const READINESS_ASSESSMENT:Record<"good"|"low"|"stop",{title:string;text:string}>={
 good:{title:"Готовность высокая",text:"По сохранённым данным сон, энергия и боль не ограничивают нагрузку."},
 low:{title:"Готовность снижена",text:"По сохранённым данным восстановление неполное."},
 stop:{title:"Боль ограничивает нагрузку",text:"Отмеченная боль — главный фактор сегодняшней оценки."},
};

export function Readiness({data,refresh}:{data:any;refresh:()=>void}){
 const notify=useToast();
 const today=iso(new Date()), current=(data.wellnessLogs||[]).find((x:any)=>x.date===today)||{};
 // AI-13: сон с часов приоритетнее самоотчёта, но не заменяет его — при
 // отсутствии измерения поведение прежнее (docs/AI_12_ADAPTIVE_PROGRESSION.md).
 const measuredSleepSeconds=Number((data.dailyHealth||[]).find((x:any)=>x.date===today)?.sleepSeconds)||0;
 const sleep=measuredSleepSeconds>0?measuredSleepSeconds/3600:Number((data.activity||[]).find((x:any)=>x.date===today)?.sleepHours)||0;
 const energy=Number(current.energy||3), pain=Number(current.pain||0), last=(data.workouts||[])[0];
 const {score,decision}=calculateReadiness({sleepHours:sleep,energy,pain,lastWorkoutPain:Number(last?.painAfter)||0});
 const assessment=READINESS_ASSESSMENT[decision.tone];
 const save=async(e:any)=>{e.preventDefault();await post({action:"wellness",date:today,...Object.fromEntries(new FormData(e.currentTarget))});notify("Самочувствие сохранено");refresh()};
 return <section className={`readiness card ${decision.tone}`}><div className="readiness-score" style={{"--score-pct":score} as any}><b>{score}</b><span>из 100</span></div><div><p className="eyebrow">READINESS · ОЦЕНКА СОСТОЯНИЯ</p><h3>{assessment.title}</h3><p className="readiness-text">{assessment.text}</p><small className="readiness-summary">Сон {sleep||"—"} ч · энергия {energy}/5 (субъективная) · боль {pain}/10</small><a className="readiness-coach-link" href="#volt-coach">Решение по сегодняшнему плану — в карточке VOLT Coach ↓</a><form onSubmit={save}><label>Энергия<select name="energy" defaultValue={current.energy||3}>{[1,2,3,4,5].map(x=><option key={x}>{x}</option>)}</select></label><label>Боль 0–10<input name="pain" type="number" min="0" max="10" defaultValue={current.pain||0}/></label><label>Где болит<input name="painArea" placeholder="Например, тазобедренный" defaultValue={current.painArea||""}/></label><label>Комментарий<input name="note" placeholder="Самочувствие сегодня" defaultValue={current.note||""}/></label><button>Оценить</button></form>{pain>0&&<small className="readiness-warning">При боли в тазобедренном суставе замени силовую на прогулку или упражнения для верха тела. При повторяющейся боли обратись к врачу.</small>}</div></section>
}

export function ScheduleEditor({data,refresh}:{data:any;refresh:()=>void}){
 const notify=useToast();
 const [message,setMessage]=useState("");const plans=buildHomeWeek(data.profile?.programStart,data.profile?.trainingPlanV3StartedAt,undefined,data.profile?.trainingPlanV3CycleId).filter(x=>x.type!=="Отдых");
 const save=async(e:any)=>{e.preventDefault();const raw:any=Object.fromEntries(new FormData(e.currentTarget)), selected=plans.find(x=>x.title===raw.planTitle)||plans[0], prev=new Date(`${raw.scheduledDate}T12:00:00`);prev.setDate(prev.getDate()-1);const next=new Date(`${raw.scheduledDate}T12:00:00`);next.setDate(next.getDate()+1);const collision=(data.scheduleOverrides||[]).some((x:any)=>x.planTitle.includes("Гантели")&&[iso(prev),iso(next)].includes(x.scheduledDate));if(selected.type==="Силовая"&&collision&&!confirm("Рядом уже стоит силовая тренировка. Всё равно сохранить?"))return;const r=await post({action:"schedule",...raw});const ok=r.ok;setMessage(ok?"План обновлён":"Не удалось сохранить");notify(ok?"План обновлён":"Не удалось сохранить план",ok?"good":"warn");refresh()};
 const base=new Date();return <section className="schedule-editor card"><div><p className="eyebrow">ГИБКИЙ ПЛАН</p><h3>Перенести или заменить тренировку</h3><p>Приложение предупредит о двух силовых днях подряд.</p></div><form onSubmit={save}><label>Тренировка<select name="planTitle">{plans.map(x=><option key={`${x.day}-${x.title}`}>{x.title}</option>)}</select></label><label>Плановая дата<input name="originalDate" type="date" required defaultValue={iso(base)}/></label><label>Новая дата<input name="scheduledDate" type="date" required defaultValue={iso(base)}/></label><label>Замена<select name="replacementTitle"><option value="">Без замены</option><option>Прогулка и мобильность</option><option>Плавание в бассейне</option><option>Шоссейный велосипед</option></select></label><button>Сохранить</button></form>{message&&<small>{message}</small>}</section>
}

// Объяснение прогрессии по конкретным упражнениям. Не конкурирует с решением Coach:
// при щадящем решении (reduce/replace/rest) шаги прогрессии не предлагаются как действие.
export function StrengthAdvice({data,coachAction=null}:{data:any;coachAction?:CoachAction|null}){
 const blocked=!progressionAllowed(coachAction);
 const groups=useMemo(()=>Object.groupBy((data.strengthLogs||[]) as any[],(x:any)=>x.exercise),[data.strengthLogs]);const advice=Object.entries(groups).map(([name])=>{const related=(data.workouts||[]).find((w:any)=>w.details?.some((d:any)=>d.name===name));let text="Сохрани вес и технику";if(related?.effort==="Легко")text=blocked?"Готов к прогрессии, но сегодня Coach рекомендует щадящий день — вернись к добавке на следующей полноценной силовой":"Последний раз было легко — конкретный шаг веса и момент увеличения нагрузки предложит VOLT Coach";if(related?.effort==="Тяжело")text="Сохрани вес, не добавляй нагрузку";if(related?.effort==="Боль"||Number(related?.painAfter)>=3)text="Останови прогрессию и замени упражнение";return {name,text}}).slice(0,5);
 if(!advice.length)return null;return <section className="advice card"><p className="eyebrow">ПРОГРЕССИЯ УПРАЖНЕНИЙ</p><h3>Объяснение шага по каждому упражнению</h3><p className="detail-lead small">Это разбор следующего шага в конкретных упражнениях. Решение о сегодняшней нагрузке принимает VOLT Coach на вкладке «Сегодня».</p>{advice.map(x=><article key={x.name}><b>{x.name}</b><span>{x.text}</span></article>)}</section>
}

export function NutritionTools({data}:{data:any}){
 const [favorites,setFavorites]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem("volt-food-favorites")||"[]")}catch{return[]}});const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);const logs=(data.foodLogs||[]).filter((x:any)=>x.date===iso(yesterday));
 const add=(name:string)=>{const next=Array.from(new Set([...favorites,name]));setFavorites(next);localStorage.setItem("volt-food-favorites",JSON.stringify(next))};
 return <section className="food-tools card"><p className="eyebrow">ИЗБРАННОЕ</p><h3>Сохранённые блюда</h3><p className="food-tools-note">Здесь блюдо можно сохранить или скопировать как описание для ручного добавления. Автоматического повтора нет.</p><div>{logs.length?logs.map((x:any)=><button key={x.id} onClick={()=>x.items.forEach((i:any)=>add(`${i.name} — ${i.calories} ккал (Б ${i.protein} / Ж ${i.fat} / У ${i.carbs})`))}>☆ {x.mealType} · сохранить в избранное</button>):<span>Вчера записей не было</span>}</div>{favorites.length>0&&<ul>{favorites.map(x=><li key={x}><button title="Скопировать описание для ручного добавления" onClick={()=>navigator.clipboard.writeText(x)}>Копировать описание</button><span>{x}</span><button aria-label={`Удалить ${x} из избранного`} title="Удалить из избранного" onClick={()=>{const next=favorites.filter(y=>y!==x);setFavorites(next);localStorage.setItem("volt-food-favorites",JSON.stringify(next))}}>×</button></li>)}</ul>}</section>
}
