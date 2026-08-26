"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell, Bot, CalendarDays, ChevronRight, Dumbbell, LogOut,
  Pencil, Route, Ruler, ShieldCheck, Target, Upload, UserRound, Weight, Zap,
} from "lucide-react";
import { currentProgramWeek } from "./personal-data";
import { GarminImport } from "./advanced-features";
import { useToast } from "./toast";

type ProfileSettingsPageProps={
  data:any;
  refresh:()=>void;
  onOpenRoadmap:()=>void;
  onLogout:()=>Promise<void>;
};

type HubSettings={
  anthropicKeySet:boolean;
  anthropicEnabled:boolean;
  mwsKeySet:boolean;
  mwsProject:string;
  mwsModel:string;
};

type ProfileDraft={name:string;height:string;startWeight:string;targetWeight:string};
type SettingsPanel="profile"|"notifications"|"ai"|"garmin"|null;

const localIso=(date:Date)=>{
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
};

function activityStreak(workouts:any[]){
  const dates=new Set(workouts.map(item=>item.date));
  const cursor=new Date();
  if(!dates.has(localIso(cursor)))cursor.setDate(cursor.getDate()-1);
  let total=0,misses=0;
  while(true){
    if(dates.has(localIso(cursor))){total++;misses=0}else if(++misses>1)break;
    cursor.setDate(cursor.getDate()-1);
  }
  return total;
}

function ProfileEditor({profile,refresh,onSaved}:{profile:any;refresh:()=>void;onSaved:()=>void}){
  const notify=useToast();
  const [draft,setDraft]=useState<ProfileDraft>(()=>({
    name:String(profile?.name||""),
    height:String(profile?.height??""),
    startWeight:String(profile?.startWeight??""),
    targetWeight:String(profile?.targetWeight??""),
  }));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const change=(key:keyof ProfileDraft,value:string)=>setDraft(current=>({...current,[key]:value}));
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const response=await fetch("/api/fitness",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"profile",...draft}),
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok){setError(json.error||"Не удалось сохранить профиль");return}
      notify("Профиль и цель обновлены","good");refresh();onSaved();
    }catch{setError("Не удалось сохранить профиль. Проверьте соединение.")}
    finally{setBusy(false)}
  };

  return <form className="profile-hub-form" onSubmit={save}>
    <div className="profile-hub-form-section">
      <div><p className="eyebrow">ЛИЧНОСТЬ</p><h3>Персональные данные</h3></div>
      <div className="profile-hub-form-grid">
        <label>Имя<input name="name" value={draft.name} onChange={event=>change("name",event.target.value)} required/></label>
        <label>Рост, см<input name="height" type="number" min="100" max="250" value={draft.height} onChange={event=>change("height",event.target.value)} required/></label>
      </div>
    </div>
    <div className="profile-hub-form-section">
      <div><p className="eyebrow">ЦЕЛЬ</p><h3>Весовая траектория</h3></div>
      <div className="profile-hub-form-grid">
        <label>Стартовый вес, кг<input name="startWeight" type="number" min="30" max="350" step="0.1" value={draft.startWeight} onChange={event=>change("startWeight",event.target.value)} required/></label>
        <label>Целевой вес, кг<input name="targetWeight" type="number" min="30" max="350" step="0.1" value={draft.targetWeight} onChange={event=>change("targetWeight",event.target.value)} required/></label>
      </div>
    </div>
    {error&&<p className="profile-hub-error" role="alert">{error}</p>}
    <div className="profile-hub-form-actions"><button type="submit" disabled={busy}>{busy?"Сохраняю…":"Сохранить изменения"}</button></div>
  </form>;
}

