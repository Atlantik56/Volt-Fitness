import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-v4-activation-"));
const {db}=await import("@/lib/db.ts");
const {ACTIVE_PROGRAM_VERSION,PLAN_V3_PROGRAM_VERSION,PLAN_V4_PROGRAM_VERSION}=await import("@/lib/training-program/definitions.ts");
const {getActiveTrainingPlanCycle,getTrainingPlanCycles,startTrainingPlan}=await import("@/lib/training-plan-activation.ts");
const {loadAiCoachContextData}=await import("@/lib/ai-context-data.ts");

const historicalPlanKey="b1049f7c1dc5447369299e1acc6e5adc";
const historicalIdentity={programId:"volt-training",programVersion:3,weekIndex:9,sessionId:"swim-v3-aerobic",cycleId:1};
const historicalSnapshot=JSON.stringify({title:"VOLT Swim · Aerobic",type:"Плавание v1",programIdentity:historicalIdentity,exercises:[]});

db.prepare("UPDATE profile SET training_plan_v3_started_at=?,swim_plan_started_at=? WHERE id=1").run("2026-09-02","2026-08-10");
db.prepare(`INSERT INTO training_plan_cycles(id,program_id,program_version,started_at)
 VALUES(1,'volt-training',3,'2026-09-02')`).run();
db.prepare("INSERT INTO workout_drafts(id,date,plan_key,status,snapshot) VALUES(17,'2026-09-02',?,'completed',?)").run(historicalPlanKey,historicalSnapshot);

test("Plan 4.0 is the active code version while Plan 3.0 remains registered history",()=>{
 assert.equal(ACTIVE_PROGRAM_VERSION,PLAN_V4_PROGRAM_VERSION);
 assert.equal(PLAN_V3_PROGRAM_VERSION,3);
});

test("activation closes the used v3 cycle on 2026-09-02 and starts a separate v4 cycle next day",()=>{
 const result=startTrainingPlan(PLAN_V4_PROGRAM_VERSION,new Date("2026-09-02T12:00:00Z"))!;
 assert.equal(result.alreadyStarted,false);
 assert.equal(result.archivedCycleId,1);
 assert.equal(result.archivedCycleEndedAt,"2026-09-02");
 assert.equal(result.startedAt,"2026-09-03");
 assert.equal(result.programVersion,4);

 const cycles=getTrainingPlanCycles();
 assert.deepEqual(cycles.map(cycle=>({id:cycle.id,version:cycle.programVersion,startedAt:cycle.startedAt,endedAt:cycle.endedAt})),[
  {id:1,version:3,startedAt:"2026-09-02",endedAt:"2026-09-02"},
  {id:result.cycleId,version:4,startedAt:"2026-09-03",endedAt:null},
 ]);
 assert.equal(getActiveTrainingPlanCycle()?.programVersion,4);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM training_plan_cycles WHERE program_id='volt-training' AND ended_at IS NULL").get() as any).count,1);
});

test("v3 plan_key, identity and compatibility dates remain byte-for-byte unchanged",()=>{
 const draft=db.prepare("SELECT date,plan_key planKey,snapshot FROM workout_drafts WHERE id=17").get() as any;
 assert.equal(draft.date,"2026-09-02");
 assert.equal(draft.planKey,historicalPlanKey);
 assert.equal(draft.snapshot,historicalSnapshot);
 assert.deepEqual(JSON.parse(draft.snapshot).programIdentity,historicalIdentity);
 const profile=db.prepare("SELECT training_plan_v3_started_at v3,swim_plan_started_at swim FROM profile WHERE id=1").get();
 assert.deepEqual(profile,{v3:"2026-09-02",swim:"2026-08-10"});
});

test("Coach resolves the cycle covering the requested boundary date",()=>{
 assert.equal(loadAiCoachContextData(db,{date:"2026-09-02",historyDays:0}).profile?.activeTrainingPlanCycle?.programVersion,3);
 assert.equal(loadAiCoachContextData(db,{date:"2026-09-03",historyDays:0}).profile?.activeTrainingPlanCycle?.programVersion,4);
});

test("repeating activation is idempotent and does not create another cycle",()=>{
 const before=(db.prepare("SELECT COUNT(*) count FROM training_plan_cycles").get() as any).count;
 const active=getActiveTrainingPlanCycle()!;
 const result=startTrainingPlan(PLAN_V4_PROGRAM_VERSION,new Date("2026-09-05T12:00:00Z"))!;
 assert.deepEqual(result,{startedAt:active.startedAt,alreadyStarted:true,cycleId:active.id,programId:"volt-training",programVersion:4,archivedCycleId:null,archivedCycleEndedAt:null});
 assert.equal((db.prepare("SELECT COUNT(*) count FROM training_plan_cycles").get() as any).count,before);
});
