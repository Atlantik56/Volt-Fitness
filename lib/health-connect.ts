import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { validHealthSyncRequest } from "./health-sync-requests.ts";

export const MAX_HEALTH_SYNC_BYTES=256_000;
export const MAX_HEALTH_SYNC_RECORDS=50;
const PAIRING_TTL_MS=10*60_000;
const RECORD_TYPES=["exercise","sleep","heart_rate","resting_heart_rate","heart_rate_variability","weight","steps","total_calories","active_calories"] as const;
const PERMISSION_KEYS=["heart_rate","resting_heart_rate","heart_rate_variability","sleep","weight","exercise","steps","total_calories","active_calories"] as const;

const iso=z.string().datetime({offset:true});
const origin=z.object({packageName:z.string().min(1).max(200),name:z.string().max(120).default(""),isGarmin:z.boolean()}).strict();
const timeZone=z.string().max(100).refine(value=>{try{new Intl.DateTimeFormat("en",{timeZone:value});return true}catch{return false}},"Invalid IANA time zone");
const diagnosticsSchema=z.object({
 timeZone:timeZone.optional(),
 bridgeVersion:z.string().max(30).optional(),
 healthConnectAvailable:z.boolean(),
 grantedPermissions:z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length),
 historyAccessAvailable:z.boolean(),
 historyAccessGranted:z.boolean(),
 discoveredRecordTypes:z.array(z.enum(RECORD_TYPES)).max(RECORD_TYPES.length),
 origins:z.array(origin).max(30),
}).strict();

const base={
 source:z.literal("health_connect"),
 sourceOrigin:z.string().min(1).max(200),
 sourceOriginName:z.string().max(120).default(""),
 externalRecordId:z.string().min(1).max(240),
 startTime:iso,
 endTime:iso,
 sourceModifiedAt:iso.nullable().optional(),
};
const nullable=(schema:z.ZodTypeAny)=>schema.nullable().optional();
const bpm=z.number().int().min(20).max(260);
const healthRecordSchema=z.discriminatedUnion("recordType",[
 z.object({...base,recordType:z.literal("exercise"),metrics:z.object({exerciseType:z.string().min(1).max(100),title:z.string().max(240).nullable().optional(),durationSeconds:z.number().int().min(1).max(604800),distanceMeters:nullable(z.number().min(0).max(10_000_000)),caloriesKcal:nullable(z.number().min(0).max(100_000)),averageHeartRate:nullable(bpm),maxHeartRate:nullable(bpm)}).strict()}).strict(),
 z.object({...base,recordType:z.literal("sleep"),metrics:z.object({durationSeconds:z.number().int().min(1).max(259200),title:z.string().max(240).nullable().optional(),stages:z.array(z.object({stageType:z.string().min(1).max(80),startTime:iso,endTime:iso}).strict()).max(200)}).strict()}).strict(),
 z.object({...base,recordType:z.literal("heart_rate"),metrics:z.object({sampleCount:z.number().int().min(0).max(100_000),minimumBpm:nullable(bpm),averageBpm:nullable(bpm),maximumBpm:nullable(bpm),samples:z.array(z.object({time:iso,bpm}).strict()).max(2_000)}).strict()}).strict(),
 z.object({...base,recordType:z.literal("resting_heart_rate"),metrics:z.object({bpm}).strict()}).strict(),
 z.object({...base,recordType:z.literal("heart_rate_variability"),metrics:z.object({rmssdMillis:z.number().min(1).max(200)}).strict()}).strict(),
 z.object({...base,recordType:z.literal("weight"),metrics:z.object({kilograms:z.number().min(20).max(500)}).strict()}).strict(),
 z.object({...base,recordType:z.literal("steps"),metrics:z.object({count:z.number().int().min(0).max(1_000_000)}).strict()}).strict(),
 z.object({...base,recordType:z.literal("total_calories"),metrics:z.object({kilocalories:z.number().min(0).max(100_000)}).strict()}).strict(),
 z.object({...base,recordType:z.literal("active_calories"),metrics:z.object({kilocalories:z.number().min(0).max(100_000)}).strict()}).strict(),
]);
export const healthSyncSchema=z.object({
 syncedAt:iso,
 requestId:z.string().uuid().optional(),
 diagnostics:diagnosticsSchema,
 records:z.array(healthRecordSchema).max(MAX_HEALTH_SYNC_RECORDS),
}).strict();
export type HealthSyncBatch=z.infer<typeof healthSyncSchema>;

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const nowIso=()=>new Date().toISOString();
const safeDate=(value:string)=>{const n=Date.parse(value);return Number.isFinite(n)?n:null};
const isGarminOrigin=(packageName:string,name:string)=>packageName.toLowerCase().includes("garmin")||name.toLowerCase().includes("garmin");
// Providers can publish the current day's steps/calories before its interval ends.
// Preserve the original interval; it is not a completed workout or a forecast.
const ONGOING_DAILY_TYPES=new Set(["steps","total_calories","active_calories"]);
const MAX_ONGOING_DAILY_MS=26*60*60_000; // Includes a 25-hour day at a DST change.

