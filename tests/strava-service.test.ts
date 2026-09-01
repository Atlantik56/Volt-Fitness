import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-strava-"));
process.env.STRAVA_CLIENT_ID="12345";
process.env.STRAVA_CLIENT_SECRET="client-secret-value";
process.env.STRAVA_REDIRECT_URI="http://localhost:3000/api/strava/callback";
process.env.STRAVA_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64");
const {db}=await import("@/lib/db.ts");
const strava=await import("@/lib/strava-service.ts");
const {storeImportedWorkout}=await import("@/lib/fit-import-service.ts");

db.prepare("INSERT OR IGNORE INTO auth_user(username,password_hash,salt) VALUES('Atlantik','hash','salt')").run();

const activity=(over:Record<string,unknown>={})=>({
 id:9876543210,name:"Morning Ride",sport_type:"VirtualRide",type:"Ride",start_date:"2026-08-31T06:30:00Z",moving_time:3600,elapsed_time:3720,distance:24500,
 average_heartrate:142.4,max_heartrate:177.8,calories:650,average_cadence:82.5,average_watts:210,device_name:"Garmin Edge",private:false,
 map:{summary_polyline:"must-not-be-stored"},start_latlng:[55.7,37.6],segment_efforts:[{id:1}],...over,
});

test("SportType маппится в общие VOLT activity families",()=>{
 assert.equal(strava.mapStravaSportType("Swim"),"swim");
 assert.equal(strava.mapStravaSportType("Ride"),"bike");
 assert.equal(strava.mapStravaSportType("WeightTraining"),"strength");
 assert.equal(strava.mapStravaSportType("Yoga"),"recovery");
 assert.equal(strava.mapStravaSportType("Run"),"cardio");
 assert.equal(strava.mapStravaSportType("FutureSport"),"cardio");
});

test("детальная активность нормализуется без GPS, карт и social payload",()=>{
 const mapped=strava.mapStravaActivity(activity(),"42","2026-09-01T00:00:00.000Z");
 assert.equal(mapped.source,"strava");
 assert.equal(mapped.externalId,"9876543210");
 assert.equal(mapped.activityType,"bike");
 assert.equal(mapped.duration,3600);
 assert.equal(mapped.averageHeartRate,142);
 assert.equal(mapped.metadata.distanceMeters,24500);
 assert.equal(mapped.metadata.sportType,"VirtualRide");
 assert.equal("map" in mapped.metadata,false);
 assert.equal("start_latlng" in mapped.metadata,false);
 assert.equal("segment_efforts" in mapped.metadata,false);
});

test("dedup выполняется по Strava activity id, детали обновляются in-place",()=>{
 db.prepare("DELETE FROM workout_imports WHERE source='strava'").run();
 const first=storeImportedWorkout(strava.mapStravaActivity(activity(),"42"));
 const second=storeImportedWorkout(strava.mapStravaActivity(activity({moving_time:3660,calories:700}),"42"));
 assert.equal(first.result.duplicate,false);
 assert.equal(second.result.duplicate,true);
 assert.equal(first.result.id,second.result.id);
 const row=db.prepare("SELECT COUNT(*) count,MAX(duration_seconds) duration,MAX(calories) calories FROM workout_imports WHERE source='strava' AND external_id='9876543210'").get() as any;
 assert.equal(row.count,1);assert.equal(row.duration,3660);assert.equal(row.calories,700);
});

test("OAuth tokens сохраняются отдельно и только зашифрованно",()=>{
 strava.saveStravaConnection({accessToken:"plain-access",refreshToken:"plain-refresh",expiresAt:2_000_000_000,scope:"activity:read",athlete:{id:"42",name:"Test Athlete"}});
 const row=db.prepare("SELECT access_token_encrypted accessToken,refresh_token_encrypted refreshToken FROM strava_oauth_tokens WHERE username='Atlantik'").get() as any;
 assert.equal(row.accessToken.includes("plain-access"),false);
 assert.equal(row.refreshToken.includes("plain-refresh"),false);
 const status=strava.getStravaStatus();assert.equal(status.connected,true);assert.equal(status.athleteId,"42");assert.deepEqual(status.scopes,["activity:read"]);
});

test("expired access token refreshes once and persists the rotated refresh token",async()=>{
 db.prepare("UPDATE strava_oauth_tokens SET expires_at=1").run();
 let calls=0;
 const fetcher=async()=>{calls++;return new Response(JSON.stringify({access_token:"rotated-access",refresh_token:"rotated-refresh",expires_at:2_100_000_000}),{status:200,headers:{"content-type":"application/json"}})};
 const [one,two]=await Promise.all([strava.getValidStravaAccessToken(fetcher as typeof fetch),strava.getValidStravaAccessToken(fetcher as typeof fetch)]);
 assert.equal(one,"rotated-access");assert.equal(two,"rotated-access");assert.equal(calls,1);
});

