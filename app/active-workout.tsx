"use client";

import { useMemo, useState } from "react";
import { useToast } from "./toast";
import { exerciseNames, exerciseMediaFor } from "./exercise-catalog";
import { ExerciseVideo } from "./exercise-video";
import { parseCompactSets } from "../lib/quick-set-parser";
import { useMilestones } from "./milestones-section";
import { findNewAutomaticMilestone, type Milestone } from "../lib/milestones";
import { activeWorkoutStatusLabel, isActiveWorkoutView } from "../lib/workout-status";

type Exercise={name:string;order:number;target:string;recommendedWeight:number;sets:number|null;repMin:number|null;repMax:number|null;unit:string};
type ResultSet={weight:number;reps:number};
export type ActiveDraft={id:number;date:string;status:"active"|"awaiting_confirmation"|"completed"|"cancelled";startedAt:string|null;finishedAt:string|null;workoutId:number|null;snapshot:{title:string;type:string;rounds:number;exercises:Exercise[]};confirmation?:{source:"Garmin"|"Manual";duration:number;averageHeartRate:number|null;maxHeartRate:number|null;calories:number|null;lastResults:Record<string,ResultSet[]>}};
// Эхо реального результата lib/active-workout-service.ts#confirmWorkoutDraft
// (result.summary) — экран результата показывает только то, что подтвердил
// сервер, а не то, что клиент "помнит" из формы (см. AI-9 доработка, п.3.4).
export type ConfirmationSummary={workoutId:number;duration:number;effort:string;painAfter:number;metricsSource:"manual"|"imported_metric";confirmationSource:"Garmin"|"Manual";averageHeartRate:number|null;maxHeartRate:number|null;calories:number|null;exercises:{name:string;source:string;setCount:number}[]};

const EFFORT_VALUES=["Легко","Нормально","Тяжело","Боль"] as const;
const formatTime=(iso:string|null)=>iso?new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(iso.replace(" ","T")+"Z")):"—";
const planSets=(exercise:Exercise)=>Array.from({length:exercise.sets??1},()=>({weight:exercise.recommendedWeight,reps:exercise.repMin??0}));
const setsText=(sets:ResultSet[])=>sets.map(set=>`${set.weight} × ${set.reps}`).join("\n");
type ConfirmExercise={name:string;plan:Exercise|null;sets:ResultSet[];skipped:boolean;added:boolean;editing:boolean;mode:"plan"|"last"|"custom";quickText:string;quickError:string|null};
// Источник результата — сохраняется на сервере в фактических данных (details.source),
// а не только в этом временном UI-состоянии (mode/skipped/added). См. AI-9 доработка, п.3.1.
const sourceFor=(item:ConfirmExercise)=>item.skipped?"skipped":item.added?"added":item.mode==="last"?"confirmed_as_previous":item.mode==="plan"?"confirmed_as_planned":"manually_edited";

// Карточка упражнения на экране "Тренировка идёт" раньше показывала только
// имя и диапазон повторов — изображение/описание/видео терялись между
// snapshot тренировки (там их никогда не было, см. startWorkout в
// app/page.tsx) и рендером. Чинится здесь: медиа подтягивается по имени
// упражнения из уже существующего каталога программы (exerciseMediaFor),
// поэтому работает одинаково для старых snapshot (только name/target) и
// новых — без миграции данных и без новых упражнений. Битая или отсутствующая
// ссылка на изображение — это корректный fallback-блок, а не пустое место.
function ExerciseThumbnail({name,image}:{name:string;image:string}){
 const [broken,setBroken]=useState(false);
 if(!image||broken)return <div className="exercise-thumb exercise-thumb-fallback" role="img" aria-label={`Изображение недоступно: ${name}`}>🏋️</div>;
 return <img className="exercise-thumb" src={image} alt={`Пример выполнения: ${name}`} loading="lazy" onError={()=>setBroken(true)}/>;
}