export function parseHealthSyncBatch(input:unknown){
 const parsed=healthSyncSchema.safeParse(input);
 if(!parsed.success)return {ok:false as const,error:"Некорректный формат Health Connect",issues:parsed.error.issues.map(item=>({path:item.path.join("."),code:item.code}))};
 const now=Date.now(),earliest=Date.UTC(2000,0,1),latest=now+5*60_000;
 const syncedAt=safeDate(parsed.data.syncedAt);
 if(syncedAt===null||syncedAt<earliest||syncedAt>latest)
  return {ok:false as const,error:"Некорректное время синхронизации Health Connect",issues:[]};
 const diagnosticOrigins=new Set(parsed.data.diagnostics.origins.map(item=>item.packageName));
 for(const [index,record] of parsed.data.records.entries()){
  const start=safeDate(record.startTime),end=safeDate(record.endTime),modified=record.sourceModifiedAt?safeDate(record.sourceModifiedAt):now;
  const timeFailure=(field:string,code:string)=>({ok:false as const,error:"Некорректный временной диапазон Health Connect",issues:[{path:`records.${index}.${field}`,code}]});
  if(start===null||start<earliest)return timeFailure("startTime","invalid_record_start");
  if(start>latest)return timeFailure("startTime","future_record_start");
  if(end===null||end<start)return timeFailure("endTime","end_before_start");
  if(end-start>14*86400_000)return timeFailure("endTime","record_interval_too_long");
  const ongoingDaily=ONGOING_DAILY_TYPES.has(record.recordType)&&start<=now&&end-start<=MAX_ONGOING_DAILY_MS&&end<=now+MAX_ONGOING_DAILY_MS;
  if(end>latest&&!ongoingDaily)return timeFailure("endTime","future_record_end");
  if(modified===null||modified<earliest)return timeFailure("sourceModifiedAt","invalid_source_modified_time");
  if(modified>latest)return timeFailure("sourceModifiedAt","future_source_modified_time");
  if(!diagnosticOrigins.has(record.sourceOrigin))
   return {ok:false as const,error:"DataOrigin записи отсутствует в диагностике Health Connect",issues:[]};
  if(record.recordType==="heart_rate"&&record.metrics.samples.some(sample=>{const time=safeDate(sample.time);return time===null||time<start||time>end}))
   return {ok:false as const,error:"Пульсовая точка вне диапазона записи",issues:[]};
  if(record.recordType==="sleep"&&record.metrics.stages.some(stage=>{const a=safeDate(stage.startTime),b=safeDate(stage.endTime);return a===null||b===null||a<start||b<a||b>end}))
   return {ok:false as const,error:"Стадия сна вне диапазона сессии",issues:[]};
 }
 return {ok:true as const,data:parsed.data};
}

export function createHealthPairing(username:string){
 const token=randomBytes(24).toString("base64url"),expiresAt=Date.now()+PAIRING_TTL_MS;
 db.prepare("DELETE FROM health_bridge_pairings WHERE expires_at<? OR used_at IS NOT NULL").run(Date.now());
 db.prepare("INSERT INTO health_bridge_pairings(token_hash,username,expires_at) VALUES(?,?,?)").run(hash(token),username,expiresAt);
 return {token,expiresAt};
}

type HealthPairingClaim={ok:true;deviceToken:string;deviceId:number}|{ok:false;status:number;error:string};

export function claimHealthPairing(pairingToken:unknown,deviceName:unknown):HealthPairingClaim{
 const secret=String(pairingToken??""),name=String(deviceName??"").trim().slice(0,80);
 if(secret.length<20||!name)return {ok:false as const,status:400,error:"Некорректный код привязки или имя устройства"};
 const deviceToken=randomBytes(32).toString("base64url"),tokenHash=hash(deviceToken);
 let result:HealthPairingClaim={ok:false,status:401,error:"Код привязки недействителен или истёк"};
 db.transaction(()=>{
  const pairing=db.prepare("SELECT username,expires_at expiresAt,used_at usedAt FROM health_bridge_pairings WHERE token_hash=?").get(hash(secret)) as any;
  if(!pairing||pairing.usedAt||pairing.expiresAt<Date.now())return;
  const claimed=db.prepare("UPDATE health_bridge_pairings SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>=?").run(Date.now(),hash(secret),Date.now());
  if(claimed.changes!==1)return;
  const inserted=db.prepare("INSERT INTO health_bridge_devices(username,name,token_hash) VALUES(?,?,?)").run(pairing.username,name,tokenHash);
  result={ok:true,deviceToken,deviceId:Number(inserted.lastInsertRowid)};
 })();
 return result;
}

