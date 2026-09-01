import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { StravaApiError } from "@/lib/strava-client";
import { deleteLocalStravaData, deleteStravaActivity, ingestStravaActivityById, markStravaNeedsReauth, purgeExpiredStravaData } from "@/lib/strava-service";

export type StravaWebhookEvent={
 objectType:"activity"|"athlete";aspectType:"create"|"update"|"delete";objectId:string;ownerId:string;
 subscriptionId:string;eventTime:number;updates:Record<string,string|boolean>;
};

const integerId=(value:unknown)=>{const text=String(value??"");return /^\d{1,24}$/.test(text)?text:null};
const canonicalUpdates=(updates:Record<string,string|boolean>)=>JSON.stringify(Object.fromEntries(Object.entries(updates).sort(([a],[b])=>a.localeCompare(b))));
const safeEqual=(left:string,right:string)=>{const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b)};
export function verifyStravaWebhookChallenge(input:{mode:string;challenge:string;token:string},expectedToken:string){
 return input.mode==="subscribe"&&input.challenge.length>0&&input.challenge.length<=512&&safeEqual(input.token,expectedToken)?input.challenge:null;
}

export function parseStravaWebhookPayload(payload:unknown):StravaWebhookEvent|null{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return null;
 const value=payload as Record<string,unknown>;
 const objectType=value.object_type,aspectType=value.aspect_type;
 const objectId=integerId(value.object_id),ownerId=integerId(value.owner_id),subscriptionId=integerId(value.subscription_id);
 const eventTime=Number(value.event_time);
 if((objectType!=="activity"&&objectType!=="athlete")||(aspectType!=="create"&&aspectType!=="update"&&aspectType!=="delete")||!objectId||!ownerId||!subscriptionId||!Number.isSafeInteger(eventTime)||eventTime<1)return null;
 const rawUpdates=value.updates;
 if(rawUpdates!==undefined&&(!rawUpdates||typeof rawUpdates!=="object"||Array.isArray(rawUpdates)))return null;
 const updates:Record<string,string|boolean>={};
 for(const [key,item] of Object.entries((rawUpdates||{}) as Record<string,unknown>)){
  if(key.length>80||(typeof item!=="string"&&typeof item!=="boolean"))return null;
  updates[key]=typeof item==="string"?item.slice(0,240):item;
 }
 return {objectType,aspectType,objectId,ownerId,subscriptionId,eventTime,updates};
}

export function stravaWebhookEventId(event:StravaWebhookEvent){
 return createHash("sha256").update([event.subscriptionId,event.objectType,event.objectId,event.aspectType,event.ownerId,event.eventTime,canonicalUpdates(event.updates)].join(":"),"utf8").digest("hex");
}

export function enqueueStravaWebhookEvent(event:StravaWebhookEvent,expectedSubscriptionId=""){
 if(expectedSubscriptionId&&event.subscriptionId!==expectedSubscriptionId)return {accepted:false,reason:"subscription_mismatch",eventId:""};
 const eventId=stravaWebhookEventId(event);
 const storedUpdates=event.objectType==="athlete"&&(event.updates.authorized===false||event.updates.authorized==="false")?'{"authorized":"false"}':'{}';
 const inserted=db.prepare(`INSERT OR IGNORE INTO strava_webhook_events
  (event_id,subscription_id,object_id,object_type,aspect_type,owner_id,event_time,updates_json)
  VALUES(?,?,?,?,?,?,?,?)`).run(eventId,event.subscriptionId,event.objectId,event.objectType,event.aspectType,event.ownerId,event.eventTime,storedUpdates);
 if(inserted.changes===1)db.prepare("UPDATE strava_connections SET last_webhook_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE athlete_id=?").run(event.ownerId);
 return {accepted:inserted.changes===1,reason:inserted.changes===1?"queued":"duplicate",eventId};
}

