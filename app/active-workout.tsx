"use client";

import { useMemo, useState } from "react";
import { useToast } from "./toast";

type Exercise={name:string;order:number;target:string;recommendedWeight:number;sets:number|null;repMin:number|null;repMax:number|null;unit:string};
export type ActiveDraft={id:number;date:string;status:"active"|"awaiting_confirmation"|"completed"|"cancelled";startedAt:string|null;finishedAt:string|null;workoutId:number|null;snapshot:{title:string;type:string;rounds:number;exercises:Exercise[]}};

const formatTime=(iso:string|null)=>iso?new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(iso.replace(" ","T")+"Z")):"—";

export function ActiveWorkout({draft,onChanged,onClose}:{draft:ActiveDraft;onChanged:(draft:ActiveDraft)=>void;onClose:()=>void}){
 const notify=useToast(),[pending,setPending]=useState(false),[confirmed,setConfirmed]=useState(false);
 const duration=useMemo(()=>{
  if(!draft.startedAt)return 0;
  const end=draft.finishedAt?new Date(draft.finishedAt.replace(" ","T")+"Z").getTime():new Date(draft.startedAt.replace(" ","T")+"Z").getTime();
  return Math.max(0,Math.round((end-new Date(draft.startedAt.replace(" ","T")+"Z").getTime())/1000));
 },[draft.startedAt,draft.finishedAt]);
 const action=async(action:string,extra:Record<string,unknown>={})=>{
  setPending(true);
  try{
   const response=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,id:draft.id,expectedStatus:draft.status,...extra})});
   const json=await response.json().catch(()=>({}));
   if(!response.ok){notify(json.error||"Не удалось обновить тренировку","warn");return}
   onChanged(json.draft);
  }finally{setPending(false)}
 };
 const cancel=()=>{if(confirm("Отменить этот черновик? Он останется в истории, фактическая тренировка создана не будет."))void action("cancelWorkoutDraft")};
 return <div className="modal-backdrop focus-mode active-workout-mode">
  <section className="workout-modal active-workout-card">
   <header><div><p className="eyebrow">{draft.status==="active"?"ТРЕНИРОВКА ИДЁТ":draft.status==="awaiting_confirmation"?"ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ":"ТРЕНИРОВКА ВЫПОЛНЕНА"}</p><h2>{draft.snapshot.title}</h2></div><button aria-label="Закрыть" onClick={onClose}>×</button></header>
   <div className="active-workout-meta"><span>Начало <b>{formatTime(draft.startedAt)}</b></span><span>{draft.snapshot.exercises.length} упражнений</span>{draft.snapshot.rounds>1&&<span>{draft.snapshot.rounds} круга</span>}</div>
   <div className="active-plan-list">{draft.snapshot.exercises.map(exercise=><article key={`${exercise.order}-${exercise.name}`}><span>{exercise.order+1}</span><div><b>{exercise.name}</b><small>{exercise.target}{exercise.recommendedWeight>0?` · ${exercise.recommendedWeight} кг`:""}</small></div></article>)}</div>
   {draft.status==="active"&&<><p className="active-workout-hint">План сохранён в черновике. Во время занятия ничего вводить не обязательно.</p><footer><button className="ghost-btn active-cancel" disabled={pending} onClick={cancel}>Отменить черновик</button><button disabled={pending} onClick={()=>action("finishWorkoutDraft")}>{pending?"Сохраняю…":"Завершить тренировку"}</button></footer></>}
   {draft.status==="awaiting_confirmation"&&<><div className="active-confirm"><h3>Подтвердить результаты</h3><p>Плановые веса и повторы ещё не считаются фактическими. Подтверди только если тренировка выполнена по сохранённому плану.</p><label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> Я подтверждаю выполнение по плану</label></div><footer><button className="ghost-btn active-cancel" disabled={pending} onClick={cancel}>Отменить черновик</button><button disabled={!confirmed||pending} onClick={()=>action("confirmWorkoutDraft",{durationSeconds:duration})}>{pending?"Сохраняю…":"Подтвердить результаты"}</button></footer></>}
   {draft.status==="completed"&&<div className="active-completed"><span>✓</span><b>Тренировка выполнена</b><p>Фактические результаты сохранены после подтверждения.</p></div>}
  </section>
 </div>;
}
