import { createHash } from "node:crypto";
import { USERNAME } from "@/lib/user";
import { db } from "@/lib/db";
import { storeImportedWorkout, type ActivityFamily, type ImportedWorkout } from "@/lib/fit-import-service";
import { decryptStravaToken, encryptStravaToken, parseStravaEncryptionKey } from "@/lib/strava-crypto";
import { rankActivityMatches, type ActivityMatch } from "@/lib/activity-matcher";
import {
 getStravaActivity, listStravaActivities, refreshStravaAccessToken, revokeStravaToken,
 StravaApiError, type StravaRateLimit, type StravaTokenResponse,
} from "@/lib/strava-client";

const INITIAL_LOOKBACK_DAYS=90;
const INCREMENTAL_OVERLAP_SECONDS=2*86400;
const MAX_SYNC_PAGES=2;
const PAGE_SIZE=30;
const RATE_LIMIT_HEADROOM=8;

export type StravaConnectionStatus="connected"|"needs_reauth"|"sync_error";
type ConnectionRow={username:string;athleteId:string;athleteName:string;scopes:string;connectedAt:string;updatedAt:string;lastSyncedAt:string|null;lastSyncError:string;status:StravaConnectionStatus;needsReauthAt:string|null;lastWebhookAt:string|null};
type TokenRow={accessTokenEncrypted:string;refreshTokenEncrypted:string;expiresAt:number};
const connectionSelect=`SELECT username,athlete_id athleteId,athlete_name athleteName,scopes,connected_at connectedAt,updated_at updatedAt,last_synced_at lastSyncedAt,last_sync_error lastSyncError,status,needs_reauth_at needsReauthAt,last_webhook_at lastWebhookAt FROM strava_connections`;
const tokenSelect=`SELECT access_token_encrypted accessTokenEncrypted,refresh_token_encrypted refreshTokenEncrypted,expires_at expiresAt FROM strava_oauth_tokens`;

export type StravaImportReview={id:number;name:string;activityType:string;startedAt:string;reviewStatus:string;draftId:number|null;matches:ActivityMatch[]};
export type StravaStatus={configured:boolean;webhookConfigured:boolean;state:"connected"|"needs_reauth"|"disconnected"|"sync_error";connected:boolean;athleteName:string;athleteId:string;scopes:string[];connectedAt:string|null;lastSyncedAt:string|null;lastWebhookAt:string|null;lastSyncError:string;importCount:number;latestImport:StravaImportReview|null};
export type StravaSyncResult={considered:number;imported:number;updated:number;failed:number;rateLimited:boolean;errors:string[];rateLimit:StravaRateLimit|null};

export function getStravaConfig(){
 const clientId=String(process.env.STRAVA_CLIENT_ID||"").trim();
 const clientSecret=String(process.env.STRAVA_CLIENT_SECRET||"").trim();
 const redirectUri=String(process.env.STRAVA_REDIRECT_URI||"").trim();
 if(!/^\d+$/.test(clientId))throw new Error("STRAVA_CLIENT_ID не настроен");
 if(clientSecret.length<8)throw new Error("STRAVA_CLIENT_SECRET не настроен");
 let redirect:URL;try{redirect=new URL(redirectUri)}catch{throw new Error("STRAVA_REDIRECT_URI не настроен")}
 if(redirect.protocol!=="https:"&&!(["localhost","127.0.0.1"].includes(redirect.hostname)&&redirect.protocol==="http:"))throw new Error("STRAVA_REDIRECT_URI должен использовать HTTPS (кроме localhost)");
 parseStravaEncryptionKey();
 return {clientId,clientSecret,redirectUri:redirect.toString()};
}

export function isStravaConfigured(){try{getStravaConfig();return true}catch{return false}}

export function getStravaWebhookConfig(){
 const verifyToken=String(process.env.STRAVA_WEBHOOK_VERIFY_TOKEN||"").trim();
 const processToken=String(process.env.STRAVA_WEBHOOK_PROCESS_TOKEN||"").trim();
 const subscriptionId=String(process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID||"").trim();
 if(verifyToken.length<16)throw new Error("STRAVA_WEBHOOK_VERIFY_TOKEN не настроен");
 if(processToken.length<24)throw new Error("STRAVA_WEBHOOK_PROCESS_TOKEN не настроен");
 if(subscriptionId&&!/^\d+$/.test(subscriptionId))throw new Error("STRAVA_WEBHOOK_SUBSCRIPTION_ID некорректен");
 return {verifyToken,processToken,subscriptionId};
}
export function isStravaWebhookConfigured(){try{const value=getStravaWebhookConfig();return !!value.subscriptionId}catch{return false}}

