"use client";

import { useMemo, useState } from "react";
import { computeCardioRecords, computeStrengthRecords, type WorkoutRecord } from "./training-analytics-model";
import { useToast } from "./toast";

const localIso=(d:Date)=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const post=(body:Record<string,unknown>)=>fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});

const zones=["Шея","Плечи","Локти","Запястья","Спина","Тазобедренные","Колени","Голеностоп"];
const zoneMarkers:Record<string,string[]>={
 "Шея":["neck"],
 "Плечи":["shoulder-left","shoulder-right"],
 "Локти":["elbow-left","elbow-right"],
 "Запястья":["wrist-left","wrist-right"],
 "Спина":["back"],
 "Тазобедренные":["hip-left","hip-right"],
 "Колени":["knee-left","knee-right"],
 "Голеностоп":["ankle-left","ankle-right"],
};
export function BodyMap({data,refresh}:{data:any;refresh:()=>void}){
 const notify=useToast();
 const today=localIso(new Date()),current=(data.wellnessLogs||[]).find((x:any)=>x.date===today)||{},[zone,setZone]=useState(current.painArea||""),[pain,setPain]=useState(String(current.pain||0)),[message,setMessage]=useState("");
 const save=async()=>{const r=await post({action:"wellness",date:today,energy:current.energy||3,pain,painArea:zone,note:current.note||""});const ok=r.ok;setMessage(ok?"Состояние сохранено":"Не удалось сохранить");notify(ok?"Состояние сохранено":"Не удалось сохранить состояние",ok?"good":"warn");if(ok)refresh()};
 return <section className="body-map card"><div><p className="eyebrow">КАРТА ТЕЛА</p><h3>Где ощущается дискомфорт?</h3><p>Отметь область и интенсивность. При повторяющейся или острой боли нужна консультация врача.</p></div><div className={`body-silhouette${zone?" has-active-zone":""}`} aria-label={zone?`Выбрана область боли: ${zone}`:"Область боли не выбрана"}>{zoneMarkers[zone]?.map(marker=><span className={`pain-marker ${marker}`} key={marker} aria-hidden="true"/>)}{zone&&<b className="pain-zone-label">{zone}</b>}<i className="head"/><i className="torso"/><i className="arm left"/><i className="arm right"/><i className="leg left"/><i className="leg right"/></div><div className="body-controls"><div>{zones.map(x=><button type="button" key={x} className={zone===x?"active":""} aria-pressed={zone===x} onClick={()=>setZone(zone===x?"":x)}>{x}</button>)}</div><label>Интенсивность: <b>{pain}/10</b><input type="range" min="0" max="10" value={pain} onChange={e=>setPain(e.target.value)}/></label><button className="primary" type="button" onClick={save}>Сохранить состояние</button>{message&&<small>{message}</small>}</div></section>
}

