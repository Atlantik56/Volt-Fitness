import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachInsights, COACH_INSIGHTS_MAX, type CoachInsightsInput } from "../lib/coach-insights.ts";

const DATE = "2026-07-25";
const TARGETS = { calories: 1700, protein: 150 };
const PLAN_DAYS = [
  { day: 1, type: "Силовая" }, { day: 2, type: "Кардио" }, { day: 3, type: "Силовая" },
  { day: 4, type: "Восстановление" }, { day: 5, type: "Силовая" }, { day: 6, type: "Кардио" }, { day: 7, type: "Отдых" },
];

const base = (): CoachInsightsInput => ({
  date: DATE,
  measurements: [],
  workouts: [],
  foodLogs: [],
  strengthLogs: [],
  planDays: PLAN_DAYS,
  targets: TARGETS,
  targetWeight: 67,
});

test("6.9: пустые данные не создают инсайтов из воздуха", () => {
  const insights = buildCoachInsights(base());
  // Нет тренировок вовсе — это тоже валидный сигнал "не было тренировок", но
  // остальные модули (вес, питание) при пустых данных должны молчать.
  assert.ok(insights.every(x => x.category !== "weight"));
  assert.ok(insights.every(x => x.category !== "nutrition"));
});

test("6.9: плато веса — среднее за 7 дней почти равно среднему за предыдущие 7", () => {
  const insights = buildCoachInsights({
    ...base(),
    measurements: [
      { date: "2026-07-25", weight: 83 }, { date: "2026-07-22", weight: 83.1 }, { date: "2026-07-19", weight: 82.9 },
      { date: "2026-07-12", weight: 83 }, { date: "2026-07-09", weight: 83 },
    ],
  });
  const weight = insights.find(x => x.category === "weight");
  assert.equal(weight?.id, "weight-plateau");
  assert.equal(weight?.tone, "info");
});

test("6.9: вес движется к цели — позитивный тон", () => {
  const insights = buildCoachInsights({
    ...base(),
    targetWeight: 67,
    measurements: [
      { date: "2026-07-25", weight: 82 }, { date: "2026-07-22", weight: 82.5 }, { date: "2026-07-19", weight: 83 },
      { date: "2026-07-12", weight: 84 }, { date: "2026-07-09", weight: 84.5 },
    ],
  });
  const weight = insights.find(x => x.category === "weight");
  assert.equal(weight?.id, "weight-on-track");
  assert.equal(weight?.tone, "good");
});

test("6.9: вес движется от цели — предупреждение, без цели — не судим", () => {
  const withGoal = buildCoachInsights({
    ...base(),
    targetWeight: 67,
    measurements: [
      { date: "2026-07-25", weight: 85 }, { date: "2026-07-22", weight: 84.5 }, { date: "2026-07-19", weight: 84 },
      { date: "2026-07-12", weight: 83 }, { date: "2026-07-09", weight: 82.5 },
    ],
  });
  assert.equal(withGoal.find(x => x.category === "weight")?.id, "weight-off-track");

  const withoutGoal = buildCoachInsights({
    ...base(),
    targetWeight: null,
    measurements: [
      { date: "2026-07-25", weight: 85 }, { date: "2026-07-22", weight: 84.5 }, { date: "2026-07-19", weight: 84 },
      { date: "2026-07-12", weight: 83 }, { date: "2026-07-09", weight: 82.5 },
    ],
  });
  // Без цели нельзя утверждать "хорошо" или "плохо" — это тренд без оценки.
  assert.equal(withoutGoal.find(x => x.category === "weight"), undefined);
});

test("6.9: пропуски тренировок считаются от последней сохранённой записи", () => {
  const insights = buildCoachInsights({
    ...base(),
    workouts: [{ date: "2026-07-20", type: "Силовая", title: "Гантели по кругу" } as any],
  });
  const missed = insights.find(x => x.id === "workouts-missed");
  assert.ok(missed);
  assert.ok(missed!.title.includes("5"));
});

