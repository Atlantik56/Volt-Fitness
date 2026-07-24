"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExerciseVideo } from "./exercise-video";
import { progressionDecision, type ProgressDecision } from "./exercise-progress";
import { exerciseReplacement } from "./exercise-replacements";
import {
  activityKindOf, buildSessionSteps, exerciseUnit, readWorkoutDraft, sessionClock,
  WORKOUT_DRAFT_STORAGE_KEY, WORKOUT_DRAFT_VERSION,
  type ActivityKind, type ExerciseStep, type WorkoutDraft, type WorkoutPlan,
} from "./training-session-model";

type StrengthLog={exercise:string;weight?:number;reps?:number;difficulty?:string};
type MetricKey="minHeartRate"|"avgHeartRate"|"maxHeartRate"|"calories"|"distanceMeters"|"avgSpeed";
type MetricField=readonly [key:MetricKey,label:string,unit:string];
type Details={key:string;name:string;originalName:string;value:number;weight:number;difficulty:string;unit:string};
const EMPTY_METRICS:Record<MetricKey,string>={minHeartRate:"",avgHeartRate:"",maxHeartRate:"",calories:"",distanceMeters:"",avgSpeed:""};
const METRIC_FIELDS:Record<ActivityKind,readonly MetricField[]>={
  swim:[["minHeartRate","Мин. пульс","уд/мин"],["avgHeartRate","Средний пульс","уд/мин"],["maxHeartRate","Макс. пульс","уд/мин"],["distanceMeters","Проплыл","м"]],
  bike:[["minHeartRate","Мин. пульс","уд/мин"],["avgHeartRate","Средний пульс","уд/мин"],["maxHeartRate","Макс. пульс","уд/мин"],["distanceMeters","Расстояние","м"],["avgSpeed","Средняя скорость","км/ч"]],
  strength:[["minHeartRate","Мин. пульс","уд/мин"],["avgHeartRate","Средний пульс","уд/мин"],["maxHeartRate","Макс. пульс","уд/мин"],["calories","Сожжено","ккал"]],
};

function initialWeights(plan:WorkoutPlan,logs:StrengthLog[]){
  return Object.fromEntries(plan.exercises.map((exercise,index)=>[String(index),String(logs.find(log=>log.exercise===exercise[0])?.weight||"")]));
}

function useWorkoutSession(plan:WorkoutPlan,strengthLogs:StrengthLog[]){
  const steps=useMemo(()=>buildSessionSteps(plan),[plan]);
  const [draft]=useState(()=>readWorkoutDraft(plan.title));
  const [cursor,setCursor]=useState(()=>Math.min(draft?.cursor??0,steps.length));
  const [values,setValues]=useState<Record<string,string>>(draft?.values??{});
  const [weights,setWeights]=useState<Record<string,string>>(draft?.weights??initialWeights(plan,strengthLogs));
  const [difficulties,setDifficulties]=useState<Record<string,string>>(draft?.difficulties??{});
  const [substitutions,setSubstitutions]=useState<Record<string,boolean>>(draft?.substitutions??{});
  const [activeSeconds,setActiveSeconds]=useState(draft?.activeSeconds??0);
  const [restSecondsSpent,setRestSecondsSpent]=useState(draft?.restSecondsSpent??0);
  const [metrics,setMetrics]=useState<Record<MetricKey,string>>({...EMPTY_METRICS,...draft?.metrics});
  const [effort,setEffort]=useState(draft?.effort??"Нормально");
  const [painAfter,setPainAfter]=useState(draft?.painAfter??"0");
  const finished=cursor>=steps.length;
  const step=finished?null:steps[cursor];

  useEffect(()=>{
    if(finished)return;
    const timer=window.setInterval(()=>step?.kind==="rest"?setRestSecondsSpent(value=>value+1):setActiveSeconds(value=>value+1),1000);
    return()=>window.clearInterval(timer);
  },[finished,step?.kind]);

  useEffect(()=>{
    if(finished)return;
    const timer=window.setTimeout(()=>{
      const nextDraft:WorkoutDraft={version:WORKOUT_DRAFT_VERSION,title:plan.title,cursor,values,weights,difficulties,substitutions,metrics,effort,painAfter,activeSeconds,restSecondsSpent,savedAt:Date.now()};
      localStorage.setItem(WORKOUT_DRAFT_STORAGE_KEY,JSON.stringify(nextDraft));
    },250);
    return()=>window.clearTimeout(timer);
  },[plan.title,cursor,values,weights,difficulties,substitutions,metrics,effort,painAfter,activeSeconds,restSecondsSpent,finished]);

  const advance=useCallback(()=>setCursor(value=>Math.min(value+1,steps.length)),[steps.length]);
  const clearDraft=useCallback(()=>localStorage.removeItem(WORKOUT_DRAFT_STORAGE_KEY),[]);
  return {steps,cursor,step,finished,values,setValues,weights,setWeights,difficulties,setDifficulties,substitutions,setSubstitutions,activeSeconds,restSecondsSpent,metrics,setMetrics,effort,setEffort,painAfter,setPainAfter,advance,clearDraft};
}

