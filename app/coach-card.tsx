"use client";

// Презентационный компонент: только отображает готовый результат из lib/coach.ts.
// Никаких вычислений, запросов и побочных эффектов здесь нет.

import { buildCoachResult } from "../lib/coach";

const TONE_ICON:Record<string,string>={stop:"⛔",warn:"⚠",good:"✓",info:"◆"};

export function CoachCard({data,plan,today,ready=true}:{data:any;plan?:{title:string;type:string}|null;today:string;ready?:boolean}){
 const {advice}=buildCoachResult({
  date:today,
  ready,
  plan:plan?{title:plan.title,type:plan.type}:null,
  wellnessLogs:data.wellnessLogs,
  activity:data.activity,
  foodLogs:data.foodLogs,
  workouts:data.workouts,
  measurements:data.measurements,
  profile:data.profile,
 });
 if(!ready)return <section className="coach-card card"><div className="coach-head"><p className="eyebrow">VOLT COACH</p><small>Локально, без внешнего AI</small></div><ol className="coach-list"><li className="coach-item info"><span className="coach-icon" aria-hidden="true">◆</span><div><b>Собираю данные дня…</b><small>Советы появятся, когда загрузятся тренировки, питание и самочувствие.</small></div></li></ol></section>;
 if(!advice.length)return null;
 return <section className="coach-card card">
  <div className="coach-head"><p className="eyebrow">VOLT COACH · ДО ТРЁХ ДЕЙСТВИЙ</p><small>Локально, без внешнего AI</small></div>
  <ol className="coach-list">
   {advice.map(item=><li key={item.id} className={`coach-item ${item.tone}`}>
    <span className="coach-icon" aria-hidden="true">{TONE_ICON[item.tone]||"◆"}</span>
    <div><b>{item.title}</b><small>{item.reason}</small></div>
   </li>)}
  </ol>
 </section>;
}
