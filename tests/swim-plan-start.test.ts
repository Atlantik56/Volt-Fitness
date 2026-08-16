import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Среда Week 4 (относительно program_start=2026-07-21): фиксируем "сегодня",
// чтобы currentWeekIndex не зависел от реальной календарной даты запуска тестов.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-12T12:00:00") });
test.after(() => mock.timers.reset());

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-plan-start-"));
const { db } = await import("@/lib/db.ts");
const { getProgramProgress, getSwimPlanStartedAt, startSwimPlan, swimWeekIndexForDate } = await import("@/lib/swim/services.ts");
const { getSwimAnalytics, getSwimHistory, getSwimRecords } = await import("@/lib/swim-data.ts");

db.prepare("UPDATE profile SET program_start=? WHERE id=1").run("2026-07-21");

test("новая миграция оставляет Swim-план неначатым и не меняет общий старт VOLT", () => {
  const profile = db.prepare("SELECT program_start programStart,swim_plan_started_at swimPlanStartedAt FROM profile WHERE id=1").get() as any;
  assert.equal(profile.programStart, "2026-07-21");
  assert.equal(profile.swimPlanStartedAt, null);
  assert.equal(getSwimPlanStartedAt(), null);
  const progress = getProgramProgress("foundation")!;
  assert.equal(progress.startedAt, null);
  assert.equal(progress.calendarDays.length, 0);
  assert.equal(progress.workouts.every((workout) => workout.calendar === null), true);
});

test("Plan v2 можно заранее активировать без отдельного restart от Week 1", () => {
  try {
    assert.deepEqual(startSwimPlan("2026-08-20"), { ok: true, startedAt: "2026-08-20" });
    assert.equal(getSwimPlanStartedAt(), "2026-08-20");
    const progress = getProgramProgress("foundation")!;
    assert.equal(progress.calendarDays[0]?.date, "2026-07-20");
    assert.equal(progress.currentWeekIndex, 4);
  } finally {
    // Гарантируем сброс тестового состояния даже при падении assert выше —
    // иначе следующие тесты каскадно падают на "План плавания уже начат".
    db.prepare("UPDATE profile SET swim_plan_started_at=NULL WHERE id=1").run();
  }
});

test("активация 7 августа включает effective Week 4 без очистки истории", () => {
  db.prepare("INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds) VALUES (?,?,?,?,?)")
    .run("2026-08-01", "Плавание", "Существующий заплыв", 500, 900);
  const historyBefore = getSwimHistory();
  const analyticsBefore = getSwimAnalytics("30d", "2026-08-07");
  const recordsBefore = getSwimRecords("2026-08-07");
  const strengthCountBefore = (db.prepare("SELECT COUNT(*) count FROM workout_logs WHERE type='Силовая'").get() as any).count;

  assert.deepEqual(startSwimPlan("2026-08-07"), { ok: true, startedAt: "2026-08-07" });
  const progress = getProgramProgress("foundation")!;
  assert.equal(progress.startedAt, "2026-08-07");
  assert.equal(progress.currentWeekIndex, 4);
  assert.equal(progress.calendarDays[0]?.date, "2026-07-20");
  assert.equal(progress.calendarDays[6]?.date, "2026-07-26");
  assert.equal(progress.nextWorkout === null || progress.nextWorkout.weekIndex >= 4, true);
  assert.equal(getSwimPlanStartedAt(), "2026-08-07");

  assert.deepEqual(getSwimHistory(), historyBefore);
  assert.deepEqual(getSwimAnalytics("30d", "2026-08-07"), analyticsBefore);
  assert.deepEqual(getSwimRecords("2026-08-07"), recordsBefore);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM workout_logs WHERE type='Силовая'").get() as any).count, strengthCountBefore);
  assert.equal((db.prepare("SELECT program_start programStart FROM profile WHERE id=1").get() as any).programStart, "2026-07-21");
});

test("повторный старт и некорректная дата отклоняются без изменения точки отсчёта", () => {
  assert.deepEqual(startSwimPlan("2026-02-30"), { ok: false, error: "Некорректная дата старта", status: 400 });
  assert.deepEqual(startSwimPlan("2026-08-20"), { ok: false, error: "План плавания уже начат", status: 409, startedAt: "2026-08-07" });
  assert.equal(getSwimPlanStartedAt(), "2026-08-07");
});

test("повторное чтение сохраняет единый календарь; legacy helper остаётся совместимым", () => {
  const first = getProgramProgress("foundation")!;
  const reopened = getProgramProgress("foundation")!;
  assert.deepEqual(reopened.calendarDays, first.calendarDays);
  assert.equal(reopened.startedAt, first.startedAt);

  assert.equal(swimWeekIndexForDate("2026-08-07", "2026-08-07", 6), 1);
  assert.equal(swimWeekIndexForDate("2026-08-07", "2026-08-13", 6), 1);
  assert.equal(swimWeekIndexForDate("2026-08-07", "2026-08-14", 6), 2);
  assert.equal(swimWeekIndexForDate("2026-08-07", "2026-09-30", 6), 6);
  assert.equal(reopened.calendarDays[7]?.date, "2026-07-27");
});