function urlBase64ToUint8Array(base64:string){
  const padding="=".repeat((4-base64.length%4)%4);
  const normalized=(base64+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(normalized),output=new Uint8Array(raw.length);
  for(let index=0;index<raw.length;index++)output[index]=raw.charCodeAt(index);
  return output;
}

function ProfilePushSettings(){
  const notify=useToast();
  const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false);
  const supported=typeof window!=="undefined"&&"serviceWorker" in navigator&&"PushManager" in window;

  useEffect(()=>{
    if(!supported)return;
    navigator.serviceWorker.ready.then(registration=>registration.pushManager.getSubscription()).then(subscription=>setEnabled(Boolean(subscription))).catch(()=>{});
  },[supported]);

  if(!supported)return <div className="profile-hub-honest-state"><ShieldCheck size={18}/><div><b>Push-уведомления недоступны</b><p>Этот браузер или режим не поддерживает системные push-напоминания.</p></div></div>;

  const toggle=async()=>{
    setBusy(true);
    try{
      const registration=await navigator.serviceWorker.ready;
      if(enabled){
        const subscription=await registration.pushManager.getSubscription();
        if(subscription){
          await fetch("/api/push",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:subscription.endpoint})});
          await subscription.unsubscribe();
        }
        setEnabled(false);notify("Напоминания выключены");
      }else{
        const permission=await Notification.requestPermission();
        if(permission!=="granted"){notify("Браузер не разрешил уведомления","warn");return}
        const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||"";
        const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(key)});
        const response=await fetch("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(subscription.toJSON())});
        if(!response.ok)throw new Error("push save failed");
        setEnabled(true);notify("Напоминания включены","good");
      }
    }catch{notify("Не удалось изменить напоминания","warn")}
    finally{setBusy(false)}
  };

  return <div className="profile-hub-toggle-row">
    <div><b>Системные напоминания</b><p>Уведомления приходят через существующий push-канал VOLT.</p></div>
    <button type="button" role="switch" aria-checked={enabled} className={enabled?"enabled":""} onClick={toggle} disabled={busy}><span/>{busy?"…":enabled?"Включены":"Выключены"}</button>
  </div>;
}