export function getStravaStatus():StravaStatus{
 purgeExpiredStravaData();
 const row=db.prepare(`${connectionSelect} WHERE username=?`).get(USERNAME) as ConnectionRow|undefined;
 const state=row?.status||"disconnected";
 return {configured:isStravaConfigured(),webhookConfigured:isStravaWebhookConfigured(),state,connected:state==="connected"||state==="sync_error",athleteName:row?.athleteName||"",athleteId:row?.athleteId||"",scopes:row?.scopes.split(/[ ,]+/).filter(Boolean)||[],connectedAt:row?.connectedAt||null,lastSyncedAt:row?.lastSyncedAt||null,lastWebhookAt:row?.lastWebhookAt||null,lastSyncError:row?.lastSyncError||"",
  importCount:Number((db.prepare("SELECT COUNT(*) count FROM workout_imports WHERE source='strava'").get() as any)?.count||0),latestImport:getLatestStravaImportReview()};
}

const activityFamilyForPlan=(type:string,title:string):ActivityFamily=>{
 const value=`${type} ${title}`.toLowerCase();
 if(value.includes("плав"))return "swim";
 if(value.includes("вел")||value.includes("cycling")||value.includes("bike"))return "bike";
 if(value.includes("сил"))return "strength";
 if(value.includes("восстанов")||value.includes("отдых"))return "recovery";
 return "cardio";
};
export function getLatestStravaImportReview():StravaImportReview|null{
 const row=db.prepare(`SELECT id,started_at startedAt,duration_seconds duration,activity_type activityType,metadata,draft_id draftId,review_status reviewStatus
  FROM workout_imports WHERE source='strava' AND review_status!='dismissed' ORDER BY updated_at DESC,id DESC LIMIT 1`).get() as any;
 if(!row)return null;
 let metadata:any={};try{metadata=JSON.parse(row.metadata||"{}")}catch{}
 const drafts=db.prepare("SELECT id,date,snapshot,started_at startedAt,finished_at finishedAt FROM workout_drafts WHERE status='awaiting_confirmation' ORDER BY id DESC LIMIT 50").all() as any[];
 const matches=rankActivityMatches({activityType:row.activityType,startedAt:row.startedAt,durationSeconds:Number(row.duration),distanceMeters:Number.isFinite(Number(metadata.distanceMeters))?Number(metadata.distanceMeters):null,subtype:metadata.sportType,localDate:metadata.localDate},drafts.map(draft=>{
  let snapshot:any={};try{snapshot=JSON.parse(draft.snapshot||"{}")}catch{}
  const duration=draft.startedAt&&draft.finishedAt?Math.max(1,(new Date(`${draft.finishedAt.replace(" ","T")}Z`).getTime()-new Date(`${draft.startedAt.replace(" ","T")}Z`).getTime())/1000):null;
  return {id:draft.id,date:draft.date,title:String(snapshot.title||"Тренировка"),activityType:activityFamilyForPlan(String(snapshot.type||""),String(snapshot.title||"")),startedAt:draft.startedAt,durationSeconds:duration};
 })).filter(item=>item.confidence!=="no_match").slice(0,3);
 return {id:row.id,name:String(metadata.name||"Активность Strava"),activityType:row.activityType,startedAt:row.startedAt,reviewStatus:row.reviewStatus,draftId:row.draftId,matches};
}

