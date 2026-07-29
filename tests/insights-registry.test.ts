import assert from "node:assert/strict";
import test from "node:test";
import { buildCardInsights, buildEveningInsights, buildMoodInsights } from "../lib/insights/registry.ts";
import { COACH_INSIGHTS_MAX, type CoachInsightsInput } from "../lib/coach-insights.ts";
import { hashEvidence, confidenceFromCount } from "../lib/insights/hash.ts";

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

// ---------------------------------------------------------------------------
// Контракт

test("AI-4: buildCardInsights заполняет все поля единого контракта", () => {
  const insights = buildCardInsights({
    ...base(),
    workouts: [{ date: "2026-07-20", type: "Силовая", title: "Гантели по кругу" } as any],
  });
  assert.ok(insights.length > 0);
  for (const i of insights) {
    assert.equal(typeof i.id, "string");
    assert.ok(i.id.length > 0);
    assert.equal(typeof i.category, "string");
    assert.ok(["observation", "pattern", "milestone"].includes(i.kind));
    assert.ok(["good", "warn", "info"].includes(i.tone));
    assert.equal(typeof i.priority, "number");
    assert.equal(typeof i.title, "string");
    assert.equal(typeof i.summary, "string");
    assert.ok(i.confidence >= 0 && i.confidence <= 1);
    assert.equal(typeof i.evidenceCount, "number");
    assert.equal(typeof i.evidenceHash, "string");
    assert.ok(Array.isArray(i.usedSignals));
  }
});

// ---------------------------------------------------------------------------
// Обратная совместимость с buildCoachInsights (сохранены id/tone/priority/порядок)

test("AI-4: сохранена обратная совместимость с coach-insights (id/tone/priority/лимит)", () => {
  const input: CoachInsightsInput = {
    ...base(),
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
  };
  const insights = buildCardInsights(input);
  assert.ok(insights.length <= COACH_INSIGHTS_MAX);
  for (let i = 1; i < insights.length; i++) assert.ok(insights[i - 1].priority <= insights[i].priority);
  assert.ok(insights.some(i => i.id === "weight-off-track" && i.tone === "warn"));
});

test("AI-4: new-strength-record маппится в kind milestone", () => {
  const insights = buildCardInsights({
    ...base(),
    workouts: [{ date: "2026-07-01", type: "Силовая", title: "x" } as any], // достаточно тренировок, чтобы не было plan-completion-low
    strengthLogs: [
      { exercise: "Жим гантелей лёжа", weight: 20, date: "2026-07-10" },
      { exercise: "Жим гантелей лёжа", weight: 22, date: "2026-07-24" },
    ],
    planDays: PLAN_DAYS.map(d => ({ ...d, type: "Отдых" })), // без плана — plan-completion не считается вовсе
  });
  const record = insights.find(i => i.id === "new-strength-record");
  assert.ok(record);
  assert.equal(record!.kind, "milestone");
});

// ---------------------------------------------------------------------------
// Приоритеты, дедупликация