test("6.9: план только из отдыха не создаёт ложного «пропуска тренировок»", () => {
  const insights = buildCoachInsights({ ...base(), planDays: PLAN_DAYS.map(d => ({ ...d, type: "Отдых" })) });
  assert.equal(insights.find(x => x.id === "workouts-missed"), undefined);
});

test("6.9: низкий белок за неделю — только если есть достаточно записей", () => {
  const enough = buildCoachInsights({
    ...base(),
    foodLogs: [
      { date: "2026-07-25", calories: 1600, protein: 90 },
      { date: "2026-07-24", calories: 1600, protein: 95 },
      { date: "2026-07-23", calories: 1600, protein: 100 },
    ],
  });
  assert.equal(enough.find(x => x.id === "protein-low-week")?.tone, "warn");

  const notEnough = buildCoachInsights({
    ...base(),
    foodLogs: [{ date: "2026-07-25", calories: 1600, protein: 90 }],
  });
  assert.equal(notEnough.find(x => x.id === "protein-low-week"), undefined);
});

test("6.9: новый рабочий вес засчитывается только при превышении предыдущего максимума за 7 дней", () => {
  const newRecord = buildCoachInsights({
    ...base(),
    strengthLogs: [
      { exercise: "Жим гантелей лёжа", weight: 20, date: "2026-07-10" },
      { exercise: "Жим гантелей лёжа", weight: 22, date: "2026-07-24" },
    ],
  });
  assert.ok(newRecord.find(x => x.id === "new-strength-record"));

  // Первая запись по упражнению — не с чем сравнивать, не рекорд.
  const firstEver = buildCoachInsights({ ...base(), strengthLogs: [{ exercise: "Присед", weight: 20, date: "2026-07-24" }] });
  assert.equal(firstEver.find(x => x.id === "new-strength-record"), undefined);

  // Вес не превышен — не рекорд.
  const notBeaten = buildCoachInsights({
    ...base(),
    strengthLogs: [
      { exercise: "Присед", weight: 25, date: "2026-07-10" },
      { exercise: "Присед", weight: 20, date: "2026-07-24" },
    ],
  });
  assert.equal(notBeaten.find(x => x.id === "new-strength-record"), undefined);
});

test("6.9: результат не превышает COACH_INSIGHTS_MAX и отсортирован по приоритету", () => {
  const insights = buildCoachInsights({
    date: DATE,
    targetWeight: 67,
    planDays: PLAN_DAYS,
    targets: TARGETS,
    measurements: [
      { date: "2026-07-25", weight: 85 }, { date: "2026-07-22", weight: 84.5 }, { date: "2026-07-19", weight: 84 },
      { date: "2026-07-12", weight: 83 }, { date: "2026-07-09", weight: 82.5 },
    ],
    workouts: [{ date: "2026-07-01", type: "Силовая", title: "Гантели по кругу" } as any],
    foodLogs: [
      { date: "2026-07-25", calories: 1600, protein: 90 }, { date: "2026-07-24", calories: 1600, protein: 95 }, { date: "2026-07-23", calories: 1600, protein: 100 },
    ],
    strengthLogs: [
      { exercise: "Жим гантелей лёжа", weight: 20, date: "2026-07-10" }, { exercise: "Жим гантелей лёжа", weight: 22, date: "2026-07-24" },
    ],
  });
  assert.ok(insights.length <= COACH_INSIGHTS_MAX);
  for (let i = 1; i < insights.length; i++) assert.ok(insights[i - 1].priority <= insights[i].priority);
});

test("6.9: одинаковый вход даёт одинаковый результат (детерминизм)", () => {
  const input: CoachInsightsInput = {
    ...base(),
    measurements: [{ date: DATE, weight: 83 }, { date: "2026-07-12", weight: 85 }],
    foodLogs: [{ date: DATE, calories: 1500, protein: 90 }, { date: "2026-07-24", calories: 1500, protein: 90 }, { date: "2026-07-23", calories: 1500, protein: 90 }],
  };
  assert.deepEqual(buildCoachInsights(input), buildCoachInsights(input));
});
