import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Пятница недели 17 Плана 4.0 — гибкий слот.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-02T12:00:00") });
test.after(() => mock.timers.reset());

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-flex-slot-"));
const { db } = await import("@/lib/db.ts");
const { applyAlternative, listWeekScheduleChanges } = await import("@/lib/week-schedule-service.ts");
const { buildProgramWeek } = await import("@/app/personal-data.ts");
const { resolvePlanForDate, changesByDateMap, weekRangeContaining } = await import("@/app/week-schedule-model.ts");

const week = buildProgramWeek(17);
const friday = week[4];
const { mondayIso, sundayIso } = weekRangeContaining("2026-09-02");
const fridayDate = "2026-09-04";
const changes = () => changesByDateMap(listWeekScheduleChanges(mondayIso, sundayIso));
const resolveFriday = () => resolvePlanForDate(fridayDate, week, changes());

test("the Friday slot declares a cycling alternative", () => {
  assert.equal(friday.discipline, "swim");
  assert.equal(friday.required, true, "Swim не исчезает из плана без явного выбора");
  assert.equal(friday.optional, false);
  assert.equal(friday.alternatives?.length, 1);
  assert.equal(friday.alternatives?.[0].discipline, "bike");
});

test("without a choice the slot stays a swim", () => {
  const resolved = resolveFriday();
  assert.equal(resolved.scheduled.discipline, "swim");
  assert.equal(resolved.changed, false);
});

test("choosing the alternative swaps the discipline for that date only", () => {
  const result = applyAlternative({
    date: fridayDate, alternativeSessionId: "bike-v4-extra",
    alternativesForDate: friday.alternatives ?? [], todayIso: "2026-09-02",
  });
  assert.equal(result.ok, true);

  const resolved = resolveFriday();
  assert.equal(resolved.scheduled.discipline, "bike");
  assert.match(resolved.scheduled.title, /третий заезд/);
  assert.ok(resolved.scheduled.exercises.length > 0, "подставлено содержимое тренировки, а не пустая оболочка");
  assert.equal(resolved.changed, true);

  // Каноническая программа не тронута.
  assert.equal(buildProgramWeek(17)[4].discipline, "swim");
  // Другие дни недели не задеты.
  assert.equal(resolvePlanForDate("2026-09-02", week, changes()).scheduled.discipline, "bike", "среда осталась велоинтервалами");
  assert.equal(resolvePlanForDate("2026-09-05", week, changes()).scheduled.discipline, "bike", "суббота осталась длинной базой");
});

test("passing null returns the slot to its original discipline", () => {
  const result = applyAlternative({
    date: fridayDate, alternativeSessionId: null,
    alternativesForDate: friday.alternatives ?? [], todayIso: "2026-09-02",
  });
  assert.equal(result.ok, true);
  assert.equal(resolveFriday().scheduled.discipline, "swim");
  assert.equal((db.prepare("SELECT COUNT(*) c FROM week_schedule_changes WHERE date=?").get(fridayDate) as any).c, 0);
});

test("an unknown alternative is refused instead of silently stored", () => {
  const result = applyAlternative({
    date: fridayDate, alternativeSessionId: "bike-does-not-exist",
    alternativesForDate: friday.alternatives ?? [], todayIso: "2026-09-02",
  }) as any;
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("a day without alternatives cannot be switched", () => {
  const result = applyAlternative({
    date: "2026-09-05", alternativeSessionId: "bike-v4-extra",
    alternativesForDate: week[5].alternatives ?? [], todayIso: "2026-09-02",
  }) as any;
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});