function ProfileAiSettings(){
  const notify=useToast();
  const [settings,setSettings]=useState<HubSettings|null>(null);
  const [anthropicKey,setAnthropicKey]=useState("");
  const [mwsKey,setMwsKey]=useState(""),[project,setProject]=useState(""),[model,setModel]=useState("");
  const [anthropicBusy,setAnthropicBusy]=useState(false),[mwsBusy,setMwsBusy]=useState(false),[error,setError]=useState("");

  const load=()=>fetch("/api/settings",{cache:"no-store"}).then(response=>{
    if(!response.ok)throw new Error("settings failed");return response.json();
  }).then((next:HubSettings)=>{setSettings(next);setProject(next.mwsProject||"project-avatar-aang5615");setModel(next.mwsModel||"qwen3-6-35b-a3b")}).catch(()=>setError("Не удалось загрузить AI-настройки"));
  useEffect(()=>{load()},[]);

  const saveAnthropic=async(event:React.FormEvent)=>{
    event.preventDefault();setAnthropicBusy(true);setError("");
    const response=await fetch("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({anthropicKey})});
    const json=await response.json().catch(()=>({}));setAnthropicBusy(false);
    if(!response.ok){setError(json.error||"Не удалось сохранить Anthropic");return}
    setAnthropicKey("");notify("Ключ Anthropic сохранён","good");load();
  };
  const saveMws=async(event:React.FormEvent)=>{
    event.preventDefault();setMwsBusy(true);setError("");
    const response=await fetch("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"mws",mwsKey,mwsProject:project,mwsModel:model})});
    const json=await response.json().catch(()=>({}));setMwsBusy(false);
    if(!response.ok){setError(json.error||"Не удалось сохранить MWS");return}
    setMwsKey("");notify("Настройки MWS сохранены","good");load();
  };

  if(!settings&&!error)return <p className="profile-hub-loading">Загружаю AI-настройки…</p>;
  return <div className="profile-ai-settings">
    <header><Bot size={20}/><div><b>AI Coach использует эти подключения</b><p>Ключи сохраняются на сервере и не возвращаются в браузер.</p></div></header>
    <form onSubmit={saveAnthropic}>
      <div className="profile-ai-provider"><span className={settings?.anthropicKeySet&&settings?.anthropicEnabled?"connected":""}/><div><b>Anthropic</b><small>{settings?.anthropicEnabled===false?"Отключён серверной конфигурацией":settings?.anthropicKeySet?"Ключ настроен":"Ключ не настроен"}</small></div></div>
      <label>API-ключ<input type="password" autoComplete="off" minLength={20} maxLength={200} required value={anthropicKey} onChange={event=>setAnthropicKey(event.target.value.trim())} placeholder={settings?.anthropicKeySet?"Введите новый ключ, чтобы заменить текущий":"sk-ant-api03-…"}/></label>
      <button disabled={anthropicBusy}>{anthropicBusy?"Сохраняю…":settings?.anthropicKeySet?"Обновить ключ":"Подключить"}</button>
    </form>
    <form onSubmit={saveMws}>
      <div className="profile-ai-provider"><span className={settings?.mwsKeySet?"connected":""}/><div><b>MWS GPT</b><small>{settings?.mwsKeySet?"Резервный провайдер настроен":"Резервный провайдер не настроен"}</small></div></div>
      <div className="profile-ai-grid"><label>Проект<input required value={project} onChange={event=>setProject(event.target.value.trim())}/></label><label>Модель<input required value={model} onChange={event=>setModel(event.target.value.trim())}/></label></div>
      <label>API-ключ<input type="password" autoComplete="off" value={mwsKey} onChange={event=>setMwsKey(event.target.value.trim())} placeholder={settings?.mwsKeySet?"Оставьте пустым, чтобы не менять ключ":"Вставьте ключ MWS"}/></label>
      <button disabled={mwsBusy}>{mwsBusy?"Сохраняю…":settings?.mwsKeySet?"Сохранить параметры":"Подключить MWS"}</button>
    </form>
    {error&&<p className="profile-hub-error" role="alert">{error}</p>}
  </div>;
}

function SettingsRow({icon,title,description,active,onClick,status}:{icon:React.ReactNode;title:string;description:string;active?:boolean;onClick:()=>void;status?:string}){
  return <button type="button" className={`profile-settings-row${active?" active":""}`} aria-expanded={active} onClick={onClick}>
    <span className="profile-settings-row-icon" aria-hidden="true">{icon}</span>
    <span><b>{title}</b><small>{description}</small></span>
    {status&&<em>{status}</em>}<ChevronRight size={18}/>
  </button>;
}

export function ProfileSettingsPage({data,refresh,onOpenRoadmap,onLogout}:ProfileSettingsPageProps){
  const [openPanel,setOpenPanel]=useState<SettingsPanel>(null);
  const profile=data.profile||{};
  const name=profile.name||"Илья";
  const initials=name.trim().split(/\s+/).slice(0,2).map((part:string)=>part[0]).join("").toUpperCase()||"И";
  const workouts=useMemo(()=>data.workouts||[],[data.workouts]);
  const streak=useMemo(()=>activityStreak(workouts),[workouts]);
  const latestWeight=useMemo(()=>[...(data.measurements||[])].filter((item:any)=>Number(item.weight)>0).sort((a:any,b:any)=>String(b.date).localeCompare(String(a.date)))[0],[data.measurements]);
  const currentWeight=Number(latestWeight?.weight??profile.startWeight??0),startWeight=Number(profile.startWeight??0),targetWeight=Number(profile.targetWeight??0);
  const totalDelta=Math.max(0,startWeight-targetWeight),completed=Math.max(0,startWeight-currentWeight);
  const goalProgress=totalDelta>0?Math.min(100,Math.max(0,Math.round(completed/totalDelta*100))):0;
  const remaining=Math.max(0,currentWeight-targetWeight);
  const programWeek=currentProgramWeek(profile.programStart);
  const startLabel=profile.programStart?new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${profile.programStart}T12:00:00`)):"Не указан";
  const toggle=(panel:Exclude<SettingsPanel,null>)=>setOpenPanel(current=>current===panel?null:panel);

  return <div className="profile-settings-page">
    <header className="profile-page-heading"><div><p className="eyebrow">ПЕРСОНАЛЬНЫЙ ЦЕНТР</p><h1>Профиль и настройки</h1><p>Твои параметры, цели и работающие подключения VOLT — в одном месте.</p></div></header>

    <section className="profile-identity-panel">
      <div className="profile-avatar" aria-label={`Аватар ${name}`}><span>{initials}</span><i><UserRound size={16}/></i></div>
      <div className="profile-identity-copy"><h2>{name}</h2><p>{profile.height?`Рост ${profile.height} см`:"Рост не указан"} · Неделя {programWeek}</p><button type="button" onClick={()=>{setOpenPanel("profile");document.getElementById("profile-settings-sections")?.scrollIntoView({behavior:"smooth",block:"start"})}}><Pencil size={14}/>Редактировать профиль</button><blockquote>Дисциплина сегодня — результат завтра.</blockquote></div>
      <div className="profile-program-mark"><Zap size={18}/><span><small>ТЕКУЩАЯ ПРОГРАММА</small><b>Неделя {programWeek}</b><em>Старт: {startLabel}</em></span></div>
      <div className="profile-key-stats" aria-label="Ключевые параметры профиля">
        <article><Zap size={17}/><span><small>Серия</small><b>{streak}<em> дней</em></b></span></article>
        <article><Dumbbell size={17}/><span><small>Тренировок</small><b>{workouts.length}<em> всего</em></b></span></article>
        <article><Ruler size={17}/><span><small>Рост</small><b>{profile.height||"—"}<em> см</em></b></span></article>
        <article><Weight size={17}/><span><small>Вес</small><b>{currentWeight?currentWeight.toFixed(1):"—"}<em> кг</em></b></span></article>
      </div>
    </section>

    <div className="profile-goal-grid">
      <section className="profile-current-goal">
        <header><span><Target size={18}/></span><div><p className="eyebrow">ТЕКУЩАЯ ЦЕЛЬ</p><h2>{targetWeight?`Снизить вес до ${targetWeight.toFixed(1)} кг`:"Цель пока не указана"}</h2></div><b>{goalProgress}%</b></header>
        <div className="profile-goal-progress"><i style={{width:`${goalProgress}%`}}/></div>
        <footer><span><small>Сейчас</small><b>{currentWeight?`${currentWeight.toFixed(1)} кг`:"—"}</b></span><span><small>Осталось</small><b>{targetWeight?`${remaining.toFixed(1)} кг`:"—"}</b></span><span><small>Цель</small><b>{targetWeight?`${targetWeight.toFixed(1)} кг`:"—"}</b></span></footer>
      </section>
      <section className="profile-program-card"><Route size={24}/><div><p className="eyebrow">ПРОГРАММА</p><h2>Твой план на 36 недель</h2><p>Текущая позиция и фазы программы остаются в Дорожной карте.</p></div><button type="button" onClick={onOpenRoadmap}>Открыть карту <ChevronRight size={16}/></button></section>
    </div>

    <section className="profile-settings-shell" id="profile-settings-sections">
      <header><div><p className="eyebrow">НАСТРОЙКИ</p><h2>Персональные параметры</h2></div><p>Здесь показаны только функции, которые действительно работают в VOLT.</p></header>
      <div className="profile-settings-columns">
        <div className="profile-settings-group">
          <SettingsRow icon={<UserRound size={20}/>} title="Профиль и цель" description="Имя, рост, стартовый и целевой вес" active={openPanel==="profile"} onClick={()=>toggle("profile")}/>
          {openPanel==="profile"&&<ProfileEditor profile={profile} refresh={refresh} onSaved={()=>setOpenPanel(null)}/>}
          <SettingsRow icon={<CalendarDays size={20}/>} title="Программа" description={`Неделя ${programWeek} · старт ${startLabel}`} onClick={onOpenRoadmap}/>
          <SettingsRow icon={<Bell size={20}/>} title="Уведомления" description="Системные push-напоминания" active={openPanel==="notifications"} onClick={()=>toggle("notifications")}/>
          {openPanel==="notifications"&&<div className="profile-settings-detail"><ProfilePushSettings/></div>}
          <SettingsRow icon={<Bot size={20}/>} title="AI-настройки" description="Anthropic и резервный MWS GPT" active={openPanel==="ai"} onClick={()=>toggle("ai")}/>
          {openPanel==="ai"&&<div className="profile-settings-detail"><ProfileAiSettings/></div>}
        </div>
        <div className="profile-settings-group profile-settings-integrations">
          <div className="profile-settings-group-title"><Upload size={18}/><span><b>Интеграции и данные</b><small>Только доступные подключения</small></span></div>
          <SettingsRow icon={<Upload size={20}/>} title="Garmin FIT import" description="Импортировать файл тренировки и связать с черновиком" active={openPanel==="garmin"} onClick={()=>toggle("garmin")} status="FIT"/>
          {openPanel==="garmin"&&<div className="profile-settings-detail profile-garmin-detail"><GarminImport refresh={refresh}/></div>}
        </div>
      </div>
    </section>

    <section className="profile-system-actions">
      <div><p className="eyebrow">СИСТЕМНЫЕ ДЕЙСТВИЯ</p><h2>Текущий сеанс</h2><p>Выход не удаляет профиль, тренировки или персональные данные.</p></div>
      <button type="button" onClick={onLogout}><LogOut size={17}/>Выйти из аккаунта</button>
    </section>
  </div>;
}