type EventRow={eventId:string;objectId:string;objectType:"activity"|"athlete";aspectType:"create"|"update"|"delete";ownerId:string;updatesJson:string;retryCount:number};
const eventSelect=`SELECT event_id eventId,object_id objectId,object_type objectType,aspect_type aspectType,owner_id ownerId,updates_json updatesJson,retry_count retryCount FROM strava_webhook_events`;
const retryable=(error:unknown)=>error instanceof StravaApiError&&(error.status===429||error.status>=500);
const authError=(error:unknown)=>error instanceof StravaApiError&&(error.status===400||error.status===401||error.status===403);
const errorText=(error:unknown)=>error instanceof Error?error.message.slice(0,300):"Webhook processing failed";

async function processClaimedEvent(row:EventRow,fetcher:typeof fetch,now:Date){
 const updates=JSON.parse(row.updatesJson||"{}") as Record<string,string|boolean>;
 if(row.objectType==="athlete"){
  if(row.aspectType==="update"&&(updates.authorized===false||updates.authorized==="false"))deleteLocalStravaData({deleteConnection:true});
  return;
 }
 const connection=db.prepare("SELECT 1 FROM strava_connections WHERE athlete_id=?").get(row.ownerId);
 if(!connection)throw new Error("Unknown Strava athlete");
 if(row.aspectType==="delete"){deleteStravaActivity(row.objectId);return}
 await ingestStravaActivityById(row.objectId,row.ownerId,fetcher,now);
}

export async function processPendingStravaWebhookEvents(options:{fetcher?:typeof fetch;now?:Date;limit?:number}={}){
 const fetcher=options.fetcher||fetch,now=options.now||new Date(),limit=Math.max(1,Math.min(20,options.limit||5));
 purgeExpiredStravaData(now);
 const rows=db.prepare(`${eventSelect} WHERE status IN ('pending','retry') AND (next_retry_at IS NULL OR next_retry_at<=?) ORDER BY event_time,received_at LIMIT ?`).all(now.toISOString(),limit) as EventRow[];
 const result={considered:rows.length,processed:0,retried:0,ignored:0,failed:0};
 for(const row of rows){
  const claimed=db.prepare("UPDATE strava_webhook_events SET status='processing' WHERE event_id=? AND status IN ('pending','retry')").run(row.eventId).changes;
  if(!claimed)continue;
  try{
   await processClaimedEvent(row,fetcher,now);
   db.prepare("UPDATE strava_webhook_events SET status='processed',processed_at=?,next_retry_at=NULL,last_error='' WHERE event_id=?").run(now.toISOString(),row.eventId);
   result.processed++;
  }catch(error){
   if(errorText(error)==="Unknown Strava athlete"){
    db.prepare("UPDATE strava_webhook_events SET status='ignored',processed_at=?,last_error=? WHERE event_id=?").run(now.toISOString(),"Unknown athlete",row.eventId);result.ignored++;continue;
   }
   if(authError(error)){
    markStravaNeedsReauth();
    db.prepare("UPDATE strava_webhook_events SET status='failed',processed_at=?,retry_count=retry_count+1,last_error=? WHERE event_id=?").run(now.toISOString(),errorText(error),row.eventId);result.failed++;continue;
   }
   if(retryable(error)&&row.retryCount<8){
    const retryAfter=error instanceof StravaApiError?error.retryAfterSeconds||0:0;
    const seconds=Math.min(21_600,Math.max(retryAfter,60*2**row.retryCount));
    const retryAt=new Date(now.getTime()+seconds*1000).toISOString();
    db.prepare("UPDATE strava_webhook_events SET status='retry',retry_count=retry_count+1,next_retry_at=?,last_error=? WHERE event_id=?").run(retryAt,errorText(error),row.eventId);result.retried++;continue;
   }
   db.prepare("UPDATE strava_webhook_events SET status='failed',processed_at=?,retry_count=retry_count+1,last_error=? WHERE event_id=?").run(now.toISOString(),errorText(error),row.eventId);result.failed++;
  }
 }
 return result;
}