export function GarminImport({refresh}:{refresh:()=>void}){
 const notify=useToast();
 const [preview,setPreview]=useState<any>(null),[status,setStatus]=useState(""),[busy,setBusy]=useState(false),[choice,setChoice]=useState<number|null>(null);
 const upload=async(file:File)=>{setStatus("");setPreview(null);setBusy(true);try{const form=new FormData();form.append("file",file);const r=await fetch("/api/workout-imports",{method:"POST",body:form});const body=await r.json();if(!r.ok)throw new Error(body.error||"Не удалось импортировать FIT");setPreview(body);setChoice(body.draftId??body.candidates?.[0]?.id??null);setStatus(body.duplicate?"Этот FIT уже был импортирован — дубль не создан.":body.autoLinked?"FIT автоматически связан с наиболее подходящим черновиком.":"FIT проверен. Выберите черновик для связи.");}catch(error){setStatus(error instanceof Error?error.message:"Не удалось импортировать FIT");notify("Не удалось импортировать FIT","warn")}finally{setBusy(false)}};
 const link=async()=>{if(!preview||!choice)return;setBusy(true);try{const r=await fetch("/api/workout-imports",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"link",importId:preview.id,draftId:choice})});const body=await r.json();if(!r.ok)throw new Error(body.error||"Не удалось связать импорт");setPreview({...preview,draftId:choice});setStatus("FIT связан с черновиком. Тренировка появится в журнале только после вашего подтверждения.");notify("FIT связан с черновиком","good");refresh()}catch(error){setStatus(error instanceof Error?error.message:"Не удалось связать импорт");notify("Не удалось связать импорт","warn")}finally{setBusy(false)}};
 const cancel=()=>{setPreview(null);setChoice(null);setStatus("")};
 const workout=preview?.workout,candidates=preview?.candidates??[],chosen=candidates.find((x:any)=>x.id===choice);
 return <section className="garmin-import card"><div><p className="eyebrow">GARMIN · FIT IMPORT</p><h3>Импорт тренировки Garmin</h3><p>FIT безопасно проверяется на сервере. Импорт связывается с ожидающим подтверждения черновиком и не создаёт запись в журнале.</p></div><label className="file-drop">{busy?"Проверяем файл…":"Выберите FIT до 10 МБ"}<input disabled={busy} type="file" accept=".fit,application/octet-stream" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>{workout&&<div className="garmin-preview"><div className="fit-metrics"><span><small>Длительность</small><b>{Math.round(workout.duration/60)} мин</b></span><span><small>Пульс</small><b>{workout.averageHeartRate??"—"} / {workout.maxHeartRate??"—"}</b></span><span><small>Калории</small><b>{workout.calories??"—"}</b></span><span><small>Старт</small><b>{new Date(workout.startedAt).toLocaleString("ru-RU")}</b></span></div><div className="fit-match"><small>Предполагаемая тренировка VOLT</small>{preview.draftId?<b>{candidates.find((x:any)=>x.id===preview.draftId)?.title??`Черновик #${preview.draftId}`}</b>:candidates.length?<><b>{chosen?.title??"Выберите тренировку"}</b><select value={choice??""} onChange={e=>setChoice(Number(e.target.value))} aria-label="Выбрать другую тренировку">{candidates.map((x:any)=><option key={x.id} value={x.id}>{x.title} · {x.confidence}</option>)}</select></>:<b>Подходящий черновик не найден</b>}</div><div className="fit-actions">{!preview.draftId&&choice&&<button disabled={busy} onClick={link}>Связать</button>}{!preview.draftId&&candidates.length>1&&<button className="secondary" onClick={()=>setChoice(candidates.find((x:any)=>x.id!==choice)?.id??choice)}>Выбрать другую</button>}<button className="secondary" onClick={cancel}>Отмена</button></div></div>}{status&&<small role="status">{status}</small>}</section>
}

export function PersonalRecords({data}:{data:any}){
 const strengthRecords=useMemo(()=>computeStrengthRecords((data.strengthLogs||[]).map((x:any)=>({exercise:x.exercise,weight:Number(x.weight)||0,reps:Number(x.reps)||0,date:x.date}))).slice(0,6),[data.strengthLogs]);
 const cardioRecords=useMemo(()=>computeCardioRecords((data.workouts||[]) as WorkoutRecord[]).slice(0,6),[data.workouts]);
 if(!strengthRecords.length&&!cardioRecords.length)return null;
 return <section className="records card"><p className="eyebrow">ЛИЧНЫЕ РЕКОРДЫ</p><h3>Лучшие результаты</h3>
  {strengthRecords.length>0&&<div>{strengthRecords.map(x=><article key={x.exercise}><span>{x.exercise}{x.isRecord&&<em className="record-badge">PR</em>}</span><b>{x.weight} кг</b><small>{x.reps?`× ${x.reps} · `:""}{x.date}</small></article>)}</div>}
  {cardioRecords.length>0&&<div>{cardioRecords.map(x=><article key={`${x.title}-${x.kind}`}><span>{x.title} · {x.kind==="distance"?"дистанция":"темп"}</span><b>{x.kind==="distance"?`${(x.value/1000).toFixed(2)} км`:`${x.value} ${x.unit}`}</b><small>{x.date}</small></article>)}</div>}
 </section>
}