export function reviewStravaImport(input:{importId:unknown;action:unknown;draftId?:unknown}){
 const importId=Number(input.importId),action=String(input.action||"");
 if(!Number.isSafeInteger(importId)||importId<1||!["link","separate","dismiss"].includes(action))return {ok:false,error:"Некорректное действие",status:400} as const;
 const row=db.prepare("SELECT id FROM workout_imports WHERE id=? AND source='strava' AND (cache_expires_at IS NULL OR cache_expires_at>CURRENT_TIMESTAMP)").get(importId);
 if(!row)return {ok:false,error:"Активность не найдена или срок кэша истёк",status:404} as const;
 if(action==="link"){
  const draftId=Number(input.draftId);if(!Number.isSafeInteger(draftId)||draftId<1)return {ok:false,error:"Выберите тренировку",status:400} as const;
  const draft=db.prepare("SELECT 1 FROM workout_drafts WHERE id=? AND status='awaiting_confirmation'").get(draftId);if(!draft)return {ok:false,error:"Тренировка уже недоступна",status:409} as const;
  const conflict=db.prepare("SELECT 1 FROM workout_imports WHERE draft_id=? AND id!=?").get(draftId,importId);if(conflict)return {ok:false,error:"С тренировкой уже связана другая активность",status:409} as const;
  db.prepare("UPDATE workout_imports SET draft_id=?,review_status='linked',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(draftId,importId);
 }else db.prepare("UPDATE workout_imports SET draft_id=NULL,review_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(action==="dismiss"?"dismissed":"separate",importId);
 return {ok:true} as const;
}

export function saveStravaConnection(tokens:StravaTokenResponse){
 if(!tokens.athlete.id)throw new Error("Strava не вернула идентификатор спортсмена");
 const existing=db.prepare(`${connectionSelect} WHERE username=?`).get(USERNAME) as ConnectionRow|undefined;
 if(existing&&existing.athleteId!==tokens.athlete.id)throw new Error("Сначала отключите текущий аккаунт Strava");
 const access=encryptStravaToken(tokens.accessToken),refresh=encryptStravaToken(tokens.refreshToken);
 db.transaction(()=>{
  db.prepare(`INSERT INTO strava_connections(username,athlete_id,athlete_name,scopes)
   VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET athlete_id=excluded.athlete_id,athlete_name='',scopes=excluded.scopes,status='connected',needs_reauth_at=NULL,updated_at=CURRENT_TIMESTAMP,last_sync_error=''`).run(USERNAME,tokens.athlete.id,"",tokens.scope);
  db.prepare(`INSERT INTO strava_oauth_tokens(username,access_token_encrypted,refresh_token_encrypted,expires_at)
   VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET access_token_encrypted=excluded.access_token_encrypted,refresh_token_encrypted=excluded.refresh_token_encrypted,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP`).run(USERNAME,access,refresh,tokens.expiresAt);
 })();
}

let refreshInFlight:Promise<string>|null=null;
export function markStravaNeedsReauth(reason="Доступ Strava истёк или был отозван"){
 db.prepare("UPDATE strava_connections SET status='needs_reauth',needs_reauth_at=CURRENT_TIMESTAMP,last_sync_error=?,updated_at=CURRENT_TIMESTAMP WHERE username=?").run(reason.slice(0,300),USERNAME);
}
export async function getValidStravaAccessToken(fetcher:typeof fetch=fetch){
 const connection=db.prepare(`${connectionSelect} WHERE username=?`).get(USERNAME) as ConnectionRow|undefined;
 if(!connection)throw new Error("Strava не подключена");
 if(connection.status==="needs_reauth")throw new StravaApiError("Требуется повторное подключение Strava",401,{limit15:null,limitDaily:null,usage15:null,usageDaily:null,readLimit15:null,readLimitDaily:null,readUsage15:null,readUsageDaily:null});
 const row=db.prepare(`${tokenSelect} WHERE username=?`).get(USERNAME) as TokenRow|undefined;
 if(!row)throw new Error("Strava не подключена");
 if(row.expiresAt>Math.floor(Date.now()/1000)+3600)return decryptStravaToken(row.accessTokenEncrypted);
 if(refreshInFlight)return refreshInFlight;
 refreshInFlight=(async()=>{
  const config=getStravaConfig();
  let refreshed;
  try{refreshed=await refreshStravaAccessToken({clientId:config.clientId,clientSecret:config.clientSecret,refreshToken:decryptStravaToken(row.refreshTokenEncrypted)},fetcher)}
  catch(error){
   if(error instanceof StravaApiError&&(error.status===400||error.status===401||error.status===403))markStravaNeedsReauth();
   throw error;
  }
  db.prepare(`UPDATE strava_oauth_tokens SET access_token_encrypted=?,refresh_token_encrypted=?,expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE username=?`).run(
   encryptStravaToken(refreshed.accessToken),encryptStravaToken(refreshed.refreshToken),refreshed.expiresAt,USERNAME);
  return refreshed.accessToken;
 })().finally(()=>{refreshInFlight=null});
 return refreshInFlight;
}

const finite=(value:unknown,min:number,max:number)=>{const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null};
const integer=(value:unknown,min:number,max:number)=>{const number=finite(value,min,max);return number===null?null:Math.round(number)};
const shortText=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";

const BIKE_TYPES=new Set(["Ride","VirtualRide","EBikeRide","EMountainBikeRide","GravelRide","MountainBikeRide","Handcycle","Velomobile"]);
const STRENGTH_TYPES=new Set(["WeightTraining","Crossfit","HighIntensityIntervalTraining","Workout"]);
const RECOVERY_TYPES=new Set(["Yoga","Pilates","PhysicalTherapy"]);
export function mapStravaSportType(value:unknown):ActivityFamily{
 const sport=String(value||"");
 if(sport==="Swim")return "swim";
 if(BIKE_TYPES.has(sport))return "bike";
 if(STRENGTH_TYPES.has(sport))return "strength";
 if(RECOVERY_TYPES.has(sport))return "recovery";
 return "cardio";
}

export function mapStravaActivity(activity:any,athleteId:string,retrievedAt=new Date().toISOString()):ImportedWorkout{
 const activityId=String(activity?.id??"");
 if(!/^\d{1,24}$/.test(activityId))throw new Error("Активность Strava не содержит корректный id");
 const start=new Date(String(activity?.start_date||""));
 if(!Number.isFinite(start.getTime()))throw new Error(`Активность Strava ${activityId} не содержит корректное время старта`);
 const duration=integer(activity?.moving_time??activity?.elapsed_time,1,172800);
 if(duration===null)throw new Error(`Активность Strava ${activityId} не содержит корректную длительность`);
 const sportType=shortText(activity?.sport_type||activity?.type,80);
 const distanceMeters=finite(activity?.distance,0,1_000_000);
 const laps=Array.isArray(activity?.laps)&&sportType==="Swim"?activity.laps.slice(0,1000).map((lap:any)=>({
  distanceMeters:Math.round(finite(lap?.distance,0,100_000)??0),durationSeconds:Math.round(finite(lap?.moving_time??lap?.elapsed_time,0,86_400)??0),numLengths:null,
 })).filter((lap:any)=>lap.distanceMeters>0||lap.durationSeconds>0):[];
 return {
  source:"strava",externalId:activityId,
  fingerprint:createHash("sha256").update(`strava:${athleteId}:${activityId}`).digest("hex"),
  startedAt:start.toISOString(),duration,activityType:mapStravaSportType(sportType),
  averageHeartRate:integer(activity?.average_heartrate,20,250),maxHeartRate:integer(activity?.max_heartrate,20,250),calories:integer(activity?.calories,0,20_000),
  metadata:{
   averageCadence:finite(activity?.average_cadence,0,500),trainingEffect:null,fitSport:sportType,distanceMeters,laps,
   provider:"strava",activityId,providerExternalId:shortText(activity?.external_id,240)||null,uploadId:activity?.upload_id===undefined||activity?.upload_id===null?null:String(activity.upload_id),
   name:shortText(activity?.name,240),sportType,legacyType:shortText(activity?.type,80),movingTime:integer(activity?.moving_time,0,172800),elapsedTime:integer(activity?.elapsed_time,0,172800),
   localDate:/^\d{4}-\d{2}-\d{2}/.test(String(activity?.start_date_local||""))?String(activity.start_date_local).slice(0,10):start.toISOString().slice(0,10),
   totalElevationGain:finite(activity?.total_elevation_gain,0,100_000),averageSpeed:finite(activity?.average_speed,0,100),maxSpeed:finite(activity?.max_speed,0,150),
   averageWatts:finite(activity?.average_watts,0,5000),weightedAverageWatts:finite(activity?.weighted_average_watts,0,5000),maxWatts:integer(activity?.max_watts,0,10_000),kilojoules:finite(activity?.kilojoules,0,100_000),
   sufferScore:integer(activity?.suffer_score,0,10_000),deviceName:shortText(activity?.device_name,160)||null,trainer:activity?.trainer===true,commute:activity?.commute===true,manual:activity?.manual===true,private:activity?.private===true,
   workoutType:integer(activity?.workout_type,0,100),description:shortText(activity?.description,2000)||null,retrievedAt,
   // GPS coordinates, maps, photos, social fields and segment efforts are
   // intentionally not persisted: they are unnecessary for VOLT's workout model.
  },
 };
}

const remainingReadRequests=(limit:StravaRateLimit)=>limit.readLimit15!==null&&limit.readUsage15!==null?limit.readLimit15-limit.readUsage15:limit.limit15!==null&&limit.usage15!==null?limit.limit15-limit.usage15:null;
const afterEpoch=(lastSyncedAt:string|null,now:Date)=>lastSyncedAt
 ?Math.max(0,Math.floor(new Date(lastSyncedAt.replace(" ","T")+(/Z$/.test(lastSyncedAt)?"":"Z")).getTime()/1000)-INCREMENTAL_OVERLAP_SECONDS)
 :Math.floor(now.getTime()/1000)-INITIAL_LOOKBACK_DAYS*86400;
const errorText=(error:unknown)=>error instanceof StravaApiError?error.message:error instanceof Error?error.message:"Неизвестная ошибка Strava";

export async function syncStravaActivities(fetcher:typeof fetch=fetch,now=new Date()):Promise<StravaSyncResult>{
 purgeExpiredStravaData(now);
 const connection=db.prepare(`${connectionSelect} WHERE username=?`).get(USERNAME) as ConnectionRow|undefined;
 if(!connection)throw new Error("Strava не подключена");
 if(connection.status==="needs_reauth")throw new StravaApiError("Требуется повторное подключение Strava",401,{limit15:null,limitDaily:null,usage15:null,usageDaily:null,readLimit15:null,readLimitDaily:null,readUsage15:null,readUsageDaily:null});
 const accessToken=await getValidStravaAccessToken(fetcher);
 const summaries:any[]=[];let rateLimit:StravaRateLimit|null=null;
 try{
  for(let page=1;page<=MAX_SYNC_PAGES;page++){
   const listed=await listStravaActivities(accessToken,{after:afterEpoch(connection.lastSyncedAt,now),page,perPage:PAGE_SIZE},fetcher);
   rateLimit=listed.rateLimit;summaries.push(...listed.data);
   if(remainingReadRequests(rateLimit)!==null&&remainingReadRequests(rateLimit)!<=RATE_LIMIT_HEADROOM)break;
   if(listed.data.length<PAGE_SIZE)break;
  }
 }catch(error){
  if(error instanceof StravaApiError&&(error.status===401||error.status===403))markStravaNeedsReauth();
  else db.prepare("UPDATE strava_connections SET status='sync_error',last_sync_error=?,updated_at=CURRENT_TIMESTAMP WHERE username=?").run(errorText(error).slice(0,300),USERNAME);
  throw error;
 }

 const unique=[...new Map(summaries.map(item=>[String(item?.id??""),item])).values()].filter(item=>/^\d{1,24}$/.test(String(item?.id??"")));
 const result:StravaSyncResult={considered:unique.length,imported:0,updated:0,failed:0,rateLimited:false,errors:[],rateLimit};
 for(const summary of unique){
  if(rateLimit&&remainingReadRequests(rateLimit)!==null&&remainingReadRequests(rateLimit)!<=RATE_LIMIT_HEADROOM){result.rateLimited=true;break}
  try{
   const detailed=await getStravaActivity(accessToken,String(summary.id),fetcher);rateLimit=detailed.rateLimit;result.rateLimit=rateLimit;
   const stored=storeImportedWorkout(mapStravaActivity(detailed.data,connection.athleteId,now.toISOString()));
   if(stored.result.duplicate)result.updated++;else result.imported++;
  }catch(error){
   result.failed++;result.errors.push(errorText(error).slice(0,240));
   if(error instanceof StravaApiError&&error.status===429){result.rateLimited=true;result.rateLimit=error.rateLimit;break}
   if(error instanceof StravaApiError&&(error.status===401||error.status===403)){markStravaNeedsReauth();break}
  }
 }
 const syncError=result.errors.slice(0,3).join("; ");
 const completed=!result.rateLimited&&result.failed===0&&result.imported+result.updated===result.considered;
 if(completed){
  db.prepare("UPDATE strava_connections SET status='connected',last_synced_at=?,last_sync_error='',updated_at=CURRENT_TIMESTAMP WHERE username=?").run(now.toISOString(),USERNAME);
 }else{
  const partialError=syncError||"Синхронизация остановлена до обработки всех активностей; следующий запуск повторит окно импорта.";
  db.prepare("UPDATE strava_connections SET status=CASE WHEN status='needs_reauth' THEN status ELSE 'sync_error' END,last_sync_error=?,updated_at=CURRENT_TIMESTAMP WHERE username=?").run(partialError,USERNAME);
 }
 return result;
}

export async function disconnectStrava(fetcher:typeof fetch=fetch){
 const token=db.prepare(`${tokenSelect} WHERE username=?`).get(USERNAME) as TokenRow|undefined;
 let remoteRevoked=true,warning="";
 if(token){
  try{const config=getStravaConfig();await revokeStravaToken({clientId:config.clientId,clientSecret:config.clientSecret,token:decryptStravaToken(token.refreshTokenEncrypted)},fetcher)}
  catch{remoteRevoked=false;warning="Локальные данные удалены, но отзыв токена не подтверждён Strava. Проверьте раздел My Apps в Strava."}
 }
 const removed=deleteLocalStravaData({deleteConnection:true});
 return {ok:true,remoteRevoked,warning,removedImports:removed.imports,scrubbedWorkouts:removed.scrubbed};
}

export function deleteLocalStravaData(options:{deleteConnection?:boolean}={}){
 return db.transaction(()=>{
  // The workout shell, user notes and manually entered exercise details stay.
  // Every metric copied from Strava is conservatively removed as Strava-derived.
  const scrubbed=db.prepare(`UPDATE workout_logs SET duration_seconds=0,min_heart_rate=0,avg_heart_rate=0,max_heart_rate=0,calories=0,distance_meters=0,avg_speed=0,metrics_source='manual',external_activity_source=NULL,external_activity_id=NULL WHERE external_activity_source='strava'`).run().changes;
  const imports=db.prepare("DELETE FROM workout_imports WHERE source='strava'").run().changes;
  db.prepare("DELETE FROM strava_webhook_events").run();
  if(options.deleteConnection)db.prepare("DELETE FROM strava_connections WHERE username=?").run(USERNAME);
  return {imports,scrubbed};
 })();
}

export function deleteStravaActivity(activityId:string){
 if(!/^\d{1,24}$/.test(activityId))return {imports:0,scrubbed:0};
 return db.transaction(()=>{
  const scrubbed=db.prepare(`UPDATE workout_logs SET duration_seconds=0,min_heart_rate=0,avg_heart_rate=0,max_heart_rate=0,calories=0,distance_meters=0,avg_speed=0,metrics_source='manual',external_activity_source=NULL,external_activity_id=NULL WHERE external_activity_source='strava' AND external_activity_id=?`).run(activityId).changes;
  const imports=db.prepare("DELETE FROM workout_imports WHERE source='strava' AND external_id=?").run(activityId).changes;
  return {imports,scrubbed};
 })();
}

export function purgeExpiredStravaData(now=new Date()){
 const expired=db.prepare("SELECT external_id externalId FROM workout_imports WHERE source='strava' AND cache_expires_at IS NOT NULL AND cache_expires_at<=?").all(now.toISOString()) as {externalId:string|null}[];
 let imports=0,scrubbed=0;
 for(const row of expired){
  if(row.externalId){const removed=deleteStravaActivity(row.externalId);imports+=removed.imports;scrubbed+=removed.scrubbed}
 }
 // Webhook identifiers are also Strava metadata: the troubleshooting journal
 // therefore follows the same seven-day maximum as the activity cache.
 db.prepare("DELETE FROM strava_webhook_events WHERE status IN ('processed','ignored','failed') AND processed_at<datetime(?,'-7 days')").run(now.toISOString());
 return {imports,scrubbed};
}

export async function ingestStravaActivityById(activityId:string,athleteId:string,fetcher:typeof fetch=fetch,now=new Date()){
 const connection=db.prepare(`${connectionSelect} WHERE athlete_id=?`).get(athleteId) as ConnectionRow|undefined;
 if(!connection)throw new Error("Unknown Strava athlete");
 const accessToken=await getValidStravaAccessToken(fetcher);
 const detailed=await getStravaActivity(accessToken,activityId,fetcher);
 const stored=storeImportedWorkout(mapStravaActivity(detailed.data,connection.athleteId,now.toISOString()));
 db.prepare("UPDATE strava_connections SET status='connected',last_webhook_at=?,last_sync_error='',updated_at=CURRENT_TIMESTAMP WHERE athlete_id=?").run(now.toISOString(),athleteId);
 return {stored:stored.result,rateLimit:detailed.rateLimit};
}
