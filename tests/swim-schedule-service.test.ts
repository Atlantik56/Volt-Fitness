import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-schedule-"));
const { db } = await import("@/lib/db.ts");
const { getProgramProgress, getNextSwimWorkout } = await import("@/lib/swim/services.ts");
const { getSwimHomeData } = await import("@/lib/swim-data.ts");
const { localIso } = await import("@/app/week-schedule-model.ts");

// Давний program_start гарантирует Plan v2 (Week 4+) независимо от даты запуска.
db.prepare("UPDATE profile SET program_start=? WHERE id=1").run("2020-01-06"); // понедельник
db.prepare("UPDATE profile SET swim_plan_started_at=? WHERE id=1").run(localIso(new Date()));

test("расписание Foundation использует единые Swim-слоты Plan v2: Пн/Ср/Пт", () => {
  const progress = getProgramProgress("foundation")!;
  assert.ok(progress);
  assert.equal(progress.startedAt, localIso(new Date()));
  assert.ok(progress.calendarDays.length > 0, "calendarDays должен быть заполнен");
  const swimWorkouts = progress.workouts.filter((w) => w.calendar);
  assert.ok(swimWorkouts.length > 0);
  for (const w of swimWorkouts) {
    assert.ok([1, 3, 5].includes(w.calendar!.weekday), `тренировка ${w.workout.id} назначена на weekday=${w.calendar!.weekday}, ожидались Пн/Ср/Пт`);
  }
  // calendarDays использует тот же общий недельный источник.
  const swimDays = progress.calendarDays.filter((d) => d.isSwimSlot);
  assert.ok(swimDays.length > 0);
  for (const d of swimDays) assert.ok([1, 3, 5].includes(d.weekday));
});

test("Главная и План возвращают одну и ту же следующую тренировку и дату", () => {
  const progress = getProgramProgress("foundation")!;
  const fromPlan = progress.nextWorkout!;
  const fromHero = getNextSwimWorkout()!;
  const fromHome = getSwimHomeData().nextWorkout!;
  assert.equal(fromHero.workout.id, fromPlan.workout.id);
  assert.equal(fromHero.calendar?.date, fromPlan.calendar?.date);
  assert.equal(fromHome.workoutId, fromPlan.workout.id);
  assert.equal(fromHome.calendarDate, fromPlan.calendar?.date ?? null);
  assert.equal(fromHome.weekday, fromPlan.calendar?.weekday ?? null);
  assert.equal(fromHome.isToday, fromPlan.calendar?.isToday ?? false);
});
