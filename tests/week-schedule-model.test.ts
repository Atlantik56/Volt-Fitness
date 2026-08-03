import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { buildHomeWeek } from "../app/personal-data.ts";
import {
  buildWeekSchedule, resolvePlanForDate, weekRangeContaining, isoWeekdayOf, changesByDateMap,
  type WeekScheduleChange,
} from "../app/week-schedule-model.ts";

function withNow(iso: string, fn: () => void) {
  mock.timers.enable({ apis: ["Date"], now: new Date(`${iso}T12:00:00`) });
  try { fn() } finally { mock.timers.reset() }
}

const homeWeek = buildHomeWeek(); // неделя 1: без бассейна (Пн/Ср/Пт — гантели, Вт/Сб — ходьба, Чт — восстановление, Вс — отдых)

function poolHomeWeek() {
  let plan: ReturnType<typeof buildHomeWeek> = [] as any;
  withNow("2026-06-01", () => { plan = buildHomeWeek("2026-05-01") }); // программа стартовала месяц назад -> бассейн активен
  return plan;
}

const change = (over: Partial<WeekScheduleChange> & Pick<WeekScheduleChange, "date" | "action">): WeekScheduleChange => ({
  id: 1, assignedSourceDay: null, swapWithDate: null, reasonCode: "", createdAt: "", updatedAt: "", ...over,
});

test("weekRangeContaining: понедельник..воскресенье для любой даты недели", () => {
  assert.deepEqual(weekRangeContaining("2026-06-01"), { mondayIso: "2026-06-01", sundayIso: "2026-06-07" });
  assert.deepEqual(weekRangeContaining("2026-06-04"), { mondayIso: "2026-06-01", sundayIso: "2026-06-07" });
  assert.deepEqual(weekRangeContaining("2026-06-07"), { mondayIso: "2026-06-01", sundayIso: "2026-06-07" });
});

test("isoWeekdayOf: понедельник=1 .. воскресенье=7", () => {
  assert.equal(isoWeekdayOf("2026-06-01"), 1);
  assert.equal(isoWeekdayOf("2026-06-07"), 7);
});

test("неделя без изменений полностью совпадает с исходным планом", () => {
  const week = buildWeekSchedule(homeWeek, [], "2026-06-01");
  assert.equal(week.length, 7);
  for (const day of week) {
    assert.equal(day.changed, false);
    assert.deepEqual(day.scheduled, day.original);
    assert.equal(day.action, null);
    assert.equal(day.reasonCode, "");
  }
  assert.equal(week[0].original.title, "Гантели по кругу");
  assert.equal(week[6].original.type, "Отдых");
});

test("замена: гантели в понедельник заменяются бассейном (вторник в фазе бассейна)", () => {
  const pool = poolHomeWeek();
  const changes = [change({ date: "2026-06-01", action: "replace", assignedSourceDay: 2 })]; // день 2 = Бассейн
  const resolved = resolvePlanForDate("2026-06-01", pool, changesByDateMap(changes));
  assert.equal(resolved.changed, true);
  assert.equal(resolved.original.title, "Гантели по кругу");
  assert.equal(resolved.scheduled.title, "Бассейн");
  // День/подпись дня остаются календарными (понедельник), а не "унаследованными" от вторника.
  assert.equal(resolved.scheduled.day, 1);
  assert.equal(resolved.scheduled.d, "Понедельник");
});

test("обмен: два дня меняются местами симметрично", () => {
  const changes = [
    change({ date: "2026-06-01", action: "swap", assignedSourceDay: 3, swapWithDate: "2026-06-03" }),
    change({ date: "2026-06-03", action: "swap", assignedSourceDay: 1, swapWithDate: "2026-06-01" }),
  ];
  const byDate = changesByDateMap(changes);
  const monday = resolvePlanForDate("2026-06-01", homeWeek, byDate);
  const wednesday = resolvePlanForDate("2026-06-03", homeWeek, byDate);
  assert.equal(monday.changed, true);
  assert.equal(wednesday.changed, true);
  // Оба дня — "Гантели по кругу" в этой программе, поэтому обмен между ними
  // визуально не меняет название, но остаётся зафиксированным изменением.
  assert.equal(monday.scheduled.title, "Гантели по кругу");
  assert.equal(monday.action, "swap");
  assert.equal(monday.swapWithDate, "2026-06-03");
});

test("перенос на свободный день: понедельник -> отдых, воскресенье -> тренировка понедельника", () => {
  const changes = [
    change({ date: "2026-06-01", action: "swap", assignedSourceDay: 7, swapWithDate: "2026-06-07" }),
    change({ date: "2026-06-07", action: "swap", assignedSourceDay: 1, swapWithDate: "2026-06-01" }),
  ];
  const byDate = changesByDateMap(changes);
  const monday = resolvePlanForDate("2026-06-01", homeWeek, byDate);
  const sunday = resolvePlanForDate("2026-06-07", homeWeek, byDate);
  assert.equal(monday.scheduled.type, "Отдых");
  assert.equal(sunday.scheduled.title, "Гантели по кругу");
});

test("отдых вместо тренировки", () => {
  const changes = [change({ date: "2026-06-01", action: "rest" })];
  const resolved = resolvePlanForDate("2026-06-01", homeWeek, changesByDateMap(changes));
  assert.equal(resolved.changed, true);
  assert.equal(resolved.scheduled.type, "Отдых");
  assert.equal(resolved.scheduled.title, "Полный отдых");
  assert.equal(resolved.scheduled.d, "Понедельник"); // подпись дня — календарная, не "Воскресенье" от шаблона
});

test("изменения не переходят на следующую неделю: buildWeekSchedule читает только даты своей недели", () => {
  const changes = [change({ date: "2026-06-08", action: "rest" })]; // следующий понедельник
  const week = buildWeekSchedule(homeWeek, changes, "2026-06-01");
  assert.ok(week.every(d => !d.changed));
});
