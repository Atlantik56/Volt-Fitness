import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-schedule-"));
const { db } = await import("@/lib/db.ts");
const { getProgramProgress, getNextSwimWorkout } = await import("@/lib/swim/services.ts");
const { getSwimHomeData } = await import("@/lib/swim-data.ts");

// program_start достаточно в прошлом, чтобы фаза бассейна (currentProgramWeek
// > 1, см. app/personal-data.ts) точно наступила независимо от того, когда
// реально запускаются тесты.
db.prepare("UPDATE profile SET program_start=? WHERE id=1").run("2020-01-06"); // понедельник

test("расписание Foundation в /api/swim/programs назначает плавание на реальные Вт/Чт основного плана, а не Пн/Ср", () => {
  const progress = getProgramProgress("foundation")!;
  assert.ok(progress);
  assert.ok(progress.calendarDays.length > 0, "calendarDays должен быть заполнен");
  const swimWorkouts = progress.workouts.filter((w) => w.calendar);
  assert.ok(swimWorkouts.length > 0);
  for (const w of swimWorkouts) {
    assert.ok([2, 4].includes(w.calendar!.weekday), `тренировка ${w.workout.id} назначена на weekday=${w.calendar!.weekday}, ожидались 2 (Вт) или 4 (Чт)`);
  }
  // calendarDays тоже должен считать Swim-слотами именно Вт/Чт этой фазы.
  const swimDays = progress.calendarDays.filter((d) => d.isSwimSlot);
  assert.ok(swimDays.length > 0);
  for (const d of swimDays) assert.ok([2, 4].includes(d.weekday));
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
