import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-health-intervals-"));
const {db}=await import("@/lib/db.ts");
const {USERNAME}=await import("@/lib/user.ts");
const {storeImportedWorkout}=await import("@/lib/fit-import-service.ts");
const health=await import("@/lib/health-connect.ts");

test("the same workout from Intervals/FIT and repeated Health Connect sync never becomes a second journal workout",()=>{
 const fit={source:"garmin_fit" as const,externalId:"garmin:qa:2026-09-28T07:00:00Z",fingerprint:"a".repeat(64),
  startedAt:"2026-09-28T07:00:00Z",duration:3600,activityType:"bike" as const,averageHeartRate:120,maxHeartRate:150,calories:500,
  metadata:{averageCadence:80,trainingEffect:null,fitSport:"cycling",distanceMeters:20000,laps:[]}};
 const imported=storeImportedWorkout(fit);
 assert.equal(imported.result.duplicate,false);
 // The already-confirmed journal entry is the owner's source of workout truth.
 db.prepare("INSERT INTO workout_logs(date,type,title,duration_seconds,metrics_source,external_activity_source,external_activity_id) VALUES(?,?,?,?,?,?,?)")
  .run("2026-09-28","Велосипед","Synthetic Intervals workout",3600,"garmin_fit","garmin_fit",fit.externalId);
 const journalBefore=db.prepare("SELECT * FROM workout_logs ORDER BY id").all();
 const importIdentities=()=>db.prepare("SELECT id,source,external_id,draft_id FROM workout_imports ORDER BY id").all();
 const importsBefore=importIdentities();
 const claim=health.claimHealthPairing(health.createHealthPairing(USERNAME).token,"Synthetic paired phone");assert.ok(claim.ok);
 const device={id:claim.deviceId,username:USERNAME};
 const record={source:"health_connect",sourceOrigin:"com.garmin.connect",sourceOriginName:"Garmin Connect",externalRecordId:"different-health-connect-record-id",
  recordType:"exercise",startTime:fit.startedAt,endTime:"2026-09-28T08:00:00Z",sourceModifiedAt:"2026-09-28T08:01:00Z",
  metrics:{exerciseType:"health_connect_8",title:"Synthetic Intervals workout",durationSeconds:3600,distanceMeters:null,caloriesKcal:500,averageHeartRate:120,maxHeartRate:150}};
 const batch={syncedAt:new Date().toISOString(),diagnostics:{healthConnectAvailable:true,grantedPermissions:["exercise"],historyAccessAvailable:true,historyAccessGranted:true,
  discoveredRecordTypes:["exercise"],origins:[{packageName:record.sourceOrigin,name:record.sourceOriginName,isGarmin:true}]},records:[record]};
 assert.deepEqual(health.ingestHealthSync(device,batch),{ok:true,created:1,updated:0,total:1});
 assert.deepEqual(health.ingestHealthSync(device,batch),{ok:true,created:0,updated:1,total:1});
 // Intervals can fetch byte-different FIT data for that same Garmin activity.
 const repeated=storeImportedWorkout({...fit,fingerprint:"b".repeat(64)});
 assert.equal(repeated.result.duplicate,true);
 assert.equal(repeated.result.id,imported.result.id);
 assert.deepEqual(db.prepare("SELECT * FROM workout_logs ORDER BY id").all(),journalBefore);
 assert.deepEqual(importIdentities(),importsBefore);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM health_connect_records WHERE record_type='exercise'").get() as {n:number}).n,1);
});