export function WorkoutSession({plan,strengthLogs,close,done}:{plan:WorkoutPlan;strengthLogs:StrengthLog[];close:()=>void;done:()=>void}){
  const session=useWorkoutSession(plan,strengthLogs);
  const rounds=Math.max(1,plan.rounds??1),activityKind=activityKindOf(plan),warmupCount=plan.warmup?.length??0;
  const showLoad=activityKind==="strength";
  const details=useMemo<Details[]>(()=>Array.from({length:rounds}).flatMap((_,roundIndex)=>plan.exercises.map((exercise,exerciseIndex)=>{
    const replacement=exerciseReplacement(exercise[0],exercise[3]),replaced=!!session.substitutions[String(exerciseIndex)];
    return {key:`${roundIndex}-${exerciseIndex}`,name:replaced?replacement.name:exercise[0],originalName:exercise[0],value:Number(session.values[`${roundIndex}-${exerciseIndex}`])||0,weight:Number(session.weights[String(exerciseIndex)])||0,difficulty:session.difficulties[String(exerciseIndex)]||"Нормально",unit:exerciseUnit(exercise[0])};
  })),[rounds,plan.exercises,session.substitutions,session.values,session.weights,session.difficulties]);
  const reps=useMemo(()=>details.filter(item=>item.unit==="повт.").reduce((total,item)=>total+item.value,0),[details]);
  const plank=useMemo(()=>details.filter(item=>item.unit==="сек").reduce((total,item)=>total+item.value,0),[details]);
  const nextDecisions=useMemo(()=>plan.exercises.map((exercise,index)=>{
    const performed=details.filter(item=>item.originalName===exercise[0]);
    return {name:exercise[0],...progressionDecision(exercise[0],exercise[2],strengthLogs,{weight:Number(session.weights[String(index)])||0,reps:Math.max(...performed.map(item=>item.value),0),difficulty:session.difficulties[String(index)]||"Нормально"})};
  }),[plan.exercises,details,strengthLogs,session.weights,session.difficulties]);
  const metricFields=METRIC_FIELDS[activityKind];
  const metricsValid=metricFields.every(([key])=>Number(session.metrics[key])>0)&&Number(session.metrics.minHeartRate)<=Number(session.metrics.avgHeartRate)&&Number(session.metrics.avgHeartRate)<=Number(session.metrics.maxHeartRate);
  const discard=useCallback(()=>{if(!confirm("Прервать тренировку? Прогресс будет потерян."))return;session.clearDraft();close()},[session,close]);
  const finish=async()=>{
    const completed=session.steps.slice(0,session.cursor).filter(step=>step.kind==="exercise").map(step=>step.key);
    const response=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"workout",date:localIso(new Date()),type:plan.type,title:plan.title,rounds,completed,durationSeconds:session.activeSeconds,restSeconds:session.restSecondsSpent,details,effort:session.effort,painAfter:session.painAfter,...session.metrics})});
    if(!response.ok)return;
    session.clearDraft();done();
  };
  const step=session.step;
  return <div className="modal-backdrop focus-mode session-mode">
    {session.finished?<WorkoutFinishView plan={plan} rounds={rounds} activeSeconds={session.activeSeconds} reps={reps} plank={plank} nextDecisions={nextDecisions} activityKind={activityKind} metricFields={metricFields} metrics={session.metrics} onMetric={(key,value)=>session.setMetrics(current=>({...current,[key]:value}))} effort={session.effort} onEffort={session.setEffort} painAfter={session.painAfter} onPainAfter={session.setPainAfter} metricsValid={metricsValid} onSave={finish} onClose={discard}/>
    :step?.kind==="rest"?<RestStepView key={step.key} totalSeconds={step.durationSeconds} nextName={step.nextExerciseName} onAdvance={session.advance} onDiscard={discard}/>
    :step?<ExerciseStepView key={step.key} step={step} showLoad={showLoad} positionLabel={step.phase==="warmup"?`Разминка · ${step.exerciseIndex+1} из ${warmupCount}`:`Упражнение ${step.roundIndex*plan.exercises.length+step.exerciseIndex+1} из ${rounds*plan.exercises.length}${rounds>1?` · Круг ${step.roundIndex+1} из ${rounds}`:""}`} activeSeconds={session.activeSeconds} value={session.values[step.key]||""} onValue={value=>session.setValues(current=>({...current,[step.key]:value}))} weight={session.weights[String(step.exerciseIndex)]||""} onWeight={value=>session.setWeights(current=>({...current,[String(step.exerciseIndex)]:value}))} difficulty={session.difficulties[String(step.exerciseIndex)]||"Нормально"} onDifficulty={value=>session.setDifficulties(current=>({...current,[String(step.exerciseIndex)]:value}))} substituted={!!session.substitutions[String(step.exerciseIndex)]} onSubstitute={()=>session.setSubstitutions(current=>({...current,[String(step.exerciseIndex)]:!current[String(step.exerciseIndex)]}))} recommendation={progressionDecision(step.exercise[0],step.exercise[2],strengthLogs)} onDone={session.advance} onDiscard={discard}/>:null}
  </div>;
}

