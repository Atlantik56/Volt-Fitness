import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

mock.timers.enable({apis:["Date"],now:new Date("2026-09-04T12:00:00Z")});
test.after(()=>mock.timers.reset());
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-v4-shared-"));

const {db}=await import("@/lib/db.ts");
const {buildHomeWeek}=await import("@/app/personal-data.ts");
const {buildWeekSchedule,weekRangeContaining}=await import("@/app/week-schedule-model.ts");
const {applyAlternative,listWeekScheduleChanges}=await import("@/lib/week-schedule-service.ts");
const {resolveCyclingAssignment}=await import("@/app/cycling-model.ts");
const {getActiveSwimProgramProgress,resolveScheduledSwimWorkout}=await import("@/lib/swim/services.ts");
const {buildSwimSnapshot}=await import("@/lib/swim/workout-engine.ts");
const {getProgram}=await import("@/lib/swim/program-engine.ts");
const {buildPlannedSlots}=await import("@/lib/analytics-service.ts");

const cycles=[
 {id:1,programId:"volt-training",programVersion:3,startedAt:"2026-08-31",endedAt:"2026-09-02",restartedFromCycleId:null},
 {id:2,programId:"volt-training",programVersion:4,startedAt:"2026-09-03",endedAt:null,restartedFromCycleId:1},
];
db.prepare("UPDATE profile SET training_plan_v3_started_at=?,swim_plan_started_at=? WHERE id=1").run("2026-08-31","2026-08-10");
for(const cycle of cycles)db.prepare(`INSERT INTO training_plan_cycles(id,program_id,program_version,started_at,ended_at,restarted_from_cycle_id)
 VALUES(@id,@programId,@programVersion,@startedAt,@endedAt,@restartedFromCycleId)`).run(cycle);

const friday="2026-09-04";
const monday=weekRangeContaining(friday).mondayIso;
const homeWeek=()=>buildHomeWeek("2026-07-21",cycles,friday);
const changes=()=>listWeekScheduleChanges(monday,"2026-09-06");
const resolved=()=>buildWeekSchedule(homeWeek(),changes(),monday).find(day=>day.date===friday)!;

test("a Thursday v4 start preserves calendar weekdays across the v3/v4 boundary",()=>{
 const week=homeWeek();
 assert.equal(week[2].programIdentity?.programVersion,3,"Wednesday remains archived v3");
 assert.equal(week[3].id,"strength-v4-b","Thursday starts at the Thursday session, not Monday");
 assert.equal(week[4].id,"swim-v4-friday");
 assert.equal(week[5].id,"bike-v4-long");
});

test("Swim resolves the exact v4 workout and never gives it a v3 identity",()=>{
 const slot=resolveScheduledSwimWorkout(friday);
 assert.equal(slot?.kind,"workout");
 if(!slot||slot.kind!=="workout")return;
 const program=getProgram(slot.programId)!;
 const snapshot=buildSwimSnapshot(program,slot.workout,cycles[1])!;
 assert.deepEqual(snapshot.programIdentity,{programId:"volt-training",programVersion:4,weekIndex:17,sessionId:"swim-v4-friday",cycleId:2});
});

test("Friday becomes Bike only after the explicit alternative action on every projection",()=>{
 assert.equal(resolved().scheduled.discipline,"swim");
 const result=applyAlternative({date:friday,alternativeSessionId:"bike-v4-extra",alternativesForDate:homeWeek()[4].alternatives??[],reasonCode:"schedule",todayIso:friday});
 assert.equal(result.ok,true);
 const day=resolved();
 assert.equal(day.original.discipline,"swim");
 assert.equal(day.scheduled.discipline,"bike");
 assert.equal(day.scheduledFor,friday);
 assert.equal(day.reasonCode,"schedule");
 assert.ok(day.changeId);
 assert.equal(resolveScheduledSwimWorkout(friday),null,"Swim sees the same replacement");

 const cycling=resolveCyclingAssignment({programStart:"2026-07-21",trainingPlanCycles:cycles,today:friday,selectedDate:friday,weekScheduleChanges:changes()});
 assert.equal(cycling?.session.id,"bike-v4-extra");
 assert.equal(cycling?.date,friday);
 assert.equal(cycling?.changeReasonCode,"schedule");

 const analytics=buildPlannedSlots({profile:{programStart:"2026-07-21"},from:friday,to:friday,weekChanges:changes(),scheduleOverrides:[],planCycles:cycles});
 assert.deepEqual(analytics.map(slot=>({date:slot.date,sport:slot.sport,title:slot.title})),[{date:friday,sport:"cycling",title:"Вело — третий заезд"}]);
});

test("the Swim home keeps the active cycle program on a non-Swim or replaced day",()=>{
 const progress=getActiveSwimProgramProgress();
 assert.equal(progress?.program.id,"endurance");
 assert.equal(progress?.planCycleId,2);
 assert.equal(progress?.nextWorkout?.calendar?.date,"2026-09-07");
 assert.equal(progress?.nextWorkout?.workout.id,"w10d1");
});
