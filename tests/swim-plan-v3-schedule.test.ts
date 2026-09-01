import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-v3-schedule-"));
mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-16T12:00:00") });
test.after(() => mock.timers.reset());

const { db } = await import("@/lib/db.ts");
const { getNextSwimWorkout, getProgramProgress, resolveScheduledSwimWorkout } = await import("@/lib/swim/services.ts");
const {getProgram}=await import("@/lib/swim/program-engine.ts");
const {buildSwimSnapshot}=await import("@/lib/swim/workout-engine.ts");
const {planKey}=await import("@/lib/plan-key.ts");
const {getSwimHomeData}=await import("@/lib/swim-data.ts");

db.prepare("UPDATE profile SET program_start=?,swim_plan_started_at=?,training_plan_v3_started_at=? WHERE id=1").run("2026-07-21", "2026-08-10", "2026-09-16");
const oldCycleId=Number(db.prepare("INSERT INTO training_plan_cycles(program_id,program_version,started_at,ended_at) VALUES('volt-training',3,'2026-08-01','2026-09-15')").run().lastInsertRowid);
const cycleId=Number(db.prepare("INSERT INTO training_plan_cycles(program_id,program_version,started_at,restarted_from_cycle_id) VALUES('volt-training',3,'2026-09-16',?)").run(oldCycleId).lastInsertRowid);
const endurance=getProgram("endurance")!;
const firstWorkout=endurance.weeks[0].days.find(day=>day.workout)?.workout;
assert.ok(firstWorkout);
const oldPlanKey=planKey(buildSwimSnapshot(endurance,firstWorkout)!);
db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES('2026-09-10',?,'completed','{}')").run(oldPlanKey);

test("Plan v3 сохраняет Swim по Пн/Ср/Пт при старте цикла в среду", () => {
  const progress = getProgramProgress("endurance")!;
  assert.equal(progress.planCycleId,cycleId);
  const week9 = progress.workouts.filter((workout) => workout.weekIndex === 9);
  assert.deepEqual(week9.map((workout) => workout.calendar?.date??null), [null, "2026-09-16", "2026-09-18"]);
  assert.deepEqual(week9.map((workout) => workout.calendar?.weekday??null), [null, 3, 5]);
  assert.equal(progress.workouts.find((workout)=>workout.workout.id==="w16d5")?.calendar?.date,"2026-11-06");
});

test("restart общего плана не переносит completed Swim из прошлого цикла",()=>{
 const progress=getProgramProgress("endurance")!;
 const first=progress.workouts.find(workout=>workout.workout.id===firstWorkout.id)!;
 assert.equal(first.status,"not_started");
 assert.notEqual(first.planKey,oldPlanKey);
 assert.equal(buildSwimSnapshot(endurance,firstWorkout,cycleId)?.programIdentity?.cycleId,cycleId);
});

test("Главная Swim выбирает активную программу Endurance, а не первую Foundation", () => {
  const next = getNextSwimWorkout();
  assert.equal(next?.workout.id, "w9d3");
  assert.equal(next?.calendar?.date, "2026-09-16");
  assert.equal(getSwimHomeData().nextWorkout?.programId,"endurance");
  assert.equal(getSwimHomeData().nextWorkout?.workoutId,"w9d3");
});

test("единый resolver открывает точную тренировку Endurance на Week 9", () => {
  const slot = resolveScheduledSwimWorkout("2026-09-18");
  assert.equal(slot?.kind, "workout");
  assert.equal((slot as any).programId, "endurance");
  assert.equal((slot as any).workoutId, "w9d5");
  assert.equal((slot as any).route, "/swim/workouts/endurance/w9d5");
});

test("Foundation остаётся ограничен Weeks 1–8 и не захватывает даты Plan v3", () => {
  const foundation = getProgramProgress("foundation")!;
  assert.ok(foundation.calendarDays.every((day) => day.date < "2026-09-16"));
});