function ConfirmationForm({draft,duration,pending,onConfirm,onCancel}:{draft:ActiveDraft;duration:number;pending:boolean;onConfirm:(exercises:ConfirmExercise[],effort:string,painAfter:number)=>void;onCancel:()=>void}){
 const context=draft.confirmation,last=context?.lastResults??{};
 const [items,setItems]=useState<ConfirmExercise[]>(()=>draft.snapshot.exercises.map(plan=>({name:plan.name,plan,sets:planSets(plan),skipped:false,added:false,editing:false,mode:"plan",quickText:"",quickError:null})));
 const [newName,setNewName]=useState("");
 // Общая сложность и боль после тренировки — те же значения и та же шкала, что
 // у обычной формы завершения (app/training-session.tsx), пользователь видит
 // и подтверждает их до сохранения (AI-9 доработка, п.3.2).
 const [effort,setEffort]=useState<string>("Нормально");
 const [painAfter,setPainAfter]=useState("0");
 const update=(index:number,patch:Partial<ConfirmExercise>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 const allPlan=()=>setItems(current=>current.map(item=>item.plan?{...item,sets:planSets(item.plan),skipped:false,editing:false,mode:"plan"}:item));
 const allLast=()=>setItems(current=>current.map(item=>last[item.name]?.length?{...item,sets:last[item.name],skipped:false,editing:false,mode:"last"}:item));
 const add=()=>{const name=newName.trim();if(!name||items.some(item=>item.name===name))return;setItems(current=>[...current,{name,plan:null,sets:[{weight:0,reps:0}],skipped:false,added:true,editing:true,mode:"custom",quickText:"",quickError:null}]);setNewName("")};
 const applyQuick=(index:number,text:string)=>{
  const result=parseCompactSets(text);
  if(!result.ok){update(index,{quickText:text,quickError:result.error});return}
  update(index,{sets:result.sets,mode:"custom",quickText:text,quickError:null});
 };
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
   {item.editing&&!item.skipped&&<div className="quick-set-editor"><label>Быстрый ввод — например «45×8, 45×8, 45×7»<input type="text" value={item.quickText} onChange={event=>update(index,{quickText:event.target.value})} placeholder="45×8, 45×8, 45×7"/></label><button type="button" className="text-btn" onClick={()=>applyQuick(index,item.quickText)}>Разобрать</button>{item.quickError&&<p className="quick-set-error" role="alert">{item.quickError}</p>}</div>}
   {item.editing&&!item.skipped&&<div className="compact-set-editor">{item.sets.map((set,setIndex)=><div key={setIndex}><label>Вес<input type="number" min="0" max="500" step="0.25" value={set.weight} onChange={event=>update(index,{sets:item.sets.map((x,i)=>i===setIndex?{...x,weight:Number(event.target.value)}:x),mode:"custom"})}/></label><label>Повторы<input type="number" min="0" max="100000" value={set.reps} onChange={event=>update(index,{sets:item.sets.map((x,i)=>i===setIndex?{...x,reps:Number(event.target.value)}:x),mode:"custom"})}/></label><button aria-label={`Удалить подход ${setIndex+1}`} type="button" disabled={item.sets.length===1} onClick={()=>update(index,{sets:item.sets.filter((_,i)=>i!==setIndex),mode:"custom"})}>×</button></div>)}<button type="button" className="text-btn" onClick={()=>update(index,{sets:[...item.sets,{...(item.sets[item.sets.length-1]??{weight:0,reps:0})}],mode:"custom"})}>+ Подход</button></div>}
   <div className="exercise-actions">{last[item.name]?.length?<button type="button" onClick={()=>update(index,{sets:last[item.name],skipped:false,mode:"last"})}>Как в прошлый раз</button>:null}<button type="button" className={item.skipped?"restore":""} onClick={()=>update(index,{skipped:!item.skipped})}>{item.skipped?"Вернуть упражнение":"Пропустить упражнение"}</button>{item.added&&<button type="button" onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}>Удалить</button>}</div>
  </article>)}</div>
  <div className="add-confirm-exercise"><h3>Добавить упражнение</h3><div><input list="confirmation-exercise-catalog" value={newName} onChange={event=>setNewName(event.target.value)} placeholder="Поиск упражнения"/><datalist id="confirmation-exercise-catalog">{exerciseNames.map(name=><option value={name} key={name}/>)}</datalist><button type="button" onClick={add}>Добавить</button></div></div>
  <div className="confirmation-feedback"><label>Нагрузка<select value={effort} onChange={event=>setEffort(event.target.value)}>{EFFORT_VALUES.map(value=><option key={value}>{value}</option>)}</select></label><label>Боль в суставах после, 0–10<input type="number" min="0" max="10" inputMode="numeric" value={painAfter} onChange={event=>setPainAfter(event.target.value)}/></label></div>
  <footer><button className="ghost-btn active-cancel" disabled={pending} onClick={onCancel}>Отменить черновик</button><button disabled={pending||!items.length} onClick={()=>onConfirm(items,effort,Number(painAfter)||0)}>{pending?"Сохраняю…":"Подтвердить тренировку"}</button></footer>
 </div>;
}

function ResultScreen({summary,newMilestone,onEditWorkout}:{summary:ConfirmationSummary|null;newMilestone:Milestone|null;onEditWorkout:()=>void}){
 if(!summary)return <div className="active-completed"><span>✓</span><b>Тренировка выполнена</b><p>Фактические результаты сохранены после подтверждения.</p></div>;
 const grouped={done:summary.exercises.filter(x=>x.source==="confirmed_as_planned"||x.source==="confirmed_as_previous"),changed:summary.exercises.filter(x=>x.source==="manually_edited"),skipped:summary.exercises.filter(x=>x.source==="skipped"),added:summary.exercises.filter(x=>x.source==="added")};
 return <div className="active-completed workout-result">
  <span>✓</span><b>Тренировка выполнена</b>
  <div className="confirmation-summary">
   <span><small>Длительность</small><b>{Math.round(summary.duration/60)} мин</b></span>
   <span><small>Пульс</small><b>{summary.averageHeartRate??"—"}{summary.maxHeartRate?` / ${summary.maxHeartRate}`:""}</b></span>
   <span><small>Калории</small><b>{summary.calories??"—"}</b></span>
   <span><small>Нагрузка</small><b>{summary.effort}{summary.painAfter?` · боль ${summary.painAfter}`:""}</b></span>
  </div>
  <div className="result-exercise-groups">
   {grouped.done.length>0&&<p><b>Выполнено:</b> {grouped.done.map(x=>x.name).join(", ")}</p>}
   {grouped.changed.length>0&&<p><b>Изменено относительно плана:</b> {grouped.changed.map(x=>x.name).join(", ")}</p>}
   {grouped.added.length>0&&<p><b>Добавлено вне плана:</b> {grouped.added.map(x=>x.name).join(", ")}</p>}
   {grouped.skipped.length>0&&<p><b>Пропущено:</b> {grouped.skipped.map(x=>x.name).join(", ")}</p>}
  </div>
  {newMilestone&&<div className="result-milestone"><b>🏁 {newMilestone.title}</b><p>{newMilestone.summary}</p></div>}
  <button type="button" className="ghost-btn" onClick={onEditWorkout}>Редактировать результаты</button>
 </div>;
}

