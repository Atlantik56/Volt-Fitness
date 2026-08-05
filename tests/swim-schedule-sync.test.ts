import assert from "node:assert/strict";
import test from "node:test";
import { assignSwimCalendar, isSwimSlot, type SwimScheduleWorkoutInput } from "../lib/swim/schedule-sync.ts";
import { changesByDateMap, type HomeWeekDay, type WeekScheduleChange } from "../app/week-schedule-model.ts";

// Фикстура повторяет реальную форму buildHomeWeek(programStart) в "бассейновой"
// фазе (см. app/personal-data.ts): Пн/Ср/Пт — силовая, Вт/Чт — бассейн,
// Сб — кардио, Вс — отдых. Строится вручную (не через buildHomeWeek), чтобы
// тесты не зависели от системных часов (buildHomeWeek сам вычисляет "today").
const day = (dayIndex: number, d: string, type: string, title: string): HomeWeekDay => ({
  day: dayIndex, d, type, title, time: "", rounds: 1, image: "", exercises: [],
});
const POOL_WEEK: HomeWeekDay[] = [
  day(1, "Понедельник", "Силовая", "Гантели по кругу"),
  day(2, "Вторник", "Кардио", "Бассейн"),
  day(3, "Среда", "Силовая", "Гантели по кругу"),
  day(4, "Четверг", "Кардио", "Бассейн"),
  day(5, "Пятница", "Силовая", "Гантели по кругу"),
  day(6, "Суббота", "Кардио", "Ходьба или велосипед"),
  day(7, "Воскресенье", "Отдых", "Полный отдых"),
];

function noChanges(): Map<string, WeekScheduleChange> {
  return new Map();
}
function change(partial: Partial<WeekScheduleChange> & { date: string; action: WeekScheduleChange["action"] }): WeekScheduleChange {
  return { id: 1, assignedSourceDay: null, swapWithDate: null, reasonCode: "", createdAt: "", updatedAt: "", ...partial };
}
function pending(...ids: string[]): SwimScheduleWorkoutInput[] {
  return ids.map((workoutId) => ({ workoutId, status: "not_started" as const, pinnedDate: null }));
}

test("isSwimSlot: распознаёт только Кардио/Бассейн из основного плана", () => {
  assert.equal(isSwimSlot({ type: "Кардио", title: "Бассейн" }), true);
  assert.equal(isSwimSlot({ type: "Кардио", title: "Ходьба или велосипед" }), false);
  assert.equal(isSwimSlot({ type: "Силовая", title: "Гантели по кругу" }), false);
  assert.equal(isSwimSlot({ type: "Отдых", title: "Полный отдых" }), false);
});

test("базовое расписание назначает Swim на реальные дни основного плана (Вт/Чт), а не Пн/Ср", () => {
  // Понедельник 2026-07-20 — начало недели.
  const result = assignSwimCalendar({ workouts: pending("w1", "w2"), homeWeek: POOL_WEEK, changesByDate: noChanges(), todayIso: "2026-07-20" });
  assert.equal(result.get("w1")?.date, "2026-07-21"); // вторник
  assert.equal(result.get("w1")?.weekday, 2);
  assert.equal(result.get("w2")?.date, "2026-07-23"); // четверг
  assert.equal(result.get("w2")?.weekday, 4);
  // ни одна тренировка не попала на понедельник/среду
  for (const slot of result.values()) {
    assert.notEqual(slot.weekday, 1);
    assert.notEqual(slot.weekday, 3);
  }
});

test("текущая неделя начинается с понедельника: первый спроецированный слот не раньше сегодняшнего дня", () => {
  const result = assignSwimCalendar({ workouts: pending("w1"), homeWeek: POOL_WEEK, changesByDate: noChanges(), todayIso: "2026-07-23" }); // четверг
  assert.equal(result.get("w1")?.date, "2026-07-23");
});

test("перенос Swim на свободный день (замена) отражается в назначении", () => {
  // Пятница получает содержимое вторника (assignedSourceDay=2) — вторник и четверг остаются бассейном,
  // но пятница тоже становится Swim-слотом.
  const changes = changesByDateMap([change({ date: "2026-07-24", action: "replace", assignedSourceDay: 2 })]);
  const result = assignSwimCalendar({ workouts: pending("w1", "w2", "w3"), homeWeek: POOL_WEEK, changesByDate: changes, todayIso: "2026-07-20" });
  assert.deepEqual(
    [result.get("w1")?.date, result.get("w2")?.date, result.get("w3")?.date],
    ["2026-07-21", "2026-07-23", "2026-07-24"],
  );
  assert.equal(result.get("w3")?.origin, "projected");
  assert.equal(result.get("w3")?.scheduleChangeId, 1);
});

