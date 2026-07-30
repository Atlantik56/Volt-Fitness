import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutomaticMilestones, groupMilestonesByMonth, filterMilestonesByCategory,
  buildMonthOverview, toLlmSafeMilestone, findNewAutomaticMilestone, type MilestoneSources, type Milestone,
} from "../lib/milestones.ts";

const ANCHOR = "2026-08-01";

function baseSources(overrides: Partial<MilestoneSources> = {}): MilestoneSources {
  return { workouts: [], strengthLogs: [], measurements: [], programStages: [], photos: [], anchor: ANCHOR, ...overrides };
}

const workout = (id: number, date: string) => ({ id, date });

// ---------------------------------------------------------------------------
// Первая тренировка

test("первая тренировка: пусто без записей, одна веха с earliest date при наличии", () => {
  assert.deepEqual(buildAutomaticMilestones(baseSources()).filter(m => m.kind === "first-workout"), []);
  const workouts = [workout(1, "2026-07-05"), workout(2, "2026-07-01"), workout(3, "2026-07-10")];
  const milestones = buildAutomaticMilestones(baseSources({ workouts }));
  const first = milestones.find(m => m.kind === "first-workout");
  assert.ok(first);
  assert.equal(first!.occurredAt, "2026-07-01");
  assert.equal(first!.sourceIds[0], "workout:2");
});

// ---------------------------------------------------------------------------
// 9/10, 24/25, 49/50 тренировок

test("границы 9/10, 24/25, 49/50 тренировок", () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => workout(i + 1, `2026-01-${String((i % 28) + 1).padStart(2, "0")}`));
  for (const [n, expectMilestone] of [[9, false], [10, true], [24, false], [25, true], [49, false], [50, true]] as const) {
    const milestones = buildAutomaticMilestones(baseSources({ workouts: make(n) }));
    const has10 = milestones.some(m => m.id === "workout-count-10");
    const has25 = milestones.some(m => m.id === "workout-count-25");
    const has50 = milestones.some(m => m.id === "workout-count-50");
    if (n === 9) assert.equal(has10, false);
    if (n === 10) assert.equal(has10, true);
    if (n === 24) assert.equal(has25, false);
    if (n === 25) assert.equal(has25, true);
    if (n === 49) assert.equal(has50, false);
    if (n === 50) assert.equal(has50, true);
    void expectMilestone;
  }
});

// ---------------------------------------------------------------------------
// Личный рекорд (PR)

test("PR: первая запись по упражнению — не рекорд; превышение — рекорд; равный вес — не рекорд", () => {
  const logs = [
    { id: 1, date: "2026-07-01", exercise: "Присед", weight: 20 },
    { id: 2, date: "2026-07-08", exercise: "Присед", weight: 20 }, // тот же вес — не рекорд
    { id: 3, date: "2026-07-15", exercise: "Присед", weight: 22 }, // рекорд
  ];
  const milestones = buildAutomaticMilestones(baseSources({ strengthLogs: logs }));
  const prs = milestones.filter(m => m.kind === "personal-record");
  assert.equal(prs.length, 1);
  assert.equal(prs[0].sourceIds[0], "strength_log:3");
});

// ---------------------------------------------------------------------------
// Новый минимальный вес

test("новый минимум веса: работает с несортированными и частичными (null) замерами", () => {
  const measurements = [
    { id: 3, date: "2026-07-15", weight: 83 },
    { id: 1, date: "2026-07-01", weight: 85 },
    { id: 2, date: "2026-07-08", weight: null }, // частичный замер без веса — игнорируется
    { id: 4, date: "2026-07-22", weight: 84 }, // выше минимума — не рекорд
  ];
  const milestones = buildAutomaticMilestones(baseSources({ measurements }));
  const mins = milestones.filter(m => m.kind === "new-min-weight");
  assert.equal(mins.length, 1);
  assert.equal(mins[0].sourceIds[0], "measurement:3");
});

// ---------------------------------------------------------------------------
// Этап программы

test("этап программы: завершение только при заполненном endDate", () => {
  const stages = [
    { id: 1, title: "Домашний этап", endDate: "2026-07-20" },
    { id: 2, title: "Текущий этап", endDate: null },
  ];
  const milestones = buildAutomaticMilestones(baseSources({ programStages: stages }));
  const completed = milestones.filter(m => m.kind === "program-stage-completed");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].sourceIds[0], "program_stage:1");
});

// ---------------------------------------------------------------------------
// Лучший месяц — honesty gate (недостаток данных)

