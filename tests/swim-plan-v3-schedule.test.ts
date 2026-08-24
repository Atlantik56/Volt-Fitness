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

db.prepare("UPDATE profile SET program_start=?,swim_plan_started_at=?,training_plan_v3_started_at=? WHERE id=1").run("2026-07-21", "2026-08-10", "2026-09-16");

test("Plan v3 назначает Endurance Week 9 относительно среды старта: Д1/Д3/Д5", () => {
  const progress = getProgramProgress("endurance")!;
  const week9 = progress.workouts.filter((workout) => workout.weekIndex === 9);
  assert.deepEqual(week9.map((workout) => workout.calendar?.date), ["2026-09-16", "2026-09-18", "2026-09-20"]);
  assert.deepEqual(week9.map((workout) => workout.calendar?.weekday), [3, 5, 7]);
});

test("Главная Swim выбирает активную программу Endurance, а не первую Foundation", () => {
  const next = getNextSwimWorkout();
  assert.equal(next?.workout.id, "w9d1");
  assert.equal(next?.calendar?.date, "2026-09-16");
});

test("единый resolver открывает точную тренировку Endurance на Week 9", () => {
  const slot = resolveScheduledSwimWorkout("2026-09-18");
  assert.equal(slot?.kind, "workout");
  assert.equal((slot as any).programId, "endurance");
  assert.equal((slot as any).workoutId, "w9d3");
  assert.equal((slot as any).route, "/swim/workouts/endurance/w9d3");
});

test("Foundation остаётся ограничен Weeks 1–8 и не захватывает даты Plan v3", () => {
  const foundation = getProgramProgress("foundation")!;
  assert.ok(foundation.calendarDays.every((day) => day.date < "2026-09-16"));
});
