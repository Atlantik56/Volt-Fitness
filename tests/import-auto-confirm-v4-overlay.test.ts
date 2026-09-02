import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

mock.timers.enable({apis:["Date"],now:new Date("2026-09-10T12:00:00Z")});
test.after(()=>mock.timers.reset());
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-auto-overlay-"));

const {db}=await import("@/lib/db.ts");
const {applyAlternative}=await import("@/lib/week-schedule-service.ts");
const {buildHomeWeek}=await import("@/app/personal-data.ts");
const {autoConfirmImport,previewImportAutoConfirm}=await import("@/lib/import-auto-confirm.ts");
const {buildSwimSnapshot}=await import("@/lib/swim/workout-engine.ts");
const {getProgram}=await import("@/lib/swim/program-engine.ts");
const {planKey}=await import("@/lib/plan-key.ts");

const cycle={id:1,programId:"volt-training",programVersion:4,startedAt:"2026-08-31",endedAt:null,restartedFromCycleId:null};
db.prepare("INSERT INTO training_plan_cycles(id,program_id,program_version,started_at) VALUES(1,'volt-training',4,'2026-08-31')").run();
let seq=0;
function addImport(date:string,type:string,duration=3000){
 seq++;
 return Number(db.prepare(`INSERT INTO workout_imports(source,external_id,fingerprint,started_at,duration_seconds,activity_type,metadata)
  VALUES('garmin_fit',?,?,?,?,?,?)`).run(`overlay-${seq}`,String(seq).repeat(64),`${date}T08:00:00Z`,duration,type,JSON.stringify({localDate:date,distanceMeters:1500})).lastInsertRowid);
}

test("auto-confirm follows the explicitly selected Friday Bike alternative",()=>{
 const friday="2026-09-11";
 const canonical=buildHomeWeek("2026-07-21",[cycle],friday)[4];
 assert.equal(canonical.discipline,"swim");
 const changed=applyAlternative({date:friday,alternativeSessionId:"bike-v4-extra",alternativesForDate:canonical.alternatives??[],reasonCode:"schedule",todayIso:"2026-09-10"});
 assert.equal(changed.ok,true);

 const importId=addImport(friday,"bike",2400);
 const preview=previewImportAutoConfirm(importId);
 assert.equal(preview.eligible,true,preview.reason??undefined);
 assert.equal(preview.programVersion,4);
 assert.equal(preview.cycleId,1);
 assert.equal(preview.sessionId,"bike-v4-extra");
 assert.equal(preview.origin,"scheduled");
 assert.equal(preview.scheduledFor,friday);
 assert.equal(preview.changeReasonCode,"schedule");
 const result=autoConfirmImport(importId);
 assert.equal(result.confirmed,true,"reason" in result?result.reason:undefined);
 const snapshot=JSON.parse((db.prepare("SELECT snapshot FROM workout_drafts WHERE id=?").get((result as any).draftId) as any).snapshot);
 assert.equal(snapshot.programIdentity.programVersion,4);
 assert.equal(snapshot.programIdentity.cycleId,1);
 assert.equal(snapshot.programIdentity.sessionId,"bike-v4-extra");
 assert.equal(snapshot.scheduledFor,friday);
 assert.equal(snapshot.changeReasonCode,"schedule");

 const swim=autoConfirmImport(addImport(friday,"swim",3000));
 assert.equal(swim.confirmed,false);
 assert.match((swim as any).reason,/нет тренировки дисциплины/);
});

test("an exact Swim slot that is already pinned elsewhere is unresolved and never auto-confirmed",()=>{
 const program=getProgram("endurance")!;
 const workout=program.weeks.find(week=>week.weekIndex===10)!.days.find(day=>day.workout?.id==="w10d1")!.workout!;
 const snapshot=buildSwimSnapshot(program,workout,cycle)!;
 const key=planKey(snapshot);
 const workoutId=Number(db.prepare("INSERT INTO workout_logs(date,type,title,duration_seconds) VALUES('2026-09-06','Плавание',?,2400)").run(snapshot.title).lastInsertRowid);
 db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot,workout_id) VALUES('2026-09-06',?,'completed',?,?)").run(key,JSON.stringify(snapshot),workoutId);

 const importId=addImport("2026-09-07","swim",3000);
 const result=autoConfirmImport(importId);
 assert.equal(result.confirmed,false);
 assert.match((result as any).reason,/не разрешён однозначно/);
 assert.equal((db.prepare("SELECT draft_id draftId FROM workout_imports WHERE id=?").get(importId) as any).draftId,null);
});

test("a failure after draft creation rolls back draft, link and workout atomically",()=>{
 const saturday="2026-09-12";
 const importId=addImport(saturday,"bike",3600);
 db.exec(`CREATE TRIGGER force_auto_confirm_failure BEFORE INSERT ON workout_logs
  BEGIN SELECT RAISE(ABORT,'forced auto-confirm failure');END`);
 assert.throws(()=>autoConfirmImport(importId),/forced auto-confirm failure/);
 db.exec("DROP TRIGGER force_auto_confirm_failure");
 assert.equal((db.prepare("SELECT draft_id draftId FROM workout_imports WHERE id=?").get(importId) as any).draftId,null);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM workout_drafts WHERE date=?").get(saturday) as any).count,0);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM workout_logs WHERE date=?").get(saturday) as any).count,0);
});
