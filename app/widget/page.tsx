"use client";

import {FormEvent,useEffect,useState} from "react";
import Link from "next/link";
import AuthGate from "../auth-gate";
import {buildHomeWeek} from "../personal-data";
import {buildWeekSchedule,weekRangeContaining} from "../week-schedule-model";
import {calculateReadiness} from "../../lib/readiness";
import {trainingLabelRu} from "../../lib/training-display";
import styles from "./widget.module.css";

const iso=(d:Date)=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const streak=(items:any[],field="date",zeroField?:string)=>{const map=new Map(items.map(x=>[x[field],zeroField?Number(x[zeroField])||0:true])),d=new Date();if(!map.has(iso(d)))d.setDate(d.getDate()-1);let n=0;while(map.has(iso(d))&&(!zeroField||map.get(iso(d))===0)){n++;d.setDate(d.getDate()-1)}return n};

export default function WidgetPage(){
 const [data,setData]=useState<any>(null),[saved,setSaved]=useState(false),[form,setForm]=useState({energy:3,pain:0,zone:""});
 const load=()=>fetch("/api/fitness",{cache:"no-store"}).then(r=>r.json()).then(j=>{setData(j);const w=j.wellnessLogs?.find((x:any)=>x.date===iso(new Date()));if(w)setForm(x=>({...x,energy:Number(w.energy)||3,pain:Number(w.pain)||0,zone:w.painArea||""}))});
 useEffect(()=>{load()},[]);
 const today=iso(new Date());
 const homeWeek=buildHomeWeek(data?.profile?.programStart,data?.profile?.trainingPlanCycles??data?.profile?.trainingPlanV3StartedAt,today);
 const resolvedWeek=buildWeekSchedule(homeWeek,data?.weekScheduleChanges??[],weekRangeContaining(today).mondayIso);
 const plan=resolvedWeek.find(x=>x.date===today)?.scheduled??homeWeek[0],activity=data?.activity?.find((x:any)=>x.date===today)||{},currentWellness=data?.wellnessLogs?.find((x:any)=>x.date===today)||{};
 const lastWorkout=data?.workouts?.[0],{score,decision}=calculateReadiness({sleepHours:Number(activity.sleepHours)||0,energy:form.energy,pain:form.pain,lastWorkoutPain:Number(lastWorkout?.painAfter)||0});
 const save=async(e:FormEvent)=>{e.preventDefault();setSaved(false);const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"wellness",date:today,energy:form.energy,pain:form.pain,painArea:form.zone,note:currentWellness.note||""})});if(r.ok){setSaved(true);load()}};
 const update=(key:keyof typeof form,value:string)=>setForm(x=>({...x,[key]:key==="zone"?value:Number(value)}));
 return <AuthGate><main className={`${styles.page} volt-widget-page`}>
  <header className={styles.header}><Link href="/" className={styles.brand}><span className="ritmovis-mark" aria-hidden="true" />VOLT</Link><time>{new Intl.DateTimeFormat("ru-RU",{weekday:"short",day:"numeric",month:"short"}).format(new Date())}</time></header>
  {!data?<section className={styles.loading}>Загрузка данных…</section>:<>
   <section className={styles.hero} style={{backgroundImage:plan.image?`linear-gradient(90deg,rgba(5,7,8,.94),rgba(5,7,8,.35)),url(${plan.image})`:`linear-gradient(90deg,rgba(5,7,8,.94),rgba(5,7,8,.35))`}}><p>ПЛАН НА СЕГОДНЯ</p><h1>{trainingLabelRu(plan.title)}</h1><div><span>{plan.time}</span><span>{plan.exercises.length} упражнений</span><span>{plan.rounds?`${plan.rounds} круга`:"отдых"}</span></div><Link href="/">{plan.type==="Отдых"?"Открыть день":"Начать тренировку"} →</Link></section>
   <section className={styles.glance} aria-label="Главные показатели"><article><span>⚡</span><b>{streak(data.workouts||[])}</b><small>серия</small></article><article><span>🌿</span><b>{streak(data.activity||[],"date","beers")}</b><small>без пива</small></article><article><span>↟</span><b>{Number(activity.steps||0).toLocaleString("ru-RU")}</b><small>шагов</small></article><article><span>◷</span><b>{activity.activeMinutes||0}</b><small>минут</small></article></section>
   <section className={styles.readiness}><div className={styles.score} style={{background:`conic-gradient(var(--lime) ${score}%,#292e30 0)`}}><span><b>{score}</b><small>готовность</small></span></div><div><p>ПРОВЕРКА VOLT</p><h2>{decision.title}</h2><small>{decision.text}</small></div></section>
   <form className={styles.survey} onSubmit={save}><div className={styles.surveyHead}><div><p>ОПРОС ПО ОЩУЩЕНИЯМ</p><h2>Как тело сегодня?</h2></div>{saved&&<b>Сохранено ✓</b>}</div>
    <Range label="Энергия" value={form.energy} min={1} max={5} left="нет сил" right="много сил" change={v=>update("energy",v)}/>
    <Range label="Боль в суставах" value={form.pain} min={0} max={10} left="нет" right="сильная" change={v=>update("pain",v)}/>
    <label className={styles.zone}>Где дискомфорт?<select value={form.zone} onChange={e=>update("zone",e.target.value)}><option value="">Нет</option>{["Шея","Плечи","Локти","Запястья","Спина","Тазобедренные","Колени","Голеностоп"].map(x=><option key={x}>{x}</option>)}</select></label>
    <button className={styles.save}>Сохранить самочувствие</button>
   </form>
   <p className={styles.install}>Для отдельного ярлыка открой эту страницу в Chrome → меню ⋮ → «Добавить на главный экран». В установленной PWA также доступен ярлык «VOLT Сегодня».</p>
  </>}
 </main></AuthGate>
}

function Range({label,value,min,max,left,right,change}:{label:string;value:number;min:number;max:number;left:string;right:string;change:(v:string)=>void}){return <label className={styles.range}><span>{label}<b>{value}/{max}</b></span><input type="range" min={min} max={max} value={value} onChange={e=>change(e.target.value)}/><small><i>{left}</i><i>{right}</i></small></label>}
