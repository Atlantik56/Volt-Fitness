// Синхронизация тренировок из intervals.icu (docs/GARMIN_BRIDGE.md).
//
// Цепочка: WattAttack и часы → Garmin Connect → intervals.icu → VOLT.
// Здесь только доставка: разбор FIT, дедупликация и сопоставление с
// черновиками уже реализованы в lib/fit-import-service.ts и не дублируются.
// Данные приходят как garmin_fit, то есть полноправны в аналитике и контексте
// коуча — в отличие от Strava, исключённой политикой (docs/STRAVA_INTEGRATION.md).
import { db } from "@/lib/db";
import { importFit } from "@/lib/fit-import-service";
import { downloadIntervalsActivityFit, IntervalsApiError, isStravaSourced, listIntervalsActivities } from "@/lib/intervals-client";

const INITIAL_LOOKBACK_DAYS=90;
// Перекрытие на сутки: intervals.icu показывает локальные даты, а активность
// может приехать из Garmin с задержкой уже после отметки о синхронизации.
const OVERLAP_DAYS=1;
const MAX_ACTIVITIES_PER_SYNC=60;

export type IntervalsStatus={
 configured:boolean;status:"idle"|"ok"|"sync_error"|"unauthorized";
 athleteId:string;lastSyncedAt:string|null;lastActivityDate:string|null;lastSyncError:string;
};
export type IntervalsSyncResult={considered:number;imported:number;duplicates:number;skippedStrava:number;failed:number;errors:string[]};

type ConnectionRow={athleteId:string;lastSyncedAt:string|null;lastActivityDate:string|null;lastSyncError:string;status:IntervalsStatus["status"]};
const connectionSelect="SELECT athlete_id athleteId,last_synced_at lastSyncedAt,last_activity_date lastActivityDate,last_sync_error lastSyncError,status FROM intervals_connection WHERE id=1";

export function getIntervalsConfig(){
 const apiKey=String(process.env.INTERVALS_API_KEY||"").trim();
 const athleteId=String(process.env.INTERVALS_ATHLETE_ID||"").trim();
 if(apiKey.length<16)throw new Error("INTERVALS_API_KEY не настроен");
 // Идентификатор атлета у intervals.icu имеет вид "i123456".
 if(!/^i?\d{1,20}$/.test(athleteId))throw new Error("INTERVALS_ATHLETE_ID не настроен");
 return {apiKey,athleteId};
}

export function isIntervalsConfigured(){try{getIntervalsConfig();return true}catch{return false}}

const readConnection=()=>db.prepare(connectionSelect).get() as ConnectionRow|undefined;

export function getIntervalsStatus():IntervalsStatus{
 const row=readConnection();
 let configured=true,athleteId="";
 try{athleteId=getIntervalsConfig().athleteId}catch{configured=false}
 return {
  configured,
  status:row?.status??"idle",
  athleteId:athleteId||row?.athleteId||"",
  lastSyncedAt:row?.lastSyncedAt??null,
  lastActivityDate:row?.lastActivityDate??null,
  lastSyncError:row?.lastSyncError??"",
 };
}

const isoDay=(date:Date)=>date.toISOString().slice(0,10);
const shiftDays=(date:Date,days:number)=>new Date(date.getTime()+days*86_400_000);

/**
 * Начало окна синхронизации. При первом запуске — 90 дней назад, дальше от
 * последней успешно увиденной активности с перекрытием в сутки.
 */
export function syncWindowStart(row:{lastActivityDate:string|null}|undefined,now:Date):string{
 const last=row?.lastActivityDate;
 if(last&&/^\d{4}-\d{2}-\d{2}$/.test(last))return isoDay(shiftDays(new Date(`${last}T00:00:00Z`),-OVERLAP_DAYS));
 return isoDay(shiftDays(now,-INITIAL_LOOKBACK_DAYS));
}

const markStatus=(status:IntervalsStatus["status"],error:string)=>{
 db.prepare("UPDATE intervals_connection SET status=?,last_sync_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=1").run(status,error.slice(0,400));
};

export async function syncIntervalsActivities(fetcher:typeof fetch=fetch,now=new Date()):Promise<IntervalsSyncResult>{
 const {apiKey,athleteId}=getIntervalsConfig();
 const row=readConnection();
 const result:IntervalsSyncResult={considered:0,imported:0,duplicates:0,skippedStrava:0,failed:0,errors:[]};

 let activities;
 try{
  activities=await listIntervalsActivities(apiKey,athleteId,{
   oldest:syncWindowStart(row,now),newest:isoDay(shiftDays(now,1)),limit:MAX_ACTIVITIES_PER_SYNC,
  },fetcher);
 }catch(error){
  const unauthorized=error instanceof IntervalsApiError&&(error.status===401||error.status===403);
  const message=error instanceof Error?error.message:"Неизвестная ошибка intervals.icu";
  markStatus(unauthorized?"unauthorized":"sync_error",message);
  throw error;
 }

 // Импортируем от старых к новым: last_activity_date продвигается только по
 // фактически обработанным активностям, поэтому обрыв в середине не создаёт
 // дыру — следующий запуск начнёт с последней успешной даты.
 const ordered=[...activities].reverse();
 let latestDate=row?.lastActivityDate??null;

 for(const activity of ordered){
  result.considered++;
  // Пришедшее из Strava intervals.icu через API не отдаёт. Это не сбой, а
  // ограничение политики: молча пропускаем, иначе счётчик ошибок растёт
  // вечно и статус интеграции навсегда остаётся красным.
  if(isStravaSourced(activity)){result.skippedStrava++;continue}
  try{
   const {bytes}=await downloadIntervalsActivityFit(apiKey,activity.id,fetcher);
   const imported=importFit(bytes);
   if(!imported.ok){result.failed++;result.errors.push(`${activity.id}: ${imported.error}`);continue}
   if(imported.result.duplicate)result.duplicates++;else result.imported++;
   const day=activity.startDateLocal?.slice(0,10)??null;
   if(day&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&(!latestDate||day>latestDate))latestDate=day;
  }catch(error){
   result.failed++;
   result.errors.push(`${activity.id}: ${error instanceof Error?error.message:"ошибка загрузки"}`);
   // 401/403 означают отозванный ключ — продолжать перебор бессмысленно.
   if(error instanceof IntervalsApiError&&(error.status===401||error.status===403)){
    markStatus("unauthorized",error.message);
    throw error;
   }
  }
 }

 db.prepare("UPDATE intervals_connection SET athlete_id=?,last_synced_at=?,last_activity_date=?,status=?,last_sync_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=1")
  .run(athleteId,now.toISOString(),latestDate,result.failed&&!result.imported&&!result.duplicates?"sync_error":"ok",result.errors.slice(0,3).join("; ").slice(0,400));
 return result;
}
