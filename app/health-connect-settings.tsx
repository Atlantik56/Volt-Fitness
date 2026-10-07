"use client";

import { useCallback,useEffect,useState } from "react";
import { CheckCircle2,Copy,HeartPulse,KeyRound,RefreshCw,ShieldAlert,Smartphone,Unplug } from "lucide-react";
import { useToast } from "./toast";

type Origin={packageName:string;name:string;isGarmin:boolean};
type Diagnostics={healthConnectAvailable?:boolean;grantedPermissions?:string[];historyAccessAvailable?:boolean;historyAccessGranted?:boolean;discoveredRecordTypes?:string[];origins?:Origin[]};
type Device={id:number;name:string;lastSyncAt:string|null;lastSeenAt:string|null;createdAt:string;diagnostics:Diagnostics};
type Status={devices:Device[];recordCount:number;lastSyncedAt:string|null};
const REQUIRED=["heart_rate","resting_heart_rate","heart_rate_variability","sleep","weight","steps","total_calories","active_calories"];
const LABELS:Record<string,string>={heart_rate:"Пульс",resting_heart_rate:"Пульс покоя",heart_rate_variability:"HRV",sleep:"Сон",weight:"Вес",steps:"Шаги",total_calories:"Общие калории",active_calories:"Активные калории"};
const dateTime=(value:string|null)=>value?new Date(value).toLocaleString("ru-RU",{dateStyle:"short",timeStyle:"short"}):"ещё не выполнялась";