export function authenticateHealthDevice(req:Request){
 const header=req.headers.get("authorization")||"",match=/^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(header);
 if(!match)return null;
 return db.prepare("SELECT id,username,name FROM health_bridge_devices WHERE token_hash=? AND revoked_at IS NULL").get(hash(match[1])) as {id:number;username:string;name:string}|undefined||null;
}

export function ingestHealthSync(device:{id:number;username:string},input:unknown){
 const parsed=parseHealthSyncBatch(input);if(!parsed.ok)return parsed;
 let created=0,updated=0,authorized=false;
 db.transaction(()=>{
  if(!db.prepare("SELECT 1 FROM health_bridge_devices WHERE id=? AND username=? AND revoked_at IS NULL").get(device.id,device.username))return;
  if(parsed.data.requestId&&!validHealthSyncRequest(device,parsed.data.requestId))return;
  authorized=true;
  for(const record of parsed.data.records){
   // Legacy APKs may still send exercises. Ignore them without breaking the remaining wellness batch.
   if(record.recordType==="exercise")continue;
   const existing=db.prepare("SELECT id,source_modified_at sourceModifiedAt FROM health_connect_records WHERE username=? AND source_origin=? AND external_record_id=? AND record_type=?").get(device.username,record.sourceOrigin,record.externalRecordId,record.recordType) as {id:number;sourceModifiedAt:string|null}|undefined;
   if(existing?.sourceModifiedAt&&(!record.sourceModifiedAt||Date.parse(record.sourceModifiedAt)<Date.parse(existing.sourceModifiedAt)))continue;
   const metrics=JSON.stringify(record.metrics),modified=record.sourceModifiedAt??null;
   db.prepare(`INSERT INTO health_connect_records(username,device_id,source_origin,source_origin_name,external_record_id,record_type,start_time,end_time,metrics,source_modified_at,synced_at,time_zone)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(username,source_origin,external_record_id,record_type) DO UPDATE SET
     device_id=excluded.device_id,source_origin_name=excluded.source_origin_name,start_time=excluded.start_time,end_time=excluded.end_time,
     metrics=excluded.metrics,source_modified_at=excluded.source_modified_at,synced_at=excluded.synced_at,time_zone=excluded.time_zone,updated_at=CURRENT_TIMESTAMP`)
    .run(device.username,device.id,record.sourceOrigin,record.sourceOriginName,record.externalRecordId,record.recordType,record.startTime,record.endTime,metrics,modified,parsed.data.syncedAt,parsed.data.diagnostics.timeZone??"Europe/Moscow");
   if(existing)updated++;else created++;
  }
  const diagnostics={...parsed.data.diagnostics,origins:parsed.data.diagnostics.origins.map(item=>({...item,isGarmin:isGarminOrigin(item.packageName,item.name)}))};
  db.prepare("UPDATE health_bridge_devices SET diagnostics=?,last_seen_at=? WHERE id=?")
   .run(JSON.stringify(diagnostics),nowIso(),device.id);
  if(parsed.data.requestId)db.prepare("UPDATE health_sync_requests SET status='running',accepted=accepted+? WHERE id=?").run(created+updated,parsed.data.requestId);
 })();
 if(!authorized)return {ok:false as const,error:"Устройство Health Bridge отключено",issues:[],status:401};
 return {ok:true as const,created,updated,total:parsed.data.records.length};
}

export function healthBridgeStatus(username:string){
 const devices=(db.prepare("SELECT id,name,diagnostics,last_completed_at lastSyncAt,last_seen_at lastSeenAt,created_at createdAt FROM health_bridge_devices WHERE username=? AND revoked_at IS NULL ORDER BY id DESC").all(username) as any[]).map(row=>{
  let diagnostics:any={};try{diagnostics=JSON.parse(row.diagnostics||"{}")}catch{}
  if(Array.isArray(diagnostics.discoveredRecordTypes))diagnostics.discoveredRecordTypes=diagnostics.discoveredRecordTypes.filter((type:string)=>type!=="exercise");
  return {...row,diagnostics};
 });
 const totals=db.prepare("SELECT COUNT(*) count,MAX(synced_at) lastSyncedAt FROM health_connect_records WHERE username=? AND record_type!='exercise'").get(username) as any;
 return {devices,recordCount:Number(totals?.count||0),lastSyncedAt:totals?.lastSyncedAt??null};
}

export function revokeHealthDevice(deviceId:unknown,username:string){
 const id=Number(deviceId);if(!Number.isSafeInteger(id)||id<1)return false;
 return db.prepare("UPDATE health_bridge_devices SET revoked_at=? WHERE id=? AND username=? AND revoked_at IS NULL").run(nowIso(),id,username).changes===1;
}