test("обмен двух дней (Пн ↔ Вт) двигает Swim-слот на понедельник — тот же результат для обеих поверхностей", () => {
  const monday = change({ id: 10, date: "2026-07-20", action: "swap", assignedSourceDay: 2, swapWithDate: "2026-07-21" });
  const tuesday = change({ id: 11, date: "2026-07-21", action: "swap", assignedSourceDay: 1, swapWithDate: "2026-07-20" });
  const changes = changesByDateMap([monday, tuesday]);
  const result = assignSwimCalendar({ workouts: pending("w1", "w2"), homeWeek: POOL_WEEK, changesByDate: changes, todayIso: "2026-07-20" });
  assert.equal(result.get("w1")?.date, "2026-07-20"); // теперь плавание в понедельник
  assert.equal(result.get("w1")?.weekday, 1);
  assert.equal(result.get("w2")?.date, "2026-07-23"); // четверг без изменений
});

test("замена силовой тренировки на Swim создаёт новый Swim-слот", () => {
  const changes = changesByDateMap([change({ date: "2026-07-20", action: "replace", assignedSourceDay: 2 })]); // Пн получает Бассейн
  const resolvedMonday = isSwimSlot({ type: "Кардио", title: "Бассейн" });
  assert.equal(resolvedMonday, true);
  const result = assignSwimCalendar({ workouts: pending("w1"), homeWeek: POOL_WEEK, changesByDate: changes, todayIso: "2026-07-20" });
  assert.equal(result.get("w1")?.date, "2026-07-20");
});

test("замена Swim на другую активность удаляет Swim-слот на этой дате", () => {
  const changes = changesByDateMap([change({ date: "2026-07-21", action: "replace", assignedSourceDay: 1 })]); // Вт получает Силовую
  const result = assignSwimCalendar({ workouts: pending("w1", "w2"), homeWeek: POOL_WEEK, changesByDate: changes, todayIso: "2026-07-20" });
  // Вторник больше не Swim — первая тренировка уезжает на четверг, вторая — на следующий вторник.
  assert.equal(result.get("w1")?.date, "2026-07-23");
  assert.equal(result.get("w2")?.date, "2026-07-28");
});

test("отдых вместо Swim не показывает тренировку в этот день", () => {
  const changes = changesByDateMap([change({ date: "2026-07-21", action: "rest" })]);
  const result = assignSwimCalendar({ workouts: pending("w1"), homeWeek: POOL_WEEK, changesByDate: changes, todayIso: "2026-07-20" });
  assert.notEqual(result.get("w1")?.date, "2026-07-21");
  assert.equal(result.get("w1")?.date, "2026-07-23");
});

test("завершённая тренировка не назначается повторно и не блокирует свою дату для других", () => {
  const workouts: SwimScheduleWorkoutInput[] = [
    { workoutId: "done", status: "completed", pinnedDate: "2026-07-14" }, // выполнена раньше, в другой день
    { workoutId: "w2", status: "not_started", pinnedDate: null },
  ];
  const result = assignSwimCalendar({ workouts, homeWeek: POOL_WEEK, changesByDate: noChanges(), todayIso: "2026-07-20" });
  assert.equal(result.get("done")?.date, "2026-07-14");
  assert.equal(result.get("done")?.origin, "completed");
  assert.equal(result.get("w2")?.date, "2026-07-21"); // проецируется независимо от завершённой
});

test("активный черновик сохраняет свою реальную дату вместо перепроецирования", () => {
  const workouts: SwimScheduleWorkoutInput[] = [
    { workoutId: "active", status: "in_progress", pinnedDate: "2026-07-21" },
    { workoutId: "waiting", status: "awaiting_confirmation", pinnedDate: "2026-07-19" }, // воскресенье — нетипичный день, но реальный
  ];
  const result = assignSwimCalendar({ workouts, homeWeek: POOL_WEEK, changesByDate: noChanges(), todayIso: "2026-07-20" });
  assert.equal(result.get("active")?.date, "2026-07-21");
  assert.equal(result.get("active")?.origin, "active");
  assert.equal(result.get("waiting")?.date, "2026-07-19");
  assert.equal(result.get("waiting")?.origin, "active");
});

test("«Сегодня» не появляется на неправильном дне", () => {
  const result = assignSwimCalendar({ workouts: pending("w1", "w2"), homeWeek: POOL_WEEK, changesByDate: noChanges(), todayIso: "2026-07-20" });
  assert.equal(result.get("w1")?.isToday, false); // вторник, не сегодня (сегодня — понедельник)
  assert.equal(result.get("w2")?.isToday, false);
  const todayIsSwim = assignSwimCalendar({ workouts: pending("w1"), homeWeek: POOL_WEEK, changesByDate: noChanges(), todayIso: "2026-07-21" });
  assert.equal(todayIsSwim.get("w1")?.isToday, true); // сегодня вторник — реально Swim-день
});