test("лучший месяц: месяц с недостатком данных не объявляется лучшим, текущий месяц исключён", () => {
  const workouts = [
    ...Array.from({ length: 2 }, (_, i) => workout(i + 1, `2026-06-0${i + 1}`)), // июнь: 2 тренировки — мало данных
    ...Array.from({ length: 5 }, (_, i) => workout(i + 10, `2026-07-0${i + 1}`)), // июль: 5 тренировок — участвует
    workout(99, "2026-08-01"), // текущий (anchor) месяц — исключён из сравнения
  ];
  const milestones = buildAutomaticMilestones(baseSources({ workouts }));
  const best = milestones.filter(m => m.kind === "best-month-regularity");
  assert.equal(best.length, 1);
  assert.equal(best[0].id, "best-month-2026-07");
});

test("лучший месяц: пусто, если ни один завершённый месяц не набрал минимум", () => {
  const workouts = [workout(1, "2026-07-01"), workout(2, "2026-07-05")]; // 2 < BEST_MONTH_MIN_WORKOUTS
  const milestones = buildAutomaticMilestones(baseSources({ workouts }));
  assert.equal(milestones.filter(m => m.kind === "best-month-regularity").length, 0);
});

// ---------------------------------------------------------------------------
// Контрольное фото — только факт и дата

test("контрольное фото: первое фото + чекпоинт раз в 30+ дней, без filename/content", () => {
  const photos = [{ id: 1, date: "2026-06-01" }, { id: 2, date: "2026-06-15" }, { id: 3, date: "2026-07-05" }];
  const milestones = buildAutomaticMilestones(baseSources({ photos }));
  const photoMilestones = milestones.filter(m => m.kind === "photo-checkpoint");
  assert.equal(photoMilestones.length, 2); // первое (id1) + чекпоинт через 34 дня (id3), id2 (14 дней) пропущен
  for (const m of photoMilestones) {
    assert.ok(!("filename" in m));
    assert.ok(!/\.(jpe?g|png|webp)/i.test(m.summary)); // ни filename, ни расширение файла в тексте
  }
});

// ---------------------------------------------------------------------------
// Стабильные id, отсутствие дублей после пересчёта, порядок входа не важен

