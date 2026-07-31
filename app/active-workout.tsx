"use client";

import { useMemo, useState } from "react";
import { useToast } from "./toast";
import { exerciseNames } from "./exercise-catalog";

type Exercise={name:string;order:number;target:string;recommendedWeight:number;sets:number|null;repMin:number|null;repMax:number|null;unit:string};
type ResultSet={weight:number;reps:number};
export type ActiveDraft={id:number;date:string;status:"active"|"awaiting_confirmation"|"completed"|"cancelled";startedAt:string|null;finishedAt:string|null;workoutId:number|null;snapshot:{title:string;type:string;rounds:number;exercises:Exercise[]};confirmation?:{source:"Garmin"|"Manual";duration:number;averageHeartRate:number|null;maxHeartRate:number|null;calories:number|null;lastResults:Record<string,ResultSet[]>}};

const formatTime=(iso:string|null)=>iso?new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(iso.replace(" ","T")+"Z")):"—";
const planSets=(exercise:Exercise)=>Array.from({length:exercise.sets??1},()=>({weight:exercise.recommendedWeight,reps:exercise.repMin??0}));
const setsText=(sets:ResultSet[])=>sets.map(set=>`${set.weight} × ${set.reps}`).join("\n");
type ConfirmExercise={name:string;plan:Exercise|null;sets:ResultSet[];skipped:boolean;added:boolean;editing:boolean;mode:"plan"|"last"|"custom"};

function ConfirmationForm({draft,duration,pending,onConfirm,onCancel}:{draft:ActiveDraft;duration:number;pending:boolean;onConfirm:(exercises:ConfirmExercise[])=>void;onCancel:()=>void}){
 const context=draft.confirmation,last=context?.lastResults??{};
 const [items,setItems]=useState<ConfirmExercise[]>(()=>draft.snapshot.exercises.map(plan=>({name:plan.name,plan,sets:planSets(plan),skipped:false,added:false,editing:false,mode:"plan"})));
 const [newName,setNewName]=useState("");
 const update=(index:number,patch:Partial<ConfirmExercise>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 const allPlan=()=>setItems(current=>current.map(item=>item.plan?{...item,sets:planSets(item.plan),skipped:false,editing:false,mode:"plan"}:item));
 const allLast=()=>setItems(current=>current.map(item=>last[item.name]?.length?{...item,sets:last[item.name],skipped:false,editing:false,mode:"last"}:item));
 const add=()=>{const name=newName.trim();if(!name||items.some(item=>item.name===name))return;setItems(current=>[...current,{name,plan:null,sets:[{weight:0,reps:0}],skipped:false,added:true,editing:true,mode:"custom"}]);setNewName("")};
 return <div className="confirmation-screen">
  <div className="confirmation-summary">
   <span><small>Длительность</small><b>{Math.round((context?.duration??duration)/60)} мин</b></span>
   <span><small>Пульс</small><b>{context?.averageHeartRate??"—"}{context?.maxHeartRate?` / ${context.maxHeartRate}`:""}</b></span>
   <span><small>Калории</small><b>{context?.calories??"—"}</b></span>
   <span><small>Источник</small><b>{context?.source??"Manual"}</b></span>
  </div>
  <div className="confirmation-quick"><button type="button" onClick={allPlan}>✓ Всё выполнено по плану</button><button type="button" className="ghost-btn" disabled={!Object.keys(last).length} onClick={allLast}>Всё как в прошлый раз</button></div>
  <div className="confirmation-exercises">{items.map((item,index)=><article className={item.skipped?"is-skipped":""} key={`${item.added?"added":"plan"}-${item.name}`}>
   <div className="confirmation-exercise-head"><div><b>{item.name}</b>{item.added&&<em>Вне плана</em>}</div><button type="button" className="text-btn" onClick={()=>update(index,{editing:!item.editing})}>{item.editing?"Свернуть":"Изменить"}</button></div>
   {item.plan&&<div className="exercise-comparison"><span><small>План</small><b>{item.plan.recommendedWeight} × {item.plan.repMin??0} × {item.plan.sets??1}</b></span><span><small>Последний результат</small><b>{last[item.name]?.length?setsText(last[item.name]):"Нет данных"}</b></span><span><small>Сегодня</small><b>{item.skipped?"Пропущено":item.mode==="last"?"Как в прошлый раз":item.mode==="plan"?"Выполнено по плану":"Изменено"}</b></span></div>}
   {item.editing&&!item.skipped&&<div className="compact-set-editor">{item.sets.map((set,setIndex)=><div key={setIndex}><label>Вес<input type="number" min="0" max="500" step="0.25" value={set.weight} onChange={event=>update(index,{sets:item.sets.map((x,i)=>i===setIndex?{...x,weight:Number(event.target.value)}:x),mode:"custom"})}/></label><label>Повторы<input type="number" min="0" max="100000" value={set.reps} onChange={event=>update(index,{sets:item.sets.map((x,i)=>i===setIndex?{...x,reps:Number(event.target.value)}:x),mode:"custom"})}/></label><button aria-label={`Удалить подход ${setIndex+1}`} type="button" disabled={item.sets.length===1} onClick={()=>update(index,{sets:item.sets.filter((_,i)=>i!==setIndex),mode:"custom"})}>×</button></div>)}<button type="button" className="text-btn" onClick={()=>update(index,{sets:[...item.sets,{...(item.sets[item.sets.length-1]??{weight:0,reps:0})}],mode:"custom"})}>+ Подход</button></div>}
   <div className="exercise-actions">{last[item.name]?.length?<button type="button" onClick={()=>update(index,{sets:last[item.name],skipped:false,mode:"last"})}>Как в прошлый раз</button>:null}<button type="button" className={item.skipped?"restore":""} onClick={()=>update(index,{skipped:!item.skipped})}>{item.skipped?"Вернуть упражнение":"Пропустить упражнение"}</button>{item.added&&<button type="button" onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}>Удалить</button>}</div>
  </article>)}</div>
  <div className="add-confirm-exercise"><h3>Добавить упражнение</h3><div><input list="confirmation-exercise-catalog" value={newName} onChange={event=>setNewName(event.target.value)} placeholder="Поиск упражнения"/><datalist id="confirmation-exercise-catalog">{exerciseNames.map(name=><option value={name} key={name}/>)}</datalist><button type="button" onClick={add}>Добавить</button></div></div>
  <footer><button className="ghost-btn active-cancel" disabled={pending} onClick={onCancel}>Отменить черновик</button><button disabled={pending||!items.length} onClick={()=>onConfirm(items)}>{pending?"Сохраняю…":"Подтвердить тренировку"}</button></footer>
 </div>;
}

