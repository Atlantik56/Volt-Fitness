"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Bot, CalendarDays, RefreshCw, Sparkles, Waves } from "lucide-react";
import type { SwimCoachResponse } from "@/lib/swim/coach";
import { SwimNavigation } from "../swim-navigation";
import { GlassPanel } from "./glass-panel";
import { SectionHeader } from "./section-header";

const reasonText:Record<NonNullable<SwimCoachResponse["fallbackReason"]>,string>={provider_unavailable:"AI-провайдер не настроен — показан локальный разбор.",provider_error:"AI временно недоступен — локальный разбор сохранил страницу рабочей.",invalid_output:"Ответ AI не прошёл проверку — показан проверенный локальный разбор."};

export function SwimCoachScreen(){
  const [data,setData]=useState<SwimCoachResponse|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(false); const [refreshing,setRefreshing]=useState(false);
  const load=useCallback(async(method:"GET"|"POST"="GET")=>{try{const response=await fetch("/api/swim/coach",{method,cache:"no-store"});if(!response.ok)throw new Error();setData(await response.json());setError(false)}catch{setError(true)}finally{setLoading(false);setRefreshing(false)}},[]);
  useEffect(()=>{let active=true;fetch("/api/swim/coach",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject(new Error())).then((json:SwimCoachResponse)=>{if(active){setData(json);setError(false)}}).catch(()=>{if(active)setError(true)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  return <div className="swim-plan swim-coach">
    <header className="swim-plan-header"><div><p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>AI Coach</b></p><h1>AI Coach</h1><p>Короткий брифинг по подтверждённым данным — факты отдельно, предложения отдельно.</p></div><div className="swim-header-tools"><button type="button" aria-label="Календарь"><CalendarDays size={19}/></button><span><RefreshCw size={14}/> Синхронизировано <i/></span><button type="button" aria-label="Уведомления"><Bell size={18}/><i/></button></div></header>
    <SwimNavigation/>
    {error&&<div className="swim-home-error" role="alert">Не удалось загрузить брифинг. <button onClick={()=>{setLoading(true);void load()}}>Повторить</button></div>}
    {loading||!data?<div className="swim-history-loading swim-coach-loading" aria-busy="true"><div className="swim-loading-line"/><div className="swim-loading-line"/><div className="swim-loading-line"/></div>:!data.context.hasHistory?<GlassPanel className="swim-history-empty"><Waves size={30}/><b>Coach ждёт первый результат</b><p>{data.briefing.currentSummary}</p><Link href="/swim/workouts" className="swim-btn primary">Открыть план тренировок</Link></GlassPanel>:<>
      <section className="swim-home-card swim-coach-hero"><span className="swim-history-hero-track" aria-hidden="true"/><div><p className="swim-eyebrow">Текущий ритм · 30 дней</p><h2>Брифинг перед следующим заплывом</h2><p>{data.briefing.currentSummary}</p><div className="swim-coach-facts">{data.context.facts.slice(0,4).map(f=><span key={f.id}><small>{f.label}</small><b>{f.value}</b></span>)}</div></div><GlassPanel className="swim-coach-focus"><span><Sparkles size={17}/> Главный фокус</span><strong>{data.briefing.guidance.primaryFocus}</strong><p>{data.briefing.guidance.recommendation}</p>{data.briefing.guidance.adjustment&&<small>{data.briefing.guidance.adjustment}</small>}</GlassPanel></section>
      <div className="swim-coach-status"><span className={`swim-badge ${data.source}`}>{data.source==="ai"?"AI briefing":"Локальный briefing"}</span>{data.fallbackReason&&<p>{reasonText[data.fallbackReason]}</p>}<button type="button" disabled={refreshing} onClick={()=>{setRefreshing(true);void load("POST")}}><Bot size={15}/>{refreshing?"Обновляю…":"Обновить с AI"}</button></div>
      <section className="swim-section"><SectionHeader eyebrow="Наблюдения" title="Что подтверждают данные"/><div className="swim-coach-observations">{data.briefing.observations.length?data.briefing.observations.map((item,index)=><GlassPanel key={`${item.title}-${index}`}><span>0{index+1}</span><h3>{item.title}</h3><p>{item.text}</p><small>{item.evidenceIds.map(id=>data.context.facts.find(f=>f.id===id)?.label).filter(Boolean).join(" · ")}</small></GlassPanel>):<GlassPanel className="swim-analytics-chapter-empty">Для полезных наблюдений пока недостаточно записанных метрик.</GlassPanel>}</div></section>
      <section className="swim-coach-honesty"><div><span>Недоступно</span><p>{data.context.unavailable.join(" · ")}. Coach не заменяет отсутствующие значения предположениями.</p></div><small>Рекомендации не являются диагнозом и не меняют тренировочный план автоматически.</small></section>
    </>}
  </div>;
}
