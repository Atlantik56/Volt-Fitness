import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-plan-v3-start-"));
const {db}=await import("@/lib/db.ts");
const {getActiveTrainingPlanV3Cycle,getTrainingPlanV3StartedAt,moscowIsoDate,restartTrainingPlanV3,startTrainingPlanV3}=await import("@/lib/training-plan-activation.ts");

test("миграция добавляет nullable дату старта нового плана",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=21").get());
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=25").get());
 assert.equal(getTrainingPlanV3StartedAt(),null);
});

test("серверная дата определяется в Europe/Moscow",()=>{
 assert.equal(moscowIsoDate(new Date("2026-08-24T20:59:59Z")),"2026-08-24");
 assert.equal(moscowIsoDate(new Date("2026-08-24T21:00:00Z")),"2026-08-25");
});

test("старт атомарный и идемпотентный: повтор не меняет дату и историю",()=>{
 const before=(db.prepare("SELECT COUNT(*) count FROM workout_logs").get() as {count:number}).count;
 db.prepare("INSERT INTO workout_logs(date,type,title,completed,rounds,details) VALUES(?,?,?,?,?,?)").run("2026-08-20","Силовая","История","[]",1,"[]");
 const first=startTrainingPlanV3(new Date("2026-08-24T12:00:00Z"))!;
 assert.equal(first.startedAt,"2026-08-24");
 assert.equal(first.alreadyStarted,false);
 assert.ok(first.cycleId>0);
 assert.deepEqual(startTrainingPlanV3(new Date("2026-08-30T12:00:00Z")),{startedAt:"2026-08-24",alreadyStarted:true,cycleId:first.cycleId});
 assert.equal((db.prepare("SELECT COUNT(*) count FROM workout_logs").get() as {count:number}).count,before+1);
});

test("restart блокируется активной тренировкой, затем создаёт новый цикл без потери истории",()=>{
 const oldCycle=getActiveTrainingPlanV3Cycle()!;
 const activeId=Number(db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES(?,?,?,?)").run("2026-08-31","active-plan","active",JSON.stringify({title:"Тренировка",type:"Силовая",rounds:1,exercises:[]})).lastInsertRowid);
 const blocked=restartTrainingPlanV3("2026-08-24",new Date("2026-09-01T09:00:00Z"));
 assert.equal(blocked.ok,false);
 assert.equal(blocked.status,409);
 db.prepare("UPDATE workout_drafts SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP WHERE id=?").run(activeId);

 const workoutId=Number(db.prepare("INSERT INTO workout_logs(date,type,title,completed,rounds,details) VALUES(?,?,?,?,?,?)").run("2026-08-30","Силовая","Старая тренировка","[]",1,"[]").lastInsertRowid);
 db.prepare("INSERT INTO strength_logs(date,exercise,weight,reps,workout_id) VALUES(?,?,?,?,?)").run("2026-08-30","Тренажёр",25,10,workoutId);
 db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot,workout_id) VALUES(?,?,?,?,?)").run("2026-08-30","completed-old","completed","{}",workoutId);
 db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES(?,?,?,?)").run("2026-09-02","planned-v3","planned",JSON.stringify({programIdentity:{programId:"volt-training",programVersion:3}}));
 db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES(?,?,?,?)").run("2026-09-02","planned-other","planned",JSON.stringify({programIdentity:{programId:"foundation",programVersion:2}}));
 db.prepare("INSERT INTO week_schedule_changes(date,action,assigned_source_day) VALUES('2026-08-23','rest',NULL),('2026-09-02','rest',NULL)").run();
 db.prepare("INSERT INTO schedule_overrides(original_date,scheduled_date,plan_title) VALUES('2026-08-22','2026-08-23','Старый'),('2026-09-02','2026-09-03','Будущий')").run();
 const workoutsBefore=(db.prepare("SELECT COUNT(*) count FROM workout_logs").get() as {count:number}).count;

 const result=restartTrainingPlanV3("2026-08-24",new Date("2026-09-01T09:00:00Z"));
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.startedAt,"2026-09-01");
 assert.notEqual(result.cycleId,oldCycle.id);
 assert.equal(getTrainingPlanV3StartedAt(),"2026-09-01");
 assert.equal((db.prepare("SELECT ended_at endedAt FROM training_plan_cycles WHERE id=?").get(oldCycle.id) as any).endedAt,"2026-08-31");
 assert.equal((db.prepare("SELECT restarted_from_cycle_id previous FROM training_plan_cycles WHERE id=?").get(result.cycleId) as any).previous,oldCycle.id);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM workout_logs").get() as any).count,workoutsBefore);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM strength_logs WHERE workout_id=?").get(workoutId) as any).count,1);
 assert.ok(db.prepare("SELECT 1 FROM workout_drafts WHERE plan_key='completed-old' AND status='completed'").get());
 assert.ok(db.prepare("SELECT 1 FROM workout_drafts WHERE plan_key='planned-v3' AND status='cancelled'").get());
 assert.ok(db.prepare("SELECT 1 FROM workout_drafts WHERE plan_key='planned-other' AND status='planned'").get());
 assert.ok(db.prepare("SELECT 1 FROM week_schedule_changes WHERE date='2026-08-23'").get());
 assert.equal(db.prepare("SELECT 1 FROM week_schedule_changes WHERE date='2026-09-02'").get(),undefined);
 assert.ok(db.prepare("SELECT 1 FROM schedule_overrides WHERE original_date='2026-08-22'").get());
 assert.equal(db.prepare("SELECT 1 FROM schedule_overrides WHERE original_date='2026-09-02'").get(),undefined);
 assert.equal(restartTrainingPlanV3("2026-09-01",new Date("2026-09-01T12:00:00Z")).ok,false);
});