function ExerciseStepView({step,showLoad,positionLabel,activeSeconds,value,onValue,weight,onWeight,difficulty,onDifficulty,substituted,onSubstitute,recommendation,onDone,onDiscard}:{step:ExerciseStep;showLoad:boolean;positionLabel:string;activeSeconds:number;value:string;onValue:(v:string)=>void;weight:string;onWeight:(v:string)=>void;difficulty:string;onDifficulty:(v:string)=>void;substituted:boolean;onSubstitute:()=>void;recommendation:ProgressDecision;onDone:()=>void;onDiscard:()=>void}){
  const [formOpen,setFormOpen]=useState(()=>value!=="");
  const [replacementOpen,setReplacementOpen]=useState(false);
  const replacement=exerciseReplacement(step.exercise[0],step.exercise[3]);
  const display=substituted?replacement:{name:step.exercise[0],image:step.exercise[3],explanation:step.exercise[1]};
  const canSave=step.phase==="warmup"||Number(value)>0;
  const handlePrimary=()=>{if(step.phase==="warmup")return onDone();if(!formOpen)return setFormOpen(true);if(canSave)onDone()};
  return <section className="session-card">
    <header className="session-card-head"><div><p className="eyebrow">{positionLabel}</p><h2>{display.name}</h2></div><div className="session-clock"><b>{sessionClock(activeSeconds)}</b><span>тренировка</span></div><button aria-label="Прервать тренировку" onClick={onDiscard}>×</button></header>
    <div className="session-card-body"><div className="session-media">{display.image?<img src={display.image} alt={`Техника: ${display.name}`}/>:null}<ExerciseVideo name={display.name}/></div><div className="session-info">
      {substituted&&<em className="replacement-badge">БЕЗОПАСНАЯ ЗАМЕНА</em>}<p className="session-target"><strong>{step.exercise[2]}</strong></p><p className="session-note">{display.explanation}</p>
      {step.phase==="work"&&showLoad&&<div className={`progress-hint ${recommendation.kind}`}><span>{recommendation.title}</span><small>{recommendation.text}</small></div>}
      <button type="button" className="pain-replacement" onClick={()=>setReplacementOpen(open=>!open)}>Больно / неудобно</button>
      {replacementOpen&&<section className="replacement-panel"><img src={replacement.image} alt={`Замена: ${replacement.name}`}/><div><small>СУСТАВОСБЕРЕГАЮЩИЙ ВАРИАНТ</small><b>{replacement.name}</b><p>{replacement.explanation}</p><button type="button" onClick={()=>{onSubstitute();setReplacementOpen(false)}}>{substituted?"Вернуть исходное":"Использовать замену"}</button></div></section>}
      {step.phase==="work"&&formOpen&&<div className="session-result-form actual-fields"><label><span>Фактически</span><div><input autoFocus aria-label="Фактически" type="number" min="0" inputMode="numeric" value={value} onChange={event=>onValue(event.target.value)}/><em>{exerciseUnit(step.exercise[0])}</em></div></label>{showLoad&&<><label><span>Рабочий вес</span><div><input aria-label="Рабочий вес" type="number" min="0" step="0.5" inputMode="decimal" placeholder="0" value={weight} onChange={event=>onWeight(event.target.value)}/><em>кг</em></div></label><label><span>Сложность (RPE)</span><select aria-label="Сложность" value={difficulty} onChange={event=>onDifficulty(event.target.value)}><option>Легко</option><option>Нормально</option><option>Тяжело</option><option>Боль</option></select></label><p className="weight-help">Гантели — вес одной, не ×2. Тренажёр — значение на стеке. 0 — собственный вес.</p></>}</div>}
    </div></div>
    <footer className="session-card-foot"><button className="session-primary" disabled={formOpen&&!canSave} onClick={handlePrimary}>{step.phase==="warmup"?"Готово":formOpen?(canSave?"Сохранить и продолжить":"Укажи результат"):"Выполнено"}</button></footer>
  </section>;
}