export function ActiveWorkout({draft,onChanged,onClose}:{draft:ActiveDraft;onChanged:(draft:ActiveDraft)=>void;onClose:()=>void}){
 const notify=useToast(),[pending,setPending]=useState(false);
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
   {draft.status==="active"&&<><div className="active-workout-meta"><span>Начало <b>{formatTime(draft.startedAt)}</b></span><span>{draft.snapshot.exercises.length} упражнений</span>{draft.snapshot.rounds>1&&<span>{draft.snapshot.rounds} круга</span>}</div>
   <div className="active-plan-list">{draft.snapshot.exercises.map(exercise=><article key={`${exercise.order}-${exercise.name}`}><span>{exercise.order+1}</span><div><b>{exercise.name}</b><small>{exercise.target}{exercise.recommendedWeight>0?` · ${exercise.recommendedWeight} кг`:""}</small></div></article>)}</div></>}
   {draft.status==="active"&&<><p className="active-workout-hint">План сохранён в черновике. Во время занятия ничего вводить не обязательно.</p><footer><button className="ghost-btn active-cancel" disabled={pending} onClick={cancel}>Отменить черновик</button><button disabled={pending} onClick={()=>action("finishWorkoutDraft")}>{pending?"Сохраняю…":"Завершить тренировку"}</button></footer></>}
   {draft.status==="awaiting_confirmation"&&<ConfirmationForm draft={draft} duration={duration} pending={pending} onCancel={cancel} onConfirm={exercises=>action("confirmWorkoutDraft",{durationSeconds:duration,exercises:exercises.map(item=>({name:item.name,sets:item.sets,skipped:item.skipped,added:item.added}))})}/>}
   {draft.status==="completed"&&<div className="active-completed"><span>✓</span><b>Тренировка выполнена</b><p>Фактические результаты сохранены после подтверждения.</p></div>}
  </section>
 </div>;
}
