"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import AuthGate from "../auth-gate";
import {homeWeek} from "../personal-data";
import styles from "./widget.module.css";

const iso=(d:Date)=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const streak=(items:any[],field="date",zeroField?:string)=>{const map=new Map(items.map(x=>[x[field],zeroField?Number(x[zeroField])||0:true])),d=new Date();if(!map.has(iso(d)))d.setDate(d.getDate()-1);let n=0;while(map.has(iso(d))&&(!zeroField||map.get(iso(d))===0)){n++;d.setDate(d.getDate()-1)}return n};

export default function WidgetPage(){
 const [data,setData]=useState<any>(null),[saved,setSaved]=useState(false),[form,setForm]=useState({sleep:3,energy:3,fatigue:3,pain:0,motivation:3,zone:""});
 const load=()=>fetch("/api/fitness",{cache:"no-store"}).then(r=>r.json()).then(j=>{setData(j);const w=j.wellnessLogs?.find((x:any)=>x.date===iso(new Date()));if(w)setForm(x=>({...x,energy:Number(w.energy)||3,pain:Number(w.pain)||0,zone:w.painArea||""}))});
 useEffect(()=>{load()},[]);
 const today=iso(new Date()),plan=homeWeek.find(x=>x.day===(new Date().getDay()||7))||homeWeek[0],activity=data?.activity?.find((x:any)=>x.date===today)||{};
 const score=useMemo(()=>Math.round(form.sleep*4+form.energy*6+(10-form.fatigue)*2+(10-form.pain)*2+form.motivation*2),[form]),advice=form.pain>=5?"Сегодня восстановление и только безболезненная мобильность":score<55?"Снизь объём на один круг и увеличь отдых":"Можно выполнять план, сохраняя технику";
 const save=async(e:FormEvent)=>{e.preventDefault();setSaved(false);const note=`Опрос: сон ${form.sleep}/5 · усталость ${form.fatigue}/10 · мотивация ${form.motivation}/5`;const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"wellness",date:today,energy:form.energy,pain:form.pain,painArea:form.zone,note})});if(r.ok){setSaved(true);load()}};
 const update=(key:keyof typeof form,value:string)=>setForm(x=>({...x,[key]:key==="zone"?value:Number(value)}));
 return <AuthGate><main className={styles.page}>
  <header className={styles.header}><Link href="/" className={styles.brand}><span>V</span>VOLT</Link><time>{new Intl.DateTimeFormat("ru-RU",{weekday:"short",day:"numeric",month:"short"}).format(new Date())}</time></header>
  {!data?<section className={styles.loading}>Загрузка данных…</section>:<>
   <section className={styles.hero} style={{backgroundImage:`linear-gradient(90deg,rgba(5,7,8,.94),rgba(5,7,8,.35)),url(${plan.image||"/backgrounds/volt-trisport.webp"})`}}><p>ПЛАН НА СЕГОДНЯ</p><h1>{plan.title}</h1><div><span>{plan.time}</span><span>{plan.exercises.length} упражнений</span><span>{plan.rounds?`${plan.rounds} круга`:"отдых"}</span></div><Link href="/">{plan.type==="Отдых"?"Открыть день":"Начать тренировку"} →</Link></section>
   <section className={styles.glance} aria-label="Главные показатели"><article><span>⚡</span><b>{streak(data.workouts||[])}</b><small>серия</small></article><article><span>🌿</span><b>{streak(data.activity||[],"date","beers")}</b><small>без пива</small></article><article><span>↟</span><b>{Number(activity.steps||0).toLocaleString("ru-RU")}</b><small>шагов</small></article><article><span>◷</span><b>{activity.activeMinutes||0}</b><small>минут</small></article></section>
   <section className={styles.readiness}><div className={styles.score} style={{background:`conic-gradient(var(--lime) ${score}%,#292e30 0)`}}><span><b>{score}</b><small>готовность</small></span></div><div><p>VOLT CHECK-IN</p><h2>{advice}</h2><small>Ответь за 30 секунд — рекомендация изменится сразу.</small></div></section>
   <form className={styles.survey} onSubmit={save}><div className={styles.surveyHead}><div><p>ОПРОС ПО ОЩУЩЕНИЯМ</p><h2>Как тело сегодня?</h2></div>{saved&&<b>Сохранено ✓</b>}</div>
    <Range label="Качество сна" value={form.sleep} min={1} max={5} left="плохо" right="отлично" change={v=>update("sleep",v)}/>
    <Range label="Энергия" value={form.energy} min={1} max={5} left="нет сил" right="много сил" change={v=>update("energy",v)}/>
    <Range label="Усталость мышц" value={form.fatigue} min={0} max={10} left="свежие" right="сильно устали" change={v=>update("fatigue",v)}/>
    <Range label="Боль в суставах" value={form.pain} min={0} max={10} left="нет" right="сильная" change={v=>update("pain",v)}/>
    <Range label="Желание тренироваться" value={form.motivation} min={1} max={5} left="не хочу" right="готов" change={v=>update("motivation",v)}/>
    <label className={styles.zone}>Где дискомфорт?<select value={form.zone} onChange={e=>update("zone",e.target.value)}><option value="">Нет</option>{["Шея","Плечи","Локти","Запястья","Спина","Тазобедренные","Колени","Голеностоп"].map(x=><option key={x}>{x}</option>)}</select></label>
    <button className={styles.save}>Сохранить самочувствие</button>
   </form>
   <p className={styles.install}>Для отдельного ярлыка открой эту страницу в Chrome → меню ⋮ → «Добавить на главный экран». В установленной PWA также доступен ярлык «VOLT Сегодня».</p>
  </>}
 </main></AuthGate>
}

function Range({label,value,min,max,left,right,change}:{label:string;value:number;min:number;max:number;left:string;right:string;change:(v:string)=>void}){return <label className={styles.range}><span>{label}<b>{value}/{max}</b></span><input type="range" min={min} max={max} value={value} onChange={e=>change(e.target.value)}/><small><i>{left}</i><i>{right}</i></small></label>}