test("AI-4: registry не создаёт дублей id внутри одного списка", () => {
  const insights = buildCardInsights({
    ...base(),
    measurements: [
      { date: "2026-07-25", weight: 85 }, { date: "2026-07-22", weight: 84.5 }, { date: "2026-07-19", weight: 84 },
      { date: "2026-07-12", weight: 83 }, { date: "2026-07-09", weight: 82.5 },
    ],
  });
  const ids = insights.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---------------------------------------------------------------------------
// Неизвестные/нулевые значения — честность

test("AI-4: пустые данные не создают инсайты из воздуха (buildCardInsights)", () => {
  const insights = buildCardInsights(base());
  assert.ok(insights.every(i => i.category !== "weight"));
  assert.ok(insights.every(i => i.category !== "nutrition"));
});

test("AI-4: пустая активность/moodLogs не создают паттернов и не дают NaN", () => {
  const evening = buildEveningInsights([], []);
  const mood = buildMoodInsights([], [], []);
  assert.deepEqual(evening, []);
  assert.deepEqual(mood, []);
});

test("AI-4: confidenceFromCount никогда не NaN и в диапазоне [0,1]", () => {
  assert.equal(confidenceFromCount(0, 5), 0);
  assert.equal(confidenceFromCount(-1, 5), 0);
  const c = confidenceFromCount(5, 5);
  assert.ok(Number.isFinite(c) && c >= 0 && c <= 1);
});

// ---------------------------------------------------------------------------
// Детерминированность

test("AI-4: одинаковый вход даёт одинаковый результат (детерминизм)", () => {
  const input: CoachInsightsInput = {
    ...base(),
    measurements: [{ date: DATE, weight: 83 }, { date: "2026-07-12", weight: 85 }],
    foodLogs: [{ date: DATE, calories: 1500, protein: 90 }, { date: "2026-07-24", calories: 1500, protein: 90 }, { date: "2026-07-23", calories: 1500, protein: 90 }],
  };
  assert.deepEqual(buildCardInsights(input), buildCardInsights(input));
});

test("AI-4: evidenceHash стабилен к порядку evidence и меняется при изменении count", () => {
  const a = hashEvidence(["b", "a", "count:3"], "rev1");
  const b = hashEvidence(["a", "b", "count:3"], "rev1");
  assert.equal(a, b);
  const c = hashEvidence(["a", "b", "count:4"], "rev1");
  assert.notEqual(a, c);
});

// ---------------------------------------------------------------------------
// Вечерние и mood-паттерны — стабильные id, honesty gate

test("AI-4: buildEveningInsights даёт стабильный id для тренировочного паттерна", () => {
  const activity = [
    { date: "2026-07-01", firstDrinkTime: "22:00", beers: 2 },
    { date: "2026-07-02", firstDrinkTime: "22:10", beers: 2 },
    { date: "2026-07-03", firstDrinkTime: "21:50", beers: 2 },
    { date: "2026-07-04", firstDrinkTime: "19:00", beers: 2 },
    { date: "2026-07-05", firstDrinkTime: "19:10", beers: 2 },
    { date: "2026-07-06", firstDrinkTime: "18:50", beers: 2 },
  ];
  const workouts = [{ date: "2026-07-01" }, { date: "2026-07-02" }, { date: "2026-07-03" }];
  const insights = buildEveningInsights(activity, workouts);
  const trainPattern = insights.find(i => i.id === "evening-training-later-drink");
  assert.ok(trainPattern);
  assert.equal(trainPattern!.category, "evening");
  assert.equal(trainPattern!.kind, "pattern");
});

// ---------------------------------------------------------------------------
// Честность evidenceCount/confidence (найдено на финальном ревью AI-4)

test("AI-4: new-strength-record считает evidence только по своему упражнению, не по всем силовым записям", () => {
  const insights = buildCardInsights({
    ...base(),
    workouts: [{ date: "2026-07-01", type: "Силовая", title: "x" } as any],
    planDays: PLAN_DAYS.map(d => ({ ...d, type: "Отдых" })),
    strengthLogs: [
      // Много посторонних записей по ДРУГОМУ упражнению — не должны раздувать
      // evidenceCount/confidence рекорда по "Жим гантелей лёжа".
      ...Array.from({ length: 20 }, (_, i) => ({ exercise: "Присед", weight: 40 + i, date: `2026-06-${String(i + 1).padStart(2, "0")}` })),
      { exercise: "Жим гантелей лёжа", weight: 20, date: "2026-07-10" },
      { exercise: "Жим гантелей лёжа", weight: 22, date: "2026-07-24" },
    ],
  });
  const record = insights.find(i => i.id === "new-strength-record");
  assert.ok(record);
  assert.equal(record!.evidenceCount, 2);
});

test("AI-4: workouts-missed не раздувает confidence общим числом исторических тренировок", () => {
  const manyOldWorkouts = Array.from({ length: 50 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, type: "Силовая", title: "x" }));
  const insights = buildCardInsights({ ...base(), workouts: manyOldWorkouts as any });
  const missed = insights.find(i => i.id === "workouts-missed");
  assert.ok(missed);
  assert.equal(missed!.evidenceCount, 1);
});

test("AI-4: protein-low-week считает различные дни, а не строки foodLogs (несколько приёмов пищи в один день не задваивают evidence)", () => {
  const insights = buildCardInsights({
    ...base(),
    foodLogs: [
      { date: "2026-07-25", calories: 500, protein: 30, mealType: "Завтрак" },
      { date: "2026-07-25", calories: 500, protein: 30, mealType: "Обед" },
      { date: "2026-07-25", calories: 500, protein: 30, mealType: "Ужин" },
      { date: "2026-07-24", calories: 1500, protein: 90 },
      { date: "2026-07-23", calories: 1500, protein: 90 },
    ] as any,
  });
  const protein = insights.find(i => i.id === "protein-low-week");
  assert.ok(protein);
  assert.equal(protein!.evidenceCount, 3); // 3 различных дня, не 5 строк
});

test("AI-4: buildMoodInsights даёт стабильный id для паттерна тренировок", () => {
  const moodLogs = [
    { id: 1, date: "2026-07-01", mood: "😊", note: "" },
    { id: 2, date: "2026-07-02", mood: "😊", note: "" },
    { id: 3, date: "2026-07-03", mood: "😊", note: "" },
    { id: 4, date: "2026-07-04", mood: "😔", note: "" },
    { id: 5, date: "2026-07-05", mood: "😔", note: "" },
    { id: 6, date: "2026-07-06", mood: "😔", note: "" },
  ];
  const workouts = [{ date: "2026-07-01" }, { date: "2026-07-02" }, { date: "2026-07-03" }];
  const insights = buildMoodInsights(moodLogs as any, workouts, []);
  const trainPattern = insights.find(i => i.id === "mood-training-better");
  assert.ok(trainPattern);
  assert.equal(trainPattern!.category, "mood");
});