test("пересчёт истории идемпотентен: одинаковый вход даёт одинаковый результат, порядок массивов не важен", () => {
  const sources = baseSources({
    workouts: [workout(1, "2026-07-01"), workout(2, "2026-07-05")],
    strengthLogs: [{ id: 1, date: "2026-07-01", exercise: "Присед", weight: 20 }, { id: 2, date: "2026-07-05", exercise: "Присед", weight: 25 }],
    measurements: [{ id: 1, date: "2026-07-01", weight: 85 }, { id: 2, date: "2026-07-05", weight: 83 }],
  });
  const a = buildAutomaticMilestones(sources);
  const shuffled = baseSources({
    workouts: [...sources.workouts].reverse(),
    strengthLogs: [...sources.strengthLogs].reverse(),
    measurements: [...sources.measurements].reverse(),
  });
  const b = buildAutomaticMilestones(shuffled);
  assert.deepEqual(a, b);
  const ids = a.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---------------------------------------------------------------------------
// Группировка/фильтры не теряют события

test("группировка по месяцам и фильтр по категории не теряют вехи", () => {
  const milestones: Milestone[] = [
    { id: "a", kind: "first-workout", occurredAt: "2026-06-01", title: "A", summary: "", sourceIds: [], sourceRevision: "v1", automatic: true, category: "тренировки" },
    { id: "b", kind: "new-min-weight", occurredAt: "2026-07-01", title: "B", summary: "", sourceIds: [], sourceRevision: "v1", automatic: true, category: "тело" },
    { id: "c", kind: "manual", occurredAt: "2026-07-15", title: "C", summary: "", sourceIds: [], sourceRevision: "manual", automatic: false, category: "личное" },
  ];
  const grouped = groupMilestonesByMonth(milestones);
  const totalGrouped = grouped.reduce((n, y) => n + y.months.reduce((m, mo) => m + mo.items.length, 0), 0);
  assert.equal(totalGrouped, milestones.length);

  const onlyBody = filterMilestonesByCategory(milestones, "тело");
  assert.deepEqual(onlyBody.map(m => m.id), ["b"]);
  assert.equal(filterMilestonesByCategory(milestones, null).length, milestones.length);
});

// ---------------------------------------------------------------------------
// Месячный обзор (Lite)

test("месячный обзор: честное состояние недостатка данных, когда в месяце пусто", () => {
  const overview = buildMonthOverview("2026-01", baseSources());
  assert.equal(overview.hasEnoughData, false);
  assert.equal(overview.weightChange, null);
  assert.equal(overview.workoutsCount, 0);
});

test("месячный обзор: изменение веса требует минимум 2 замера в месяце", () => {
  const single = buildMonthOverview("2026-07", baseSources({ measurements: [{ id: 1, date: "2026-07-10", weight: 85 }] }));
  assert.equal(single.weightChange, null);
  const two = buildMonthOverview("2026-07", baseSources({ measurements: [{ id: 1, date: "2026-07-01", weight: 85 }, { id: 2, date: "2026-07-20", weight: 83 }] }));
  assert.equal(two.weightChange, -2);
});

// ---------------------------------------------------------------------------
// LLM-safe payload

test("toLlmSafeMilestone не содержит sourceIds/photo и обрезает длинный текст", () => {
  const long = "x".repeat(500);
  const m: Milestone = { id: "m1", kind: "manual", occurredAt: "2026-07-01", title: "T", summary: long, sourceIds: ["photo:1", "measurement:2"], sourceRevision: "manual", automatic: false, category: "личное" };
  const safe = toLlmSafeMilestone(m);
  assert.ok(safe.summary.length <= 200);
  assert.ok(!("sourceIds" in safe));
  assert.ok(!("category" in safe));
  assert.ok(!("automatic" in safe));
});

// ---------------------------------------------------------------------------
// null/0/undefined

test("null/0/undefined: вес=0 не путается с отсутствующим замером (weight=null)", () => {
  const measurements = [{ id: 1, date: "2026-07-01", weight: 50 }, { id: 2, date: "2026-07-08", weight: null }, { id: 3, date: "2026-07-15", weight: 0 }];
  // weight=0 физически невозможен для человека, но модуль не должен падать/путать
  // null (нет данных) и 0 (значение) — 0 < 50, значит это новый минимум.
  const milestones = buildAutomaticMilestones(baseSources({ measurements }));
  const mins = milestones.filter(m => m.kind === "new-min-weight");
  assert.equal(mins.length, 1);
  assert.equal(mins[0].sourceIds[0], "measurement:3");
});

// ---------------------------------------------------------------------------
// Отсутствие причинных формулировок (санити-проверка текстов)

const CAUSAL_PHRASES = ["заставля", "из-за трениров", "вызывает", "приводит к", "потому что тренир"];
test("тексты вех не содержат причинных формулировок", () => {
  const milestones = buildAutomaticMilestones(baseSources({
    workouts: [workout(1, "2026-07-01")],
    strengthLogs: [{ id: 1, date: "2026-07-01", exercise: "Присед", weight: 20 }, { id: 2, date: "2026-07-08", exercise: "Присед", weight: 25 }],
    measurements: [{ id: 1, date: "2026-07-01", weight: 85 }, { id: 2, date: "2026-07-08", weight: 83 }],
  }));
  for (const m of milestones) {
    const text = `${m.title} ${m.summary}`.toLowerCase();
    for (const phrase of CAUSAL_PHRASES) assert.ok(!text.includes(phrase), `нашлась причинная формулировка "${phrase}" в "${text}"`);
  }
});

// ---------------------------------------------------------------------------
// AI Sprint 6 — findNewAutomaticMilestone (баннер поздравления, без повторов)

test("findNewAutomaticMilestone: пустой список — null", () => {
  assert.equal(findNewAutomaticMilestone([], null), null);
});

test("findNewAutomaticMilestone: новая автоматическая веха ещё не видена — возвращается", () => {
  const m: Milestone = { id: "workout-count-10", kind: "workout-count", occurredAt: "2026-07-20", title: "10 тренировок", summary: "", sourceIds: [], sourceRevision: "ai6-v1", automatic: true, category: "тренировки" };
  assert.equal(findNewAutomaticMilestone([m], null)?.id, "workout-count-10");
  assert.equal(findNewAutomaticMilestone([m], "some-other-id")?.id, "workout-count-10");
});

test("findNewAutomaticMilestone: уже видена (совпадает с курсором) — null, без повторного поздравления", () => {
  const m: Milestone = { id: "workout-count-10", kind: "workout-count", occurredAt: "2026-07-20", title: "10 тренировок", summary: "", sourceIds: [], sourceRevision: "ai6-v1", automatic: true, category: "тренировки" };
  assert.equal(findNewAutomaticMilestone([m], "workout-count-10"), null);
});

test("findNewAutomaticMilestone: ручные вехи не празднуются баннером", () => {
  const manual: Milestone = { id: "manual-1", kind: "manual", occurredAt: "2026-07-25", title: "Личная веха", summary: "", sourceIds: [], sourceRevision: "manual", automatic: false, category: "личное" };
  assert.equal(findNewAutomaticMilestone([manual], null), null);
});
