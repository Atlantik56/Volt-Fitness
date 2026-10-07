"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "./toast";

type Match={planId:number;title:string;score:number;confidence:"high"|"medium"|"low"|"no_match";reasons:string[]};
type ImportReview={id:number;name:string;activityType:string;startedAt:string;reviewStatus:string;draftId:number|null;matches:Match[]};
type Status={configured:boolean;webhookConfigured:boolean;state:"connected"|"needs_reauth"|"disconnected"|"sync_error";connected:boolean;athleteName:string;athleteId:string;scopes:string[];connectedAt:string|null;lastSyncedAt:string|null;lastWebhookAt:string|null;lastSyncError:string;importCount:number;latestImport:ImportReview|null};
const callbackMessages:Record<string,string>={denied:"Подключение отменено в Strava.",state_error:"Срок запроса подключения истёк. Попробуйте ещё раз.",scope_error:"Strava не предоставила разрешение на чтение активностей.",code_error:"Strava вернула некорректный код подключения.",connect_error:"Не удалось завершить подключение Strava."};
const dateTime=(value:string|null)=>value?new Intl.DateTimeFormat("ru-RU",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value.replace(" ","T"))):"Ещё не запускалась";

export function StravaIntegration({refresh}:{refresh:()=>void}){
 const notify=useToast();
 const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[selectedDraft,setSelectedDraft]=useState("");
 const load=async()=>{
  try{const response=await fetch("/api/strava",{cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"Не удалось загрузить Strava");setStatus(body);setSelectedDraft(String(body.latestImport?.draftId||body.latestImport?.matches?.[0]?.planId||""))}
  catch(error){setMessage(error instanceof Error?error.message:"Не удалось загрузить Strava")}
 };
 const review=async(action:"link"|"separate"|"dismiss")=>{
  if(!status?.latestImport)return;setBusy(true);setMessage("");
  try{const response=await fetch("/api/strava",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({importId:status.latestImport.id,action,draftId:selectedDraft})}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Не удалось обновить сопоставление");setMessage(action==="link"?"Активность связана с черновиком. Откройте План для подтверждения.":action==="separate"?"Активность оставлена отдельной.":"Уведомление скрыто.");await load();refresh()}
  catch(error){setMessage(error instanceof Error?error.message:"Не удалось обновить сопоставление")}
  finally{setBusy(false)}
 };
 useEffect(()=>{const timer=window.setTimeout(()=>{void load();const value=new URLSearchParams(window.location.search).get("strava");if(value&&callbackMessages[value])setMessage(callbackMessages[value])},0);return()=>window.clearTimeout(timer)},[]);
 const sync=async()=>{
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/strava",{method:"POST"}),body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.error||"Не удалось синхронизировать Strava");
   const suffix=body.rateLimited?" Лимит запросов близок — остаток будет получен позже.":"";
   setMessage(`Синхронизация завершена: новых ${body.imported}, обновлено ${body.updated}, ошибок ${body.failed}.${suffix}`);notify("Данные Strava обновлены","good");await load();refresh();
  }catch(error){setMessage(error instanceof Error?error.message:"Не удалось синхронизировать Strava");notify("Синхронизация Strava не выполнена","warn")}
  finally{setBusy(false)}
 };
 const disconnect=async()=>{
  if(!confirm("Отключить Strava? Токены и импортированные Strava-данные будут удалены. Подтверждённые тренировки останутся, но полученные из Strava метрики будут очищены."))return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/strava",{method:"DELETE"}),body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.error||"Не удалось отключить Strava");
   setMessage(body.warning||"Strava отключена, локальные Strava-данные удалены.");notify("Strava отключена","good");await load();refresh();
  }catch(error){setMessage(error instanceof Error?error.message:"Не удалось отключить Strava");notify("Не удалось отключить Strava","warn")}
  finally{setBusy(false)}
 };
 if(!status&&!message)return <p className="profile-hub-loading">Проверяю подключение Strava…</p>;
 const badge=status?.state==="needs_reauth"?"Требуется вход":status?.state==="sync_error"?"Ошибка синхронизации":status?.connected?"Подключено":"Отключено";
 return <section className="strava-integration" aria-busy={busy}>
  <header><div><p className="eyebrow">STRAVA · READ ONLY</p><h3>{status?.connected?"Strava подключена":status?.state==="needs_reauth"?"Переподключите Strava":"Получение тренировок из Strava"}</h3></div>{status&&<span className={`strava-connected-badge state-${status.state}`}>{badge}</span>}</header>
  <p>VOLT получает только активности: внешний id, название и описание, тип, время, длительность, дистанцию, пульс, калории и данные устройства. GPS-маршруты, фото, сегменты и социальные данные не сохраняются.</p>
  <p>Данные хранятся как временный кэш не более 7 дней и не передаются в Analytics или AI Coach. Webhook и ручная синхронизация используют один ingestion flow. Отключение удаляет Strava-данные; заметки и ручные упражнения сохраняются.</p>
  {!status?.configured&&<p className="strava-warning" role="status">Добавьте серверные переменные Strava, затем перезапустите VOLT.</p>}
  {status?.configured&&!status.webhookConfigured&&<p className="strava-warning" role="status">Webhook ещё не активирован: добавьте verify/process token и subscription id.</p>}
  {status?.state==="needs_reauth"&&<p className="strava-warning" role="status">Токен или scope больше не действуют. Автоматические повторы остановлены до повторного подключения.</p>}
  {status?.connected&&<div className="strava-status-grid">
   <span><small>Аккаунт</small><b>{status.athleteName||`Athlete ${status.athleteId}`}</b></span>
   <span><small>Импортов</small><b>{status.importCount}</b></span>
   <span><small>Последняя синхронизация</small><b>{dateTime(status.lastSyncedAt)}</b></span>
   <span><small>Последний webhook</small><b>{dateTime(status.lastWebhookAt)}</b></span>
   <span><small>Доступ</small><b>{status.scopes.includes("activity:read_all")?"Все свои активности":"Публичные и для подписчиков"}</b></span>
  </div>}
  {status?.latestImport&&<div className="strava-import-review" role="status">
   <p className="eyebrow">НОВАЯ АКТИВНОСТЬ ИЗ STRAVA</p><b>{status.latestImport.name}</b><small>{dateTime(status.latestImport.startedAt)}</small>
   {status.latestImport.matches.length>0?<><label>Похоже на тренировку<select value={selectedDraft} onChange={event=>setSelectedDraft(event.target.value)}>{status.latestImport.matches.map(match=><option key={match.planId} value={match.planId}>{match.title} · {Math.round(match.score*100)}%</option>)}</select></label><p className="strava-match-reasons">{status.latestImport.matches[0].reasons.join(" · ")}</p><div className="strava-actions"><button type="button" onClick={()=>review("link")} disabled={busy||!selectedDraft}>Связать с тренировкой</button><Link className="strava-connect" href="/?section=План">Открыть подтверждение</Link></div></>:<p>Подходящая плановая тренировка не найдена.</p>}
   <div className="strava-actions"><button type="button" className="secondary" onClick={()=>review("separate")} disabled={busy}>Оставить отдельно</button><button type="button" className="secondary" onClick={()=>review("dismiss")} disabled={busy}>Скрыть</button></div>
  </div>}
  {status?.lastSyncError&&<p className="strava-warning" role="status">Последняя ошибка: {status.lastSyncError}</p>}
  {message&&<p className="strava-message" role="status">{message}</p>}
  <div className="strava-actions">
   {!status?.connected?<a className={`strava-connect${!status?.configured?" disabled":""}`} aria-disabled={!status?.configured} href={status?.configured?"/api/strava/connect":undefined}>Подключить Strava</a>:<>
    <button type="button" onClick={sync} disabled={busy}>{busy?"Синхронизирую…":"Синхронизировать сейчас"}</button>
    <button type="button" className="secondary danger" onClick={disconnect} disabled={busy}>Отключить и удалить данные</button>
   </>}
  </div>
 </section>;
}