export function HealthConnectSettings(){
 const notify=useToast();
 const [status,setStatus]=useState<Status|null>(null),[pairing,setPairing]=useState<{token:string;expiresAt:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [syncId,setSyncId]=useState<string|null>(null),[syncMessage,setSyncMessage]=useState("");
 const load=useCallback(async()=>{
  try{const response=await fetch("/api/health-connect/pairing",{cache:"no-store"});if(!response.ok)throw new Error();setStatus(await response.json())}
  catch{setError("Не удалось получить статус Health Bridge")}
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/health-connect/pairing",{cache:"no-store",signal:controller.signal}).then(response=>{if(!response.ok)throw new Error();return response.json()}).then(setStatus).catch(cause=>{if(cause instanceof DOMException&&cause.name==="AbortError")return;setError("Не удалось получить статус Health Bridge")});
  return ()=>controller.abort();
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>{const id=sessionStorage.getItem("volt-health-sync-request");if(id)setSyncId(id)},0);return()=>clearTimeout(timer)},[]);
 useEffect(()=>{
  if(!syncId)return;
  let cancelled=false,inFlight=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   if(inFlight||cancelled)return;inFlight=true;
   try{
    const response=await fetch(`/api/health-connect/requests?id=${encodeURIComponent(syncId)}`,{cache:"no-store"});
    if(!cancelled&&(response.status===404||response.status===401)){
     sessionStorage.removeItem("volt-health-sync-request");setSyncId(null);
     setError(response.status===401?"Войдите в VOLT, чтобы проверить синхронизацию.":"Запрос синхронизации истёк. Запустите его заново.");return;
    }
    if(!response.ok)throw new Error("Не удалось проверить результат синхронизации");
    const job=await response.json();if(cancelled)return;
    if(job.status==="completed"||job.status==="failed"){
     sessionStorage.removeItem("volt-health-sync-request");setSyncId(null);await load();
     if(job.status==="completed"){setError("");setSyncMessage(`Синхронизация завершена. Принято записей: ${job.accepted}`);window.dispatchEvent(new Event("volt:health-synced"))}
     else setError(job.error||"Синхронизация не завершилась. Повторите на телефоне.");
     return;
    }
    setSyncMessage(job.status==="running"?`Получаем данные с телефона. Принято: ${job.accepted}`:"Откройте Health Bridge на этом Android-телефоне. Для возврата результата нужна версия 0.1.2 или новее.");
   }catch(cause){if(!cancelled)setError(cause instanceof Error?cause.message:"Не удалось проверить синхронизацию")}finally{inFlight=false}
   if(!cancelled)timer=setTimeout(poll,2000);
  };
  void poll();const resume=()=>{if(document.visibilityState==="visible"){clearTimeout(timer);void poll()}};
  document.addEventListener("visibilitychange",resume);
  return()=>{cancelled=true;clearTimeout(timer);document.removeEventListener("visibilitychange",resume)};
 },[syncId,load]);
 const synchronize=async()=>{
  if(!device||syncId)return;
  if(!/Android/i.test(navigator.userAgent)){setError("Для чтения Health Connect откройте VOLT на Android-телефоне с установленным Health Bridge.");return}
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/health-connect/requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id})});
   const job=await response.json();if(!response.ok)throw new Error(job.error);
   sessionStorage.setItem("volt-health-sync-request",job.id);setSyncId(job.id);
   window.location.assign(`volt-health://sync?request=${encodeURIComponent(job.id)}`);
  }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось запустить синхронизацию")}
  finally{setBusy(false)}
 };
 const device=status?.devices[0]??null,diagnostics=device?.diagnostics??{};
 const missing=REQUIRED.filter(key=>!(diagnostics.grantedPermissions??[]).includes(key));
 const garmin=(diagnostics.origins??[]).find(item=>item.isGarmin);
 const connection=!device?"Не настроено":diagnostics.healthConnectAvailable===false?"Health Connect недоступен":missing.length?"Требуются разрешения":"Подключено";

 const createPairing=async()=>{
  setBusy(true);setError("");
  try{const response=await fetch("/api/health-connect/pairing",{method:"POST"});const json=await response.json();if(!response.ok)throw new Error(json.error);setPairing({token:json.pairingToken,expiresAt:json.expiresAt});notify("Код Health Bridge создан","good")}
  catch(cause){setError(cause instanceof Error&&cause.message?cause.message:"Не удалось создать код привязки")}
  finally{setBusy(false)}
 };
 const revoke=async()=>{
  if(!device)return;setBusy(true);setError("");
  try{const response=await fetch("/api/health-connect/pairing",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id})});if(!response.ok)throw new Error();setPairing(null);await load();notify("Android-устройство отключено","good")}
  catch{setError("Не удалось отключить устройство")}
  finally{setBusy(false)}
 };
 const copy=async()=>{if(pairing){await navigator.clipboard.writeText(pairing.token);notify("Код скопирован","good")}};
 const origins=diagnostics.origins??[];

 return <section className="profile-health-connect">
  <header><HeartPulse size={20}/><div><b>Health Connect</b><p>Вес, шаги, калории и восстановление используются в VOLT и Coach. Тренировки поступают из Intervals.</p></div><em data-state={connection}>{connection}</em></header>
  {!device?<div className="profile-health-empty"><Smartphone size={18}/><div><b>VOLT Health Bridge не привязан</b><p>Установите VOLT Health Bridge на телефон, создайте одноразовый код и вставьте его в приложении.</p></div></div>:
   <div className="profile-health-device">
    <div><Smartphone size={18}/><span><small>УСТРОЙСТВО</small><b>{device.name}</b><em>Последняя синхронизация: {dateTime(device.lastSyncAt)}</em></span></div>
    <div><CheckCircle2 size={18}/><span><small>ИСТОЧНИК</small><b>{garmin?"Garmin Connect":origins.length?origins.map(item=>item.name||item.packageName).join(", "):"Источник ещё не обнаружен"}</b><em>{garmin?garmin.packageName:"Garmin не подтверждён DataOrigin"}</em></span></div>
    <div><RefreshCw size={18}/><span><small>ДАННЫЕ</small><b>{status?.recordCount??0} записей</b><em>{(diagnostics.discoveredRecordTypes??[]).map(key=>LABELS[key]||key).join(", ")||"Типы ещё не обнаружены"}</em></span></div>
   </div>}
  {device&&missing.length>0&&<div className="profile-health-warning"><ShieldAlert size={17}/><div><b>Требуются разрешения</b><p>{missing.map(key=>LABELS[key]||key).join(", ")}</p></div></div>}
  {device&&diagnostics.historyAccessAvailable&&<p className="profile-health-history">Полная история: <b>{diagnostics.historyAccessGranted?"разрешена":"не разрешена — первая синхронизация ограничена доступным окном Health Connect"}</b></p>}
  {pairing&&<div className="profile-health-pairing"><KeyRound size={18}/><div><small>ОДНОРАЗОВЫЙ КОД · ДЕЙСТВУЕТ ДО {dateTime(pairing.expiresAt)}</small><code>{pairing.token}</code></div><button type="button" onClick={copy}><Copy size={15}/>Копировать</button></div>}
  {syncMessage&&<p className="profile-health-history" role="status">{syncMessage}</p>}
  {error&&<p className="profile-hub-error" role="alert">{error}</p>}
  <footer>
   {!device&&<button type="button" onClick={createPairing} disabled={busy}><KeyRound size={15}/>{busy?"Создаю…":"Создать код привязки"}</button>}
   {device&&<button type="button" onClick={synchronize} disabled={busy||!!syncId}><RefreshCw size={15}/>{syncId?"Синхронизация…":"Синхронизировать Health Connect"}</button>}
   {device&&<button className="secondary" type="button" onClick={()=>{window.location.href="volt-health://permissions"}}><ShieldAlert size={15}/>Разрешения Health Connect</button>}
   {device&&<button className="secondary danger" type="button" onClick={revoke} disabled={busy}><Unplug size={15}/>Отключить</button>}
  </footer>
 </section>;
}
