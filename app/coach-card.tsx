"use client";

// Презентационный компонент: только отображает готовый результат из lib/coach.ts.
// Результат считается один раз в page.tsx и разделяется с индикатором в шапке,
// чтобы карточка и индикатор не могли показать разные решения.

import { COACH_ACTION_LABELS, type CoachResult } from "../lib/coach";
import type { CoachInsight } from "../lib/coach-insights";

const TONE_ICON:Record<string,string>={stop:"⛔",warn:"⚠",good:"✓",info:"◆"};
// На карточке — только 1-2 самых важных наблюдения; полная лента (Sprint 6.15) появится позже.
const CARD_INSIGHTS_VISIBLE=2;

function CoachAbout(){
 return <details className="coach-about">
  <summary>О VOLT Coach</summary>
  <div>
   <p>Coach читает только сохранённые тобой данные: план на день, самочувствие (боль и субъективную энергию), сон, записи тренировок, питание и замеры. Незаполненные поля он считает отсутствующими, а не нулевыми.</p>
   <p>Работает локально и детерминированно: одни и те же данные всегда дают одно и то же решение. Никакие данные никуда не отправляются, внешний AI не используется.</p>
   <p>Coach не ставит диагнозы, не заменяет врача и не меняет план автоматически — решение остаётся рекомендацией, выполнять её или нет, решаешь ты. При повторяющейся боли обратись к врачу очно.</p>
  </div>
 </details>;
}

export function CoachCard({result,plan,insights=[],ready=true}:{result:CoachResult;plan?:{title:string;type:string}|null;insights?:CoachInsight[];ready?:boolean}){
 const {advice,decision}=result;
 if(!ready)return <section id="volt-coach" className="coach-card card"><div className="coach-head"><p className="eyebrow">VOLT COACH · РЕШЕНИЕ НА СЕГОДНЯ</p><small>Локально, без внешнего AI</small></div><ol className="coach-list"><li className="coach-item info"><span className="coach-icon" aria-hidden="true">◆</span><div><b>Собираю данные дня…</b><small>Решение появится, когда загрузятся тренировки, питание и самочувствие.</small></div></li></ol></section>;
 const meta=decision?COACH_ACTION_LABELS[decision.action]:null;
 return <section id="volt-coach" className="coach-card card" aria-label="VOLT Coach — решение на сегодня">
  <div className="coach-head">
   <p className="eyebrow">VOLT COACH · РЕШЕНИЕ НА СЕГОДНЯ</p>
   <small>Локально, без внешнего AI</small>
  </div>
  {decision&&meta?<>
   <div className={`coach-status ${meta.tone}`} role="status"><span className="coach-status-dot" aria-hidden="true"/><b>{meta.label}</b></div>
   {plan&&<div className="coach-decision">
    <div><small>ИСХОДНЫЙ ПЛАН</small><b>{plan.title}</b><span>{plan.type}</span></div>
    <i aria-hidden="true">→</i>
    <div><small>РЕКОМЕНДАЦИЯ</small><b>{decision.suggestedLoad.title}</b><span>{decision.suggestedLoad.details}</span></div>
   </div>}
   <p className="coach-note-line">Рекомендация не применяется к плану автоматически — решение за тобой.</p>
   {decision.usedSignals.length>0&&<p className="coach-signals"><span>Использовано:</span> {decision.usedSignals.join(" · ")}</p>}
   {decision.limitedData&&<p className="coach-limited">Самочувствие за сегодня не отмечено — решение основано на ограниченной информации.</p>}
  </>:<p className="coach-note-line">На сегодня нет плана — Coach не придумывает новую тренировку и решает только по сохранённому плану.</p>}
  {advice.length>0&&<ol className="coach-list">
   {advice.map(item=><li key={item.id} className={`coach-item ${item.tone}`}>
    <span className="coach-icon" aria-hidden="true">{TONE_ICON[item.tone]||"◆"}</span>
    <div><b>{item.title}</b><small>{item.reason}</small></div>
   </li>)}
  </ol>}
  {insights.length>0&&<div className="coach-insights"><p className="coach-insights-head">Что заметил VOLT</p><ol className="coach-list">
   {insights.slice(0,CARD_INSIGHTS_VISIBLE).map(item=><li key={item.id} className={`coach-item ${item.tone}`}>
    <span className="coach-icon" aria-hidden="true">{TONE_ICON[item.tone]||"◆"}</span>
    <div><b>{item.title}</b><small>{item.text}</small></div>
   </li>)}
  </ol></div>}
  <CoachAbout/>
 </section>;
}