export function ActiveWorkout({draft,data,onChanged,onClose,onEditWorkout}:{draft:ActiveDraft;data:any;onChanged:(draft:ActiveDraft)=>void;onClose:()=>void;onEditWorkout:()=>void}){
 const notify=useToast(),[pending,setPending]=useState(false);
 const [summary,setSummary]=useState<ConfirmationSummary|null>(null);
 // PR/вехи на экране результата — только то, что реально посчитал существующий
 // детерминированный код (lib/milestones.ts), не выдумка на клиенте (AI-9
 // доработка, п.3.4). Момент "до подтверждения" фиксируем в ref, чтобы после
 // обновления data (родитель вызывает load()) отличить уже показанную веху от
 // только что появившейся.
 const milestones=useMilestones(data);
 const [preConfirmMilestoneId,setPreConfirmMilestoneId]=useState<string|null>(null);
 const newMilestone=draft.status==="completed"?findNewAutomaticMilestone(milestones,preConfirmMilestoneId):null;
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
   if(action==="confirmWorkoutDraft")setSummary(json.summary??null);
   onChanged(json.draft);
  }finally{setPending(false)}
 };
 const cancel=()=>{if(confirm("Отменить этот черновик? Он останется в истории, фактическая тренировка создана не будет."))void action("cancelWorkoutDraft")};
 const isActiveView=isActiveWorkoutView(draft.status);
 const statusLabel=activeWorkoutStatusLabel(draft.status);
 const confirmWorkout=(exercises:ConfirmExercise[],effort:string,painAfter:number)=>{
  setPreConfirmMilestoneId(milestones.find(m=>m.automatic)?.id??null);
  void action("confirmWorkoutDraft",{durationSeconds:duration,effort,painAfter,exercises:exercises.map(item=>({name:item.name,sets:item.sets,skipped:item.skipped,added:item.added,source:sourceFor(item)}))});
 };
 return <div className="modal-backdrop focus-mode active-workout-mode">
  <section className="workout-modal active-workout-card">
   <header><div><p className="eyebrow">{statusLabel}</p><h2>{draft.snapshot.title}</h2></div><button aria-label="Закрыть" onClick={onClose}>×</button></header>
   {isActiveView&&<><div className="active-workout-meta"><span>Начало <b>{formatTime(draft.startedAt)}</b></span><span>{draft.snapshot.exercises.length} упражнений</span>{draft.snapshot.rounds>1&&<span>{draft.snapshot.rounds} круга</span>}</div>
   <div className="active-plan-list">{draft.snapshot.exercises.map(exercise=>{
    const media=exerciseMediaFor(exercise.name);
    return <article key={`${exercise.order}-${exercise.name}`} className="active-plan-item">
     <ExerciseThumbnail name={exercise.name} image={media?.image??""}/>
     <div className="active-plan-item-body">
      <div className="active-plan-item-head"><span>{exercise.order+1}</span><b>{exercise.name}</b></div>
      <p className="active-plan-item-desc">{media?.description||"Описание техники для этого упражнения пока недоступно — двигайся подконтрольно, без боли."}</p>
      <b className="active-plan-item-target">{exercise.target}{exercise.recommendedWeight>0?` · ${exercise.recommendedWeight} кг`:""}</b>
      <ExerciseVideo name={exercise.name} compact/>
     </div>
    </article>;
   })}</div></>}
   {isActiveView&&<><p className="active-workout-hint">План сохранён в черновике. Во время занятия ничего вводить не обязательно.</p><footer><button className="ghost-btn active-cancel" disabled={pending} onClick={cancel}>Отменить черновик</button><button disabled={pending} onClick={()=>action("finishWorkoutDraft")}>{pending?"Сохраняю…":"Завершить тренировку"}</button></footer></>}
   {draft.status==="awaiting_confirmation"&&<ConfirmationForm draft={draft} duration={duration} pending={pending} onCancel={cancel} onConfirm={confirmWorkout}/>}
   {draft.status==="completed"&&<ResultScreen summary={summary} newMilestone={newMilestone} onEditWorkout={onEditWorkout}/>}
  </section>
 </div>;
}
