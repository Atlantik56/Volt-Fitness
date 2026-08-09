import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-health-connect-"));
const {db}=await import("@/lib/db.ts");
const health=await import("@/lib/health-connect.ts");
const USERNAME="Atlantik";

const diagnostics=(garmin=true)=>({
 healthConnectAvailable:true,
 grantedPermissions:["heart_rate","sleep","exercise","steps"],
 historyAccessAvailable:true,
 historyAccessGranted:false,
 discoveredRecordTypes:["exercise","sleep"],
 origins:[{packageName:garmin?"com.garmin.connect":"com.example.health",name:garmin?"Garmin Connect":"Example Health",isGarmin:garmin}],
});
const exercise=(id="exercise-1",origin="com.garmin.connect")=>({
 source:"health_connect",sourceOrigin:origin,sourceOriginName:origin.includes("garmin")?"Garmin Connect":"Example Health",
 externalRecordId:id,recordType:"exercise",startTime:"2026-08-09T07:00:00.000Z",endTime:"2026-08-09T07:45:00.000Z",sourceModifiedAt:"2026-08-09T07:46:00.000Z",
 metrics:{exerciseType:"biking",title:"Indoor Cycling",durationSeconds:2700,distanceMeters:null,caloriesKcal:360,averageHeartRate:132,maxHeartRate:158},
});
const batch=(records:any[],garmin=true)=>({syncedAt:"2026-08-09T08:00:00.000Z",diagnostics:diagnostics(garmin),records});

function pairedDevice(){
 const pairing=health.createHealthPairing(USERNAME);
 const claimed=health.claimHealthPairing(pairing.token,"Sony Xperia");
 assert.equal(claimed.ok,true);
 const request=new Request("https://volt.test/api/health-connect/sync",{headers:{authorization:`Bearer ${claimed.deviceToken}`}});
 const device=health.authenticateHealthDevice(request);
 assert.ok(device);
 return device!;
}

test("migration v21 creates isolated Health Connect storage",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=21").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='health_connect_records'").get());
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n,1);
});

test("pairing is one-time and device auth accepts only its bearer token",()=>{
 const pairing=health.createHealthPairing(USERNAME);
 const claimed=health.claimHealthPairing(pairing.token,"Sony Xperia 1 VI");
 assert.equal(claimed.ok,true);
 assert.equal(health.claimHealthPairing(pairing.token,"Replay").ok,false);
 assert.equal(health.authenticateHealthDevice(new Request("https://volt.test",{headers:{authorization:"Bearer invalid"}})),null);
 if(claimed.ok)assert.equal(health.authenticateHealthDevice(new Request("https://volt.test",{headers:{authorization:`Bearer ${claimed.deviceToken}`}}))?.name,"Sony Xperia 1 VI");
});

test("typed batch preserves Garmin DataOrigin and optional missing distance",()=>{
 const device=pairedDevice(),result=health.ingestHealthSync(device,batch([exercise()]));
 assert.equal(result.ok,true);
 if(!result.ok)return;
 const row=db.prepare("SELECT source_origin sourceOrigin,source_origin_name sourceOriginName,metrics FROM health_connect_records WHERE external_record_id='exercise-1'").get() as any;
 assert.equal(row.sourceOrigin,"com.garmin.connect");
 assert.equal(row.sourceOriginName,"Garmin Connect");
 assert.equal(JSON.parse(row.metrics).distanceMeters,null);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n,1);
});

test("repeated identical batch is idempotent",()=>{
 const device=pairedDevice(),payload=batch([exercise("same-record")]);
 assert.deepEqual(health.ingestHealthSync(device,payload),{ok:true,created:1,updated:0,total:1});
 assert.deepEqual(health.ingestHealthSync(device,payload),{ok:true,created:0,updated:1,total:1});
 assert.equal((db.prepare("SELECT COUNT(*) n FROM health_connect_records WHERE external_record_id='same-record'").get() as any).n,1);
});

test("Garmin and non-Garmin origins remain distinct",()=>{
 const device=pairedDevice();
 const records=[exercise("shared-id","com.garmin.connect"),exercise("shared-id","com.example.health")];
 const payload=batch(records);
 payload.diagnostics.origins.push({packageName:"com.example.health",name:"Example Health",isGarmin:false});
 const result=health.ingestHealthSync(device,payload);
 assert.equal(result.ok,true);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM health_connect_records WHERE external_record_id='shared-id'").get() as any).n,2);
});

test("backend derives Garmin status from DataOrigin instead of trusting the client flag",()=>{
 const device=pairedDevice();
 const payload=batch([exercise("garmin-origin")]);
 payload.diagnostics.origins[0].isGarmin=false;
 assert.equal(health.ingestHealthSync(device,payload).ok,true);
 const stored=JSON.parse((db.prepare("SELECT diagnostics FROM health_bridge_devices WHERE id=?").get(device.id) as any).diagnostics);
 assert.equal(stored.origins[0].isGarmin,true);
});

test("sleep without stages and missing optional title are accepted honestly",()=>{
 const sleep={source:"health_connect",sourceOrigin:"com.garmin.connect",sourceOriginName:"Garmin Connect",externalRecordId:"sleep-1",recordType:"sleep",startTime:"2026-08-08T21:00:00.000Z",endTime:"2026-08-09T05:00:00.000Z",metrics:{durationSeconds:28800,title:null,stages:[]}};
 const parsed=health.parseHealthSyncBatch(batch([sleep]));
 assert.equal(parsed.ok,true);
});

test("invalid payload, impossible timestamps and oversized batch are rejected",()=>{
 assert.equal(health.parseHealthSyncBatch({records:"not-an-array"}).ok,false);
 assert.equal(health.parseHealthSyncBatch(batch([{...exercise("bad-time"),endTime:"2026-08-08T06:00:00.000Z"}])).ok,false);
 assert.equal(health.parseHealthSyncBatch(batch(Array.from({length:health.MAX_HEALTH_SYNC_RECORDS+1},(_,index)=>exercise(`many-${index}`)))).ok,false);
 assert.equal(health.parseHealthSyncBatch({...batch([]),syncedAt:"2099-01-01T00:00:00.000Z"}).ok,false);
 assert.equal(health.parseHealthSyncBatch(batch([{...exercise("unknown-origin"),sourceOrigin:"com.unknown"}])).ok,false);
});

test("heart samples must stay inside their record interval",()=>{
 const heart={source:"health_connect",sourceOrigin:"com.garmin.connect",sourceOriginName:"Garmin Connect",externalRecordId:"hr-1",recordType:"heart_rate",startTime:"2026-08-09T07:00:00.000Z",endTime:"2026-08-09T07:05:00.000Z",metrics:{sampleCount:1,minimumBpm:120,averageBpm:120,maximumBpm:120,samples:[{time:"2026-08-09T08:00:00.000Z",bpm:120}]}};
 assert.equal(health.parseHealthSyncBatch(batch([heart])).ok,false);
});
