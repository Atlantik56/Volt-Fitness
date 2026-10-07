import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-wellness-"));
const {db}=await import("@/lib/db.ts");
const health=await import("@/lib/health-connect.ts");
const wellness=await import("@/lib/health-connect-wellness.ts");
const jobs=await import("@/lib/health-sync-requests.ts");
const {loadAiCoachContextData}=await import("@/lib/ai-context-data.ts");
const {buildAiCoachContext,renderAiCoachContextText}=await import("@/lib/ai-context.ts");
const username="Atlantik";
function pair(){const claim=health.claimHealthPairing(health.createHealthPairing(username).token,"Synthetic phone");assert.ok(claim.ok);return {id:claim.deviceId,username}}
const record=(id:string,type:string,metrics:any,origin="com.garmin.connect",start="2026-09-25T06:00:00Z",end="2026-09-25T07:00:00Z")=>({source:"health_connect",sourceOrigin:origin,sourceOriginName:origin,externalRecordId:id,recordType:type,startTime:start,endTime:end,sourceModifiedAt:"2026-09-25T18:00:00Z",metrics});
const batch=(records:any[],requestId?:string)=>({syncedAt:new Date().toISOString(),...(requestId?{requestId}:{}),diagnostics:{timeZone:"Europe/Moscow",healthConnectAvailable:true,grantedPermissions:["weight","steps","sleep","active_calories"],historyAccessAvailable:true,historyAccessGranted:true,discoveredRecordTypes:[...new Set(records.map(row=>row.recordType))],origins:[...new Set(records.map(row=>row.sourceOrigin))].map(packageName=>({packageName,name:packageName,isGarmin:false}))},records});
test("measured weight/activity reach fitness and Coach without rewriting manual data or workouts",()=>{
 const device=pair();const before=db.prepare("SELECT * FROM workout_logs").all();
 const input=batch([record("weight","weight",{kilograms:79}),record("steps","steps",{count:6000},wellness.HEALTH_AGGREGATE_ORIGIN),record("calories","active_calories",{kilocalories:450},wellness.HEALTH_AGGREGATE_ORIGIN),record("sleep","sleep",{durationSeconds:7*3600,title:null,stages:[]},"com.garmin.connect","2026-09-24T21:00:00Z","2026-09-25T04:00:00Z"),record("hrv","heart_rate_variability",{rmssdMillis:55}),record("rest","resting_heart_rate",{bpm:52})]);
 assert.ok(health.ingestHealthSync(device,input).ok);assert.ok(health.ingestHealthSync(device,input).ok);
 const days=wellness.readHealthWellness(db,"2026-09-25","2026-09-25");assert.equal(days.length,1);assert.equal(days[0].weight,79);assert.equal(days[0].steps,6000);
 const context=loadAiCoachContextData(db,{date:"2026-09-25"});
 assert.equal(context.measurements?.[0].weight,79);assert.equal(context.activity?.[0].sleepHours,7);
 const prompt=renderAiCoachContextText(buildAiCoachContext(context));assert.match(prompt,/55 мс/);assert.match(prompt,/пульс покоя 52/);assert.match(prompt,/6000/);
 assert.deepEqual(db.prepare("SELECT * FROM workout_logs").all(),before);assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_imports").get() as any).n,0);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM measurements WHERE date='2026-09-25'").get() as any).n,0);
});
test("manual weight and explicit zero activity overrides have priority and are preserved",()=>{
 const days=wellness.readHealthWellness(db,"2026-09-25","2026-09-25");
 const manual=[{id:88,date:"2026-09-25",weight:78,waist:90}];assert.deepEqual(wellness.mergeHealthMeasurements(manual,days),manual);
 const row={date:"2026-09-25",steps:0,calories:0,sleepHours:0,beers:1,healthOverrides:'["steps","calories","sleepHours"]'};
 const merged=wellness.mergeHealthActivity([row],days)[0];assert.equal(merged.steps,0);assert.equal(merged.calories,0);assert.equal(merged.sleepHours,0);assert.equal(row.beers,1);
});
test("SDK aggregate supersedes overlapping raw providers; total calories are never added to active",()=>{
 const device=pair();assert.ok(health.ingestHealthSync(device,batch([record("raw-steps","steps",{count:999999}),record("total","total_calories",{kilocalories:2300},wellness.HEALTH_AGGREGATE_ORIGIN)])).ok);
 const day=wellness.readHealthWellness(db,"2026-09-25","2026-09-25")[0];const activity=wellness.mergeHealthActivity([], [day])[0];
 assert.equal(activity.steps,6000);assert.equal(activity.calories,450);assert.equal(activity.healthConnect.totalCalories,2300);
});
test("local midnight belongs to the phone calendar day and each day has one measured weight",()=>{
 const device=pair();assert.ok(health.ingestHealthSync(device,batch([record("local-midnight","weight",{kilograms:77},"com.garmin.connect","2026-09-26T21:30:00Z","2026-09-26T21:30:00Z")])).ok);
 const day=wellness.readHealthWellness(db,"2026-09-27","2026-09-27");assert.equal(day[0].weight,77);assert.equal(day[0].date,"2026-09-27");
});
test("ambiguous legacy overlaps stay out of daily totals instead of inflating them",()=>{
 const device=pair();assert.ok(health.ingestHealthSync(device,batch([record("overlap-a","steps",{count:100},"com.example.other","2026-09-28T06:00:00Z","2026-09-28T07:00:00Z"),record("overlap-b","steps",{count:100},"com.example.other","2026-09-28T06:30:00Z","2026-09-28T07:30:00Z")])).ok);
 assert.equal(wellness.readHealthWellness(db,"2026-09-28","2026-09-28")[0].steps,undefined);
});
test("Intervals recovery fields remain authoritative and Health fills only missing fields",()=>{
 const day=wellness.readHealthWellness(db,"2026-09-25","2026-09-25")[0];const original={date:day.date,sleepSeconds:8*3600,hrvRmssd:null,restingHr:50};
 const row=wellness.mergeHealthRecovery([original],[day])[0];assert.equal(row.sleepSeconds,8*3600);assert.equal(row.restingHr,50);assert.equal(row.hrvRmssd,55);assert.equal(original.hrvRmssd,null);
});
test("PWA sync request is device-bound, stays running until completion, and rejects revoked devices",()=>{
 const device=pair(),other=pair();const request=jobs.createHealthSyncRequest(username,device.id);assert.ok(request);
 const input=batch([record("requested-weight","weight",{kilograms:76})],request.id);
 assert.equal(health.ingestHealthSync(other,input).ok,false);assert.ok(health.ingestHealthSync(device,input).ok);
 assert.equal(jobs.getHealthSyncRequest(username,request.id).status,"running");assert.equal(jobs.getHealthSyncRequest("another-user",request.id),null);
 assert.equal(jobs.finishHealthSync(other,request.id,true),false);assert.equal(jobs.finishHealthSync(device,request.id,true),true);
 assert.equal(jobs.getHealthSyncRequest(username,request.id).status,"completed");assert.ok(health.healthBridgeStatus(username).devices.find(row=>row.id===device.id)?.lastSyncAt);
 const stamp=health.healthBridgeStatus(username).devices.find(row=>row.id===device.id)?.lastSyncAt;
 assert.equal(jobs.finishHealthSync(device,request.id,true),true);assert.equal(jobs.finishHealthSync(device,request.id,false),false);
 assert.equal(health.healthBridgeStatus(username).devices.find(row=>row.id===device.id)?.lastSyncAt,stamp);
 const second=jobs.createHealthSyncRequest(username,device.id);assert.ok(second);health.revokeHealthDevice(device.id,username);assert.equal(jobs.finishHealthSync(device,second.id,true),false);
});
