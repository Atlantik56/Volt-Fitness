"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import { CheckCircle2,Copy,HeartPulse,KeyRound,RefreshCw,ShieldAlert,Smartphone,Unplug } from "lucide-react";
import { useToast } from "./toast";

type Origin={packageName:string;name:string;isGarmin:boolean};
type Diagnostics={healthConnectAvailable?:boolean;grantedPermissions?:string[];historyAccessAvailable?:boolean;historyAccessGranted?:boolean;discoveredRecordTypes?:string[];origins?:Origin[]};
type Device={id:number;name:string;lastSyncAt:string|null;lastSeenAt:string|null;createdAt:string;diagnostics:Diagnostics};
type Status={devices:Device[];recordCount:number;lastSyncedAt:string|null};
const REQUIRED=["heart_rate","resting_heart_rate","heart_rate_variability","sleep","weight","exercise","steps","total_calories","active_calories"];
const LABELS:Record<string,string>={heart_rate:"Пульс",resting_heart_rate:"Пульс покоя",heart_rate_variability:"HRV",sleep:"Сон",weight:"Вес",exercise:"Тренировки",steps:"Шаги",total_calories:"Общие калории",active_calories:"Активные калории"};
const dateTime=(value:string|null)=>value?new Date(value).toLocaleString("ru-RU",{dateStyle:"short",timeStyle:"short"}):"ещё не выполнялась";

export function HealthConnectSettings(){
 const notify=useToast();
 const [status,setStatus]=useState<Status|null>(null),[pairing,setPairing]=useState<{token:string;expiresAt:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{
  try{const response=await fetch("/api/health-connect/pairing",{cache:"no-store"});if(!response.ok)throw new Error();setStatus(await response.json())}
  catch{setError("Не удалось получить статус Health Bridge")}
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/health-connect/pairing",{cache:"no-store",signal:controller.signal}).then(response=>{if(!response.ok)throw new Error();return response.json()}).then(setStatus).catch(cause=>{if(cause instanceof DOMException&&cause.name==="AbortError")return;setError("Не удалось получить статус Health Bridge")});
  return ()=>controller.abort();
 },[]);
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
 const origins=useMemo(()=>diagnostics.origins??[],[diagnostics.origins]);

 return <section className="profile-health-connect">
  <header><HeartPulse size={20}/><div><b>Health Connect</b><p>Приложение Android читает только разрешённые данные. Записи пока не влияют на Coach и программы.</p></div><em data-state={connection}>{connection}</em></header>
  {!device?<div className="profile-health-empty"><Smartphone size={18}/><div><b>VOLT Health Bridge не привязан</b><p>Установите VOLT Health Bridge на телефон, создайте одноразовый код и вставьте его в приложении.</p></div></div>:
   <div className="profile-health-device">
    <div><Smartphone size={18}/><span><small>УСТРОЙСТВО</small><b>{device.name}</b><em>Последняя синхронизация: {dateTime(device.lastSyncAt)}</em></span></div>
    <div><CheckCircle2 size={18}/><span><small>ИСТОЧНИК</small><b>{garmin?"Garmin Connect":origins.length?origins.map(item=>item.name||item.packageName).join(", "):"Источник ещё не обнаружен"}</b><em>{garmin?garmin.packageName:"Garmin не подтверждён DataOrigin"}</em></span></div>
    <div><RefreshCw size={18}/><span><small>ДАННЫЕ</small><b>{status?.recordCount??0} записей</b><em>{(diagnostics.discoveredRecordTypes??[]).map(key=>LABELS[key]||key).join(", ")||"Типы ещё не обнаружены"}</em></span></div>
   </div>}
  {device&&missing.length>0&&<div className="profile-health-warning"><ShieldAlert size={17}/><div><b>Требуются разрешения</b><p>{missing.map(key=>LABELS[key]||key).join(", ")}</p></div></div>}
  {device&&diagnostics.historyAccessAvailable&&<p className="profile-health-history">Полная история: <b>{diagnostics.historyAccessGranted?"разрешена":"не разрешена — первая синхронизация ограничена доступным окном Health Connect"}</b></p>}
  {pairing&&<div className="profile-health-pairing"><KeyRound size={18}/><div><small>ОДНОРАЗОВЫЙ КОД · ДЕЙСТВУЕТ ДО {dateTime(pairing.expiresAt)}</small><code>{pairing.token}</code></div><button type="button" onClick={copy}><Copy size={15}/>Копировать</button></div>}
  {error&&<p className="profile-hub-error" role="alert">{error}</p>}
  <footer>
   {!device&&<button type="button" onClick={createPairing} disabled={busy}><KeyRound size={15}/>{busy?"Создаю…":"Создать код привязки"}</button>}
   {device&&<button type="button" onClick={()=>{window.location.href="volt-health://sync"}}><RefreshCw size={15}/>Синхронизировать</button>}
   {device&&<button className="secondary" type="button" onClick={()=>{window.location.href="volt-health://permissions"}}><ShieldAlert size={15}/>Открыть Health Connect permissions</button>}
   {device&&<button className="secondary danger" type="button" onClick={revoke} disabled={busy}><Unplug size={15}/>Отключить</button>}
  </footer>
 </section>;
}