test("manual sync получает список, затем детальную активность и сохраняет её",async()=>{
 const urls:string[]=[];
 const fetcher=async(input:string|URL|Request)=>{
  const url=String(input);urls.push(url);
  const headers={"content-type":"application/json","x-readratelimit-limit":"100,1000","x-readratelimit-usage":url.includes("/activities/112233")?"2,2":"1,1"};
  if(url.includes("/athlete/activities"))return new Response(JSON.stringify([{id:112233}]),{status:200,headers});
  if(url.includes("/activities/112233"))return new Response(JSON.stringify(activity({id:112233,name:"Detailed Swim",sport_type:"Swim",type:"Swim",distance:1500,moving_time:2400,start_date_local:"2026-08-31T23:30:00Z"})),{status:200,headers});
  throw new Error(`Unexpected URL ${url}`);
 };
 const result=await strava.syncStravaActivities(fetcher as typeof fetch,new Date("2026-09-01T10:00:00Z"));
 assert.equal(result.considered,1);assert.equal(result.imported,1);assert.equal(result.failed,0);
 assert.equal(urls.some(url=>url.includes("/athlete/activities")),true);
 assert.equal(urls.some(url=>url.includes("/activities/112233")),true);
 const row=db.prepare("SELECT activity_type activityType,metadata FROM workout_imports WHERE source='strava' AND external_id='112233'").get() as any;
 assert.equal(row.activityType,"swim");assert.equal(JSON.parse(row.metadata).name,"Detailed Swim");
});

test("manual sync оставляет headroom и честно сообщает близкий rate limit",async()=>{
 let detailCalled=false;
 const fetcher=async(input:string|URL|Request)=>{
  const url=String(input),headers={"content-type":"application/json","x-readratelimit-limit":"100,1000","x-readratelimit-usage":"95,95"};
  if(url.includes("/athlete/activities"))return new Response(JSON.stringify([{id:778899}]),{status:200,headers});
  detailCalled=true;return new Response(JSON.stringify(activity({id:778899})),{status:200,headers});
 };
 const result=await strava.syncStravaActivities(fetcher as typeof fetch,new Date("2026-09-01T11:00:00Z"));
 assert.equal(result.rateLimited,true);assert.equal(detailCalled,false);assert.equal(result.considered,1);
 const connection=db.prepare("SELECT last_synced_at lastSyncedAt,last_sync_error lastSyncError FROM strava_connections WHERE username='Atlantik'").get() as any;
 assert.equal(connection.lastSyncedAt,"2026-09-01T10:00:00.000Z");
 assert.match(connection.lastSyncError,/повторит окно импорта/);
});

test("invalid refresh переводит интеграцию в needs_reauth и останавливает повторы",async()=>{
 strava.saveStravaConnection({accessToken:"expired",refreshToken:"invalid",expiresAt:1,scope:"activity:read",athlete:{id:"42",name:"Test Athlete"}});
 let calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify({message:"Bad Request"}),{status:400,headers:{"content-type":"application/json"}})};
 await assert.rejects(()=>strava.getValidStravaAccessToken(fetcher as typeof fetch));
 assert.equal(strava.getStravaStatus().state,"needs_reauth");
 await assert.rejects(()=>strava.getValidStravaAccessToken(fetcher as typeof fetch));assert.equal(calls,1);
});

test("семидневный TTL удаляет Strava cache и очищает derived metrics",()=>{
 strava.saveStravaConnection({accessToken:"access",refreshToken:"refresh",expiresAt:2_100_000_000,scope:"activity:read",athlete:{id:"42",name:"Test Athlete"}});
 storeImportedWorkout(strava.mapStravaActivity(activity({id:555}),"42","2026-08-20T00:00:00.000Z"));
 const workoutId=Number(db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,duration_seconds,notes,metrics_source,external_activity_source,external_activity_id)
  VALUES('2026-08-20','Cycling','Keep shell','[]',1,1800,'manual note','imported_metric','strava','555')`).run().lastInsertRowid);
 const removed=strava.purgeExpiredStravaData(new Date("2026-09-01T00:00:00.000Z"));assert.equal(removed.imports,1);assert.equal(removed.scrubbed,1);
 const row=db.prepare("SELECT title,notes,duration_seconds duration,external_activity_source source FROM workout_logs WHERE id=?").get(workoutId) as any;
 assert.deepEqual(row,{title:"Keep shell",notes:"manual note",duration:0,source:null});
});

test("disconnect удаляет Strava imports и очищает только производные метрики",async()=>{
 const workoutId=Number(db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,duration_seconds,avg_heart_rate,max_heart_rate,calories,distance_meters,avg_speed,metrics_source,external_activity_source,external_activity_id)
  VALUES('2026-08-31','Cycling','Test ride','[]',1,3600,142,178,650,24500,24.5,'imported_metric','strava','9876543210')`).run().lastInsertRowid);
 const fetcher=async()=>new Response(null,{status:200});
 const result=await strava.disconnectStrava(fetcher as typeof fetch);
 assert.equal(result.remoteRevoked,true);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM workout_imports WHERE source='strava'").get() as any).count,0);
 assert.equal(strava.getStravaStatus().connected,false);
 const workout=db.prepare("SELECT title,duration_seconds duration,avg_heart_rate heartRate,metrics_source metricsSource,external_activity_source source FROM workout_logs WHERE id=?").get(workoutId) as any;
 assert.equal(workout.title,"Test ride");assert.equal(workout.duration,0);assert.equal(workout.heartRate,0);assert.equal(workout.metricsSource,"manual");assert.equal(workout.source,null);
});