function RestStepView({totalSeconds,nextName,onAdvance,onDiscard}:{totalSeconds:number;nextName:string;onAdvance:()=>void;onDiscard:()=>void}){
  const [secondsLeft,setSecondsLeft]=useState(totalSeconds);
  useEffect(()=>{const timer=window.setInterval(()=>setSecondsLeft(value=>{if(value<=1){window.clearInterval(timer);onAdvance();return 0}return value-1}),1000);return()=>window.clearInterval(timer)},[onAdvance]);
  const pct=Math.max(0,Math.min(100,Math.round((1-secondsLeft/totalSeconds)*100)));
  return <section className="session-card rest-card"><header className="session-card-head"><div><p className="eyebrow">ОТДЫХ</p><h2>Дыши спокойно</h2></div><button aria-label="Прервать тренировку" onClick={onDiscard}>×</button></header><div className="rest-body"><div className="rest-clock">{secondsLeft}</div><div className="rest-progress"><i style={{width:`${pct}%`}}/></div><p className="rest-next">Дальше: <b>{nextName}</b></p></div><footer className="session-card-foot"><button className="session-primary" onClick={onAdvance}>Пропустить отдых</button></footer></section>;
}

function WorkoutFinishView({plan,rounds,activeSeconds,reps,plank,nextDecisions,activityKind,metricFields,metrics,onMetric,effort,onEffort,painAfter,onPainAfter,metricsValid,onSave,onClose}:{plan:WorkoutPlan;rounds:number;activeSeconds:number;reps:number;plank:number;nextDecisions:(ProgressDecision&{name:string})[];activityKind:ActivityKind;metricFields:readonly MetricField[];metrics:Record<MetricKey,string>;onMetric:(k:MetricKey,v:string)=>void;effort:string;onEffort:(v:string)=>void;painAfter:string;onPainAfter:(v:string)=>void;metricsValid:boolean;onSave:()=>void;onClose:()=>void}){
  return <section className="workout-modal workout-summary"><header><div><p className="eyebrow">ТРЕНИРОВКА ЗАВЕРШЕНА</p><h2>Отличная работа</h2></div><button aria-label="Закрыть и сбросить тренировку" onClick={onClose}>×</button></header><div className="summary-grid"><article><b>{sessionClock(activeSeconds)}</b><span>активное время</span></article><article><b>{reps}</b><span>повторений</span></article><article><b>{plank}</b><span>секунд планки</span></article><article><b>{rounds}</b><span>{rounds===1?"круг":"круга"}</span></article></div><p>{plan.exercises.length} упражнений в каждом круге.</p>
    {activityKind==="strength"&&<div className="progress-decisions"><div><p className="eyebrow">VOLT COACH</p><h3>Следующая тренировка</h3></div>{nextDecisions.map(item=><article className={item.kind} key={item.name}><span>{item.kind==="weight"?"↑":item.kind==="reps"?"+":item.kind==="deload"?"↓":"="}</span><div><b>{item.name}</b><strong>{item.title}</strong><small>{item.text}</small></div></article>)}</div>}
    <div className="result-metrics"><div><p className="eyebrow">САМОЧУВСТВИЕ</p><h3>Как прошла нагрузка</h3></div><div className="result-fields"><label><span>Нагрузка</span><select value={effort} onChange={event=>onEffort(event.target.value)}>{["Легко","Нормально","Тяжело","Боль"].map(value=><option key={value}>{value}</option>)}</select></label><label><span>Боль в суставах после, 0–10</span><input type="number" min="0" max="10" inputMode="numeric" value={painAfter} onChange={event=>onPainAfter(event.target.value)}/></label></div></div>
    <div className="result-metrics"><div><p className="eyebrow">ДАННЫЕ С ЧАСОВ</p><h3>{activityKind==="swim"?"Плавание":activityKind==="bike"?"Велотренировка":"Нагрузка и пульс"}</h3></div><div className="result-fields">{metricFields.map(([key,label,unit])=><label key={key}><span>{label}</span><div><input type="number" min="1" step={key==="avgSpeed"?"0.1":"1"} inputMode="decimal" value={metrics[key]} onChange={event=>onMetric(key,event.target.value)}/><em>{unit}</em></div></label>)}</div>{metrics.minHeartRate&&metrics.avgHeartRate&&metrics.maxHeartRate&&!metricsValid&&<small>Проверь пульс: минимальный ≤ средний ≤ максимальный.</small>}</div><button className="save-workout" disabled={!metricsValid} onClick={onSave}>{metricsValid?"Сохранить тренировку":"Заполни данные тренировки"}</button>
  </section>;
}

function localIso(date:Date){const local=new Date(date.getTime()-date.getTimezoneOffset()*60_000);return local.toISOString().slice(0,10)}
