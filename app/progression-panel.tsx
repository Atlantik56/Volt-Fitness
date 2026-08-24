"use client";

// Sprint 6.12 — предложения прогрессии нагрузки после тренировки.
// Сами предложения уже посчитаны и сохранены детерминированным кодом
// (lib/progression-engine.ts) при сохранении тренировки; здесь только отображение
// и вызов accept/reject/cancel через /api/progression. Explain — необязательный
// вызов AI Hub, который лишь объясняет уже посчитанное, ничего не меняя.

import { useEffect, useRef, useState } from "react";
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

function changeNoun(count:number){return count===1?"изменение":count>=2&&count<=4?"изменения":"изменений"}
function exerciseNoun(count:number){return count===1?"упражнение":count>=2&&count<=4?"упражнения":"упражнений"}

export function ProgressionPanel({proposals,refresh}:{proposals:ProgressionProposal[];refresh:()=>void}){
  const notify=useToast();
  const [busyId,setBusyId]=useState<number|null>(null);
  const [explain,setExplain]=useState<Record<number,string>>({});
  const [open,setOpen]=useState(false);
  const [expandedId,setExpandedId]=useState<number|null>(null);
  const [statusOverrides,setStatusOverrides]=useState<Partial<Record<number,ProgressionProposal["status"]>>>({});
  const [actionError,setActionError]=useState("");
  const triggerRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);

  const effectiveProposals=proposals.map(proposal=>({...proposal,status:statusOverrides[proposal.id]??proposal.status}));
  const pendingChanges=effectiveProposals.filter(proposal=>proposal.status==="pending"&&proposal.action!=="maintain"&&proposal.action!=="no-change");
  const stable=effectiveProposals.filter(proposal=>proposal.status==="pending"&&(proposal.action==="maintain"||proposal.action==="no-change"));
  const processed=effectiveProposals.filter(proposal=>proposal.status!=="pending");
  const appliedCount=processed.filter(proposal=>proposal.status==="accepted").length;
  const pendingCount=pendingChanges.length+stable.length;

  useEffect(()=>{
    if(!open)return;
    const previousOverflow=document.body.style.overflow;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const fallbackTrigger=triggerRef.current;
    const focusFrame=window.requestAnimationFrame(()=>closeRef.current?.focus());
    const focusable=()=>Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
    )??[]).filter(element=>element.getClientRects().length>0);
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setOpen(false);return}
      if(event.key!=="Tab")return;
      const elements=focusable();
      if(!elements.length){event.preventDefault();dialogRef.current?.focus();return}
      const first=elements[0],last=elements[elements.length-1],current=document.activeElement;
      if(event.shiftKey&&current===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&current===last){event.preventDefault();first.focus()}
    };
    document.body.style.overflow="hidden";
    window.addEventListener("keydown",onKeyDown);
    return()=>{
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow=previousOverflow;
      window.removeEventListener("keydown",onKeyDown);
      window.requestAnimationFrame(()=>{
        const target=previousFocus?.isConnected?previousFocus:fallbackTrigger;
        target?.focus();
      });
    };
  },[open]);

  const act=async(id:number,action:"accept"|"reject"|"cancel")=>{
    setBusyId(id);setActionError("");
    try{
      const r=await fetch("/api/progression",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||"Не удалось сохранить решение");
      const nextStatus=action==="accept"?"accepted":action==="reject"?"rejected":"cancelled";
      setStatusOverrides(current=>({...current,[id]:nextStatus}));
      setExpandedId(current=>current===id?null:current);
      notify(action==="accept"?"Изменение применено к следующей тренировке":action==="reject"?"Предложение отклонено":"Изменение отменено");
      refresh();
    }catch(error){
      const message=error instanceof Error?error.message:"Не удалось сохранить решение";
      setActionError(message);notify(message,"warn");
    }finally{setBusyId(null)}
  };
  const askAi=async(id:number)=>{
    setBusyId(id);setActionError("");
    try{
      const r=await fetch("/api/progression",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,action:"explain"})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||"ИИ недоступен, но предложение уже посчитано локально");
      setExplain(current=>({...current,[id]:j.answer}));
    }catch(error){
      const message=error instanceof Error?error.message:"ИИ недоступен, но предложение уже посчитано локально";
      setActionError(message);notify(message,"warn");
    }finally{setBusyId(null)}
  };

  const renderChange=(p:ProgressionProposal)=>{
    const meta=ACTION_META[p.action];
    const expanded=expandedId===p.id;
    return <li key={p.id} className={`progression-change ${meta.tone}`}>
      <button type="button" className="progression-change-toggle" aria-expanded={expanded} aria-controls={`progression-change-${p.id}`} onClick={()=>setExpandedId(expanded?null:p.id)}>
        <span className="progression-change-icon" aria-hidden="true">{meta.icon}</span>
        <span><b>{p.exercise}</b><small>{meta.label}</small></span>
        <span className="progression-change-load">{formatLoad(p.from)} <i aria-hidden="true">→</i> {formatLoad(p.to)}</span>
        <span className="progression-chevron" aria-hidden="true">⌄</span>
      </button>
      {expanded&&<div id={`progression-change-${p.id}`} className="progression-change-detail">
        <div className="progression-load-shift">
          <div><small>БЫЛО</small><b>{formatLoad(p.from)}</b></div>
          <i aria-hidden="true">→</i>
          <div><small>СТАНЕТ</small><b>{formatLoad(p.to)}</b></div>
        </div>
        <p>{p.reason}</p>
        {p.usedSignals.length>0&&<p className="coach-signals"><span>Использовано:</span> {p.usedSignals.join(" · ")}</p>}
        {explain[p.id]&&<p className="progression-explanation">{explain[p.id]}</p>}
        <div className="progression-actions">
          <button type="button" className="progression-primary" disabled={busyId===p.id} onClick={()=>act(p.id,"accept")}>{busyId===p.id?"Сохраняю…":"Применить"}</button>
          <button type="button" className="progression-secondary" disabled={busyId===p.id} onClick={()=>act(p.id,"reject")}>Оставить как есть</button>
          {!explain[p.id]&&<button type="button" className="progression-ai-link" disabled={busyId===p.id} onClick={()=>askAi(p.id)}>Спросить у ИИ, почему</button>}
        </div>
      </div>}
    </li>;
  };

  const renderStable=(p:ProgressionProposal)=>{
    const meta=ACTION_META[p.action];
    return <li key={p.id} className="progression-compact-row">
      <span className="progression-change-icon info" aria-hidden="true">{meta.icon}</span>
      <span className="progression-row-copy"><b>{p.exercise}</b><small>{meta.label}</small>{explain[p.id]&&<em>{explain[p.id]}</em>}</span>
      <div className="progression-row-actions">
        <button type="button" className="progression-primary compact" disabled={busyId===p.id} onClick={()=>act(p.id,"accept")}>{busyId===p.id?"Сохраняю…":"Подтвердить"}</button>
        <button type="button" className="progression-secondary compact" disabled={busyId===p.id} onClick={()=>act(p.id,"reject")}>Оставить как есть</button>
        {!explain[p.id]&&<button type="button" className="progression-ai-link" disabled={busyId===p.id} onClick={()=>askAi(p.id)}>Спросить у ИИ, почему</button>}
      </div>
    </li>;
  };

  const renderProcessed=(p:ProgressionProposal)=>{
    const meta=ACTION_META[p.action];
    const statusLabel=p.status==="accepted"?"Применено":p.status==="rejected"?"Отклонено":"Отменено";
    return <li key={p.id} className="progression-compact-row processed">
      <span className={`progression-change-icon ${meta.tone}`} aria-hidden="true">{meta.icon}</span>
      <span className="progression-row-copy"><b>{p.exercise}</b><small>{meta.label} · {statusLabel}{p.decidedAt?` · ${p.decidedAt}`:""}</small>{explain[p.id]&&<em>{explain[p.id]}</em>}</span>
      {p.status==="accepted"&&<div className="progression-row-actions">
        <button type="button" className="progression-secondary compact" disabled={busyId===p.id} onClick={()=>act(p.id,"cancel")}>{busyId===p.id?"Отменяю…":"Отменить решение"}</button>
        {!explain[p.id]&&<button type="button" className="progression-ai-link" disabled={busyId===p.id} onClick={()=>askAi(p.id)}>Спросить у ИИ, почему</button>}
      </div>}
    </li>;
  };

  const summary=pendingChanges.length
    ? `${pendingChanges.length} ${changeNoun(pendingChanges.length)} требуют решения · ${stable.length} ${exerciseNoun(stable.length)} без изменений${appliedCount?` · ${appliedCount} применено`:""}`
    : `Нагрузка стабильна — изменений не требуется${stable.length?` · ${stable.length} ${exerciseNoun(stable.length)} без изменений`:""}${appliedCount?` · ${appliedCount} применено`:""}`;
  const openDetails=()=>{setExpandedId(pendingChanges[0]?.id??null);setActionError("");setOpen(true)};

  return <>
    <section className="progression-panel card" aria-label="Предложения прогрессии нагрузки">
      <div className="progression-summary-copy">
        <p className="eyebrow">ПРОГРЕССИЯ НАГРУЗКИ</p>
        <h3>Прогрессия нагрузки</h3>
        <small>{summary}</small>
      </div>
      <button ref={triggerRef} type="button" className="progression-open" onClick={openDetails}>
        Посмотреть изменения<span aria-hidden="true">{pendingCount||processed.length}</span>
      </button>
    </section>
    {open&&<div className="progression-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section ref={dialogRef} className="progression-modal" role="dialog" aria-modal="true" aria-labelledby="progression-modal-title" aria-describedby="progression-modal-description" tabIndex={-1}>
        <header>
          <div><p className="eyebrow">ПРОГРЕССИЯ НАГРУЗКИ</p><h2 id="progression-modal-title">Изменения нагрузки</h2><small id="progression-modal-description">Считается локально · каждое решение применяется только после подтверждения</small></div>
          <button ref={closeRef} type="button" aria-label="Закрыть рекомендации" onClick={()=>setOpen(false)}>×</button>
        </header>
        <div className="progression-modal-body">
          {actionError&&<p className="progression-error" role="alert">{actionError}</p>}
          <section className="progression-group-section" aria-labelledby="progression-pending-title">
            <div className="progression-group-heading"><div><p className="eyebrow">АКТИВНАЯ ОЧЕРЕДЬ</p><h3 id="progression-pending-title">Требуют решения</h3></div><span>{pendingChanges.length}</span></div>
            {pendingChanges.length?<ol className="progression-change-list">{pendingChanges.map(renderChange)}</ol>:<p className="progression-empty">Реальных изменений нагрузки сейчас нет.</p>}
          </section>
          <details className="progression-group">
            <summary><span><b>Без изменения нагрузки</b><small>Стабильные упражнения, компактно</small></span><em>{stable.length}</em></summary>
            {stable.length?<ol className="progression-compact-list">{stable.map(renderStable)}</ol>:<p className="progression-empty">Нет предложений со стабильной нагрузкой.</p>}
          </details>
          <details className="progression-group">
            <summary><span><b>Обработано</b><small>Принятые, отклонённые и отменённые решения</small></span><em>{processed.length}</em></summary>
            {processed.length?<ol className="progression-compact-list">{processed.map(renderProcessed)}</ol>:<p className="progression-empty">Обработанных решений пока нет.</p>}
          </details>
        </div>
      </section>
    </div>}
  </>;
}
