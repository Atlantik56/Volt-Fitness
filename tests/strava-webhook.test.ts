import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-strava-webhook-"));
process.env.STRAVA_CLIENT_ID="12345";
process.env.STRAVA_CLIENT_SECRET="client-secret-value";
process.env.STRAVA_REDIRECT_URI="http://localhost:3000/api/strava/callback";
process.env.STRAVA_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,8).toString("base64");
process.env.STRAVA_WEBHOOK_VERIFY_TOKEN="verify-token-value";
process.env.STRAVA_WEBHOOK_PROCESS_TOKEN="process-token-value-long-enough";
process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID="9001";

const {db}=await import("@/lib/db.ts");
const strava=await import("@/lib/strava-service.ts");
const webhook=await import("@/lib/strava-webhook.ts");
db.prepare("INSERT OR IGNORE INTO auth_user(username,password_hash,salt) VALUES('Atlantik','hash','salt')").run();

const connect=()=>strava.saveStravaConnection({accessToken:"access",refreshToken:"refresh",expiresAt:2_100_000_000,scope:"activity:read",athlete:{id:"42",name:"Webhook Athlete"}});
const event=(over:Record<string,unknown>={})=>webhook.parseStravaWebhookPayload({object_type:"activity",aspect_type:"create",object_id:123,owner_id:42,subscription_id:9001,event_time:1_788_220_800,updates:{},...over})!;
const detail=(id=123,duration=1800)=>({id,name:"Webhook Ride",sport_type:"Ride",type:"Ride",start_date:"2026-09-01T08:00:00Z",moving_time:duration,distance:12000});

test("verification handshake accepts only the configured token",()=>{
 assert.equal(webhook.verifyStravaWebhookChallenge({mode:"subscribe",challenge:"abc",token:"verify-token-value"},"verify-token-value"),"abc");
 assert.equal(webhook.verifyStravaWebhookChallenge({mode:"subscribe",challenge:"abc",token:"wrong"},"verify-token-value"),null);
 assert.equal(webhook.verifyStravaWebhookChallenge({mode:"unsubscribe",challenge:"abc",token:"verify-token-value"},"verify-token-value"),null);
});

test("payload guard rejects malformed events and deterministic id deduplicates delivery",()=>{
 assert.equal(webhook.parseStravaWebhookPayload({object_type:"activity"}),null);
 const parsed=event();const first=webhook.enqueueStravaWebhookEvent(parsed,"9001"),second=webhook.enqueueStravaWebhookEvent(parsed,"9001");
 assert.equal(first.accepted,true);assert.equal(second.accepted,false);assert.equal(first.eventId,second.eventId);
 assert.equal(webhook.enqueueStravaWebhookEvent(event({subscription_id:12}),"9001").reason,"subscription_mismatch");
});

test("create and update fetch server-side detail through shared ingestion without duplicates",async()=>{
 connect();let duration=1800;
 const fetcher=async(input:string|URL|Request)=>new Response(JSON.stringify(detail(Number(String(input).match(/activities\/(\d+)/)?.[1]||123),duration)),{status:200,headers:{"content-type":"application/json","x-readratelimit-limit":"100,1000","x-readratelimit-usage":"1,1"}});
 const created=await webhook.processPendingStravaWebhookEvents({fetcher:fetcher as typeof fetch,now:new Date("2026-09-01T10:00:00Z"),limit:10});
 assert.equal(created.processed,1);
 const confirmedId=Number(db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,duration_seconds,metrics_source,external_activity_source,external_activity_id)
  VALUES('2026-09-01','Cycling','Confirmed and manually reviewed','[]',1,1999,'imported_metric','strava','123')`).run().lastInsertRowid);
 duration=2100;webhook.enqueueStravaWebhookEvent(event({aspect_type:"update",event_time:1_788_220_900}),"9001");
 const updated=await webhook.processPendingStravaWebhookEvents({fetcher:fetcher as typeof fetch,now:new Date("2026-09-01T10:02:00Z")});
 assert.equal(updated.processed,1);
 const row=db.prepare("SELECT COUNT(*) count,MAX(duration_seconds) duration FROM workout_imports WHERE source='strava' AND external_id='123'").get() as any;
 assert.deepEqual(row,{count:1,duration:2100});
 assert.equal((db.prepare("SELECT duration_seconds duration FROM workout_logs WHERE id=?").get(confirmedId) as any).duration,1999);
});

test("delete clears Strava cache and derived metrics but keeps manual workout data",async()=>{
 const workoutId=Number(db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,duration_seconds,avg_heart_rate,notes,details,metrics_source,external_activity_source,external_activity_id)
  VALUES('2026-09-01','Cycling','Manual title','[]',1,2100,140,'keep note','[{"name":"keep exercise"}]','imported_metric','strava','123')`).run().lastInsertRowid);
 webhook.enqueueStravaWebhookEvent(event({aspect_type:"delete",event_time:1_788_221_000}),"9001");
 const result=await webhook.processPendingStravaWebhookEvents({now:new Date("2026-09-01T10:04:00Z")});assert.equal(result.processed,1);
 const row=db.prepare("SELECT title,notes,details,duration_seconds duration,external_activity_source source FROM workout_logs WHERE id=?").get(workoutId) as any;
 assert.equal(row.title,"Manual title");assert.equal(row.notes,"keep note");assert.match(row.details,/keep exercise/);assert.equal(row.duration,0);assert.equal(row.source,null);
});

test("unknown athlete is ignored and 429 is persisted for exponential retry",async()=>{
 webhook.enqueueStravaWebhookEvent(event({object_id:456,owner_id:999,event_time:1_788_221_100}),"9001");
 let result=await webhook.processPendingStravaWebhookEvents({now:new Date("2026-09-01T10:06:00Z")});assert.equal(result.ignored,1);
 connect();webhook.enqueueStravaWebhookEvent(event({object_id:789,event_time:1_788_221_200}),"9001");
 const fetcher=async()=>new Response(JSON.stringify({message:"Rate Limit Exceeded"}),{status:429,headers:{"content-type":"application/json","retry-after":"60"}});
 result=await webhook.processPendingStravaWebhookEvents({fetcher:fetcher as typeof fetch,now:new Date("2026-09-01T10:08:00Z")});assert.equal(result.retried,1);
 const row=db.prepare("SELECT status,retry_count retryCount,next_retry_at nextRetryAt FROM strava_webhook_events WHERE object_id='789'").get() as any;
 assert.equal(row.status,"retry");assert.equal(row.retryCount,1);assert.ok(row.nextRetryAt);
});

test("athlete deauthorization removes credentials and all Strava data",async()=>{
 const deauth=event({object_type:"athlete",aspect_type:"update",object_id:42,owner_id:42,event_time:1_788_221_300,updates:{authorized:"false"}});
 webhook.enqueueStravaWebhookEvent(deauth,"9001");await webhook.processPendingStravaWebhookEvents({now:new Date("2026-09-01T10:10:00Z")});
 assert.equal(strava.getStravaStatus().state,"disconnected");
 assert.equal((db.prepare("SELECT COUNT(*) count FROM strava_oauth_tokens").get() as any).count,0);
});
