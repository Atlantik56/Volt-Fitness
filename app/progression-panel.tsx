"use client";

// Sprint 6.12 — предложения прогрессии нагрузки после тренировки.
// Сами предложения уже посчитаны и сохранены детерминированным кодом
// (lib/progression-engine.ts) при сохранении тренировки; здесь только отображение
// и вызов accept/reject/cancel через /api/progression. Explain — необязательный
// вызов AI Hub, который лишь объясняет уже посчитанное, ничего не меняя.

import { useState } from "react";
import { useToast } from "./toast";

type ProgressionAction="increase"|"maintain"|"decrease"|"deload"|"no-change";
export type ProgressionProposal={
  id:number;workoutId:number;exercise:string;action:ProgressionAction;
  reasonCode:string;reason:string;usedSignals:string[];limitedData:boolean;
  from:{weight:number;reps:number};to:{weight:number;reps:number};
  status:"pending"|"accepted"|"rejected"|"cancelled";createdAt:string;decidedAt:string|null;
};

const ACTION_META:Record<ProgressionAction,{label:string;icon:string;tone:string}>={
  increase:{label:"Увеличить нагрузку",icon:"↑",tone:"good"},
  maintain:{label:"Сохранить нагрузку",icon:"=",tone:"info"},
  decrease:{label:"Немного снизить",icon:"↓",tone:"warn"},
  deload:{label:"Разгрузочная неделя",icon:"↓↓",tone:"stop"},
  "no-change":{label:"Без изменений",icon:"·",tone:"info"},
};

function formatLoad(load:{weight:number;reps:number}){
  return load.weight>0?`${load.weight} кг × ${load.reps}`:`${load.reps} повт.`;
}

export function ProgressionPanel({proposals,refresh}:{proposals:ProgressionProposal[];refresh:()=>void}){
  const notify=useToast();
  const [busyId,setBusyId]=useState<number|null>(null);
  const [explain,setExplain]=useState<Record<number,string>>({});
  if(!proposals.length)return null;

  const act=async(id:number,action:"accept"|"reject"|"cancel")=>{
    setBusyId(id);
    const r=await fetch("/api/progression",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});
    const j=await r.json().catch(()=>({}));
    setBusyId(null);
    if(!r.ok){notify(j.error||"Не удалось сохранить решение","warn");return}
    notify(action==="accept"?"Изменение применено к следующей тренировке":action==="reject"?"Предложение отклонено":"Изменение отменено");
    refresh();
  };
  const askAi=async(id:number)=>{
    setBusyId(id);
    const r=await fetch("/api/progression",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,action:"explain"})});
    const j=await r.json().catch(()=>({}));
    setBusyId(null);
    if(!r.ok){notify(j.error||"ИИ недоступен, но предложение уже посчитано локально","warn");return}
    setExplain(current=>({...current,[id]:j.answer}));
  };

  const pending=proposals.filter(p=>p.status==="pending");
  const accepted=proposals.filter(p=>p.status==="accepted");

  return <section className="progression-panel card" aria-label="Предложения прогрессии нагрузки">
    <div className="coach-head"><p className="eyebrow">ПРОГРЕССИЯ НАГРУЗКИ</p><small>Считается локально · подтверждение за тобой</small></div>
    <ol className="coach-list">
      {[...pending,...accepted].map(p=>{
        const meta=ACTION_META[p.action];
        return <li key={p.id} className={`coach-item ${meta.tone}`}>
          <span className="coach-icon" aria-hidden="true">{meta.icon}</span>
          <div>
            <b>{p.exercise} — {meta.label}</b>
            <div className="coach-decision" style={{margin:"6px 0"}}>
              <div><small>БЫЛО</small><b>{formatLoad(p.from)}</b></div>
              <i aria-hidden="true">→</i>
              <div><small>СТАНЕТ</small><b>{formatLoad(p.to)}</b></div>
            </div>
            <small>{p.reason}</small>
            {p.usedSignals.length>0&&<p className="coach-signals"><span>Использовано:</span> {p.usedSignals.join(" · ")}</p>}
            {explain[p.id]&&<p className="coach-limited">{explain[p.id]}</p>}
            <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
              {p.status==="pending"&&<>
                <button type="button" className="ask-coach-btn" disabled={busyId===p.id} onClick={()=>act(p.id,"accept")}>Применить</button>
                <button type="button" className="ask-coach-btn" disabled={busyId===p.id} onClick={()=>act(p.id,"reject")}>Оставить как есть</button>
              </>}
              {p.status==="accepted"&&<button type="button" className="ask-coach-btn" disabled={busyId===p.id} onClick={()=>act(p.id,"cancel")}>Отменить</button>}
              {!explain[p.id]&&<button type="button" className="ask-coach-btn" disabled={busyId===p.id} onClick={()=>askAi(p.id)}>Спросить у ИИ, почему</button>}
            </div>
          </div>
        </li>;
      })}
    </ol>
  </section>;
}
