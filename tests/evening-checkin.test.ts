import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSleepWindow,
  formatSleepRange,
  normalizeWaterLiters,
  formatLiters,
  normalizeAlcohol,
  buildCheckinSteps,
  deriveKnownState,
  buildInitialCheckinState,
  validateCheckinState,
  buildCheckinSummary,
  type CheckinFormState,
  type AlcoholDraft,
} from "../lib/evening-checkin.ts";

const emptyState = (date: string): CheckinFormState => ({
  date,
  sleep: { startTime: "", endTime: "", quality: null },
  water: { liters: null },
  alcohol: { drank: null, type: "", servings: null, servingVolumeMl: null, firstDrinkTime: "", firstDrinkUnknown: false, relativeAmount: "" },
  mood: { mood: null, note: "" },
  dinner: { dinner: null },
  wellness: { energy: null, pain: null, painArea: "", note: "" },
  dayFactor: { factor: "", note: "" },
});

// --- Сон ---------------------------------------------------------------

test("сон: в пределах суток", () => {
  const w = computeSleepWindow("2026-07-28", "07:00", "08:00");
  assert.ok(!("error" in w));
  if (!("error" in w)) assert.equal(w.minutes, 60);
});

test("сон: через полночь", () => {
  const w = computeSleepWindow("2026-07-28", "23:40", "07:10");
  assert.ok(!("error" in w));
  if (!("error" in w)) {
    assert.equal(w.minutes, 7 * 60 + 30);
    assert.equal(w.startIso, "2026-07-27T23:40");
    assert.equal(w.endIso, "2026-07-28T07:10");
  }
});

test("сон: начало раньше или равно концу по часам суток — оба момента считаются текущим днём", () => {
  const w = computeSleepWindow("2026-07-28", "00:20", "07:10");
  assert.ok(!("error" in w));
  if (!("error" in w)) {
    assert.equal(w.startIso, "2026-07-28T00:20");
    assert.equal(w.endIso, "2026-07-28T07:10");
    assert.equal(formatSleepRange(w.startIso, w.endIso, w.minutes), "00:20–07:10 · 6 ч 50 мин");
  }
});

test("сон: неверный обратный интервал (подъём раньше отхода ко сну в пределах того же дня) отклоняется", () => {
  const w = computeSleepWindow("2026-07-28", "10:00", "09:00");
  assert.ok("error" in w);
});

test("сон: одинаковое время отклоняется (нулевая длительность)", () => {
  const w = computeSleepWindow("2026-07-28", "07:00", "07:00");
  assert.ok("error" in w);
});

test("сон: слишком большой интервал отклоняется", () => {
  const w = computeSleepWindow("2026-07-28", "06:00", "22:00");
  assert.ok("error" in w);
});

test("сон: форматирование длительности '6 ч 50 мин'", () => {
  assert.equal(formatSleepRange("2026-07-28T00:20", "2026-07-28T07:10", 410), "00:20–07:10 · 6 ч 50 мин");
});

test("сон: високосная дата — переход с 29 февраля на 1 марта считается корректно", () => {
  const w = computeSleepWindow("2026-03-01", "23:50", "06:00");
  // 2024 — високосный год: 29 февраля существует, значит отход ко сну "вчера"
  // от даты 2024-03-01 корректно попадает на 2024-02-29, а не на несуществующую дату.
  const w2024 = computeSleepWindow("2024-03-01", "23:50", "06:00");
  assert.ok(!("error" in w2024));
  if (!("error" in w2024)) {
    assert.equal(w2024.startIso, "2024-02-29T23:50");
    assert.equal(w2024.endIso, "2024-03-01T06:00");
    assert.equal(w2024.minutes, 6 * 60 + 10);
  }
  // Контроль: та же пара времён в невисокосный 2026 год — 28 февраля, не 29-е.
  assert.ok(!("error" in w));
  if (!("error" in w)) assert.equal(w.startIso, "2026-02-28T23:50");
});

test("сон: некорректный формат времени отклоняется", () => {
  assert.ok("error" in computeSleepWindow("2026-07-28", "25:00", "07:00"));
  assert.ok("error" in computeSleepWindow("2026-07-28", "", "07:00"));
});

// --- Вода ----------------------------------------------------------------

test("вода: 0 — валидное явное значение, а не ошибка", () => {
  assert.equal(normalizeWaterLiters(0), 0);
});

test("вода: 0.25 и дробные значения округляются к шагу 0.25", () => {
  assert.equal(normalizeWaterLiters(0.25), 0.25);
  assert.equal(normalizeWaterLiters(1.1), 1);
  assert.equal(normalizeWaterLiters(1.3), 1.25);
});

test("вода: границы диапазона", () => {
  assert.equal(normalizeWaterLiters(-0.1), null);
  assert.equal(normalizeWaterLiters(10), 10);
  assert.equal(normalizeWaterLiters(10.1), null);
  assert.equal(normalizeWaterLiters(NaN), null);
});

test("вода: форматирование с десятичной запятой", () => {
  assert.equal(formatLiters(1.75), "1,75 л");
  assert.equal(formatLiters(2), "2 л");
});

// --- Алкоголь --------------------------------------------------------------

const beerDraft = (overrides: Partial<AlcoholDraft> = {}): AlcoholDraft => ({
  drank: true, type: "Пиво", servings: 3, servingVolumeMl: 450, firstDrinkTime: "21:35", firstDrinkUnknown: false, relativeAmount: "",
  ...overrides,
});

test("алкоголь: не пил", () => {
  const r = normalizeAlcohol({ ...beerDraft(), drank: false });
  assert.deepEqual(r, { drank: false });
});

test("алкоголь: не отвечено — ошибка, а не молчаливый ноль", () => {
  const r = normalizeAlcohol({ ...beerDraft(), drank: null });
  assert.ok("error" in r);
});

test("алкоголь: одна порция", () => {
  const r = normalizeAlcohol(beerDraft({ servings: 1 }));
  assert.ok(!("error" in r));
  if (!("error" in r) && r.drank) assert.equal(r.servings, 1);
});

test("алкоголь: несколько порций, разные объёмы", () => {
  const r1 = normalizeAlcohol(beerDraft({ servings: 3, servingVolumeMl: 450 }));
  const r2 = normalizeAlcohol(beerDraft({ type: "Вино", servings: 2, servingVolumeMl: 150 }));
  assert.ok(!("error" in r1) && !("error" in r2));
  if (!("error" in r1) && r1.drank) assert.equal(r1.servingVolumeMl, 450);
  if (!("error" in r2) && r2.drank) { assert.equal(r2.servingVolumeMl, 150); assert.equal(r2.type, "Вино"); }
});

test("алкоголь: количество без объёма недостаточно", () => {
  const r = normalizeAlcohol(beerDraft({ servingVolumeMl: null }));
  assert.ok("error" in r);
});

test("алкоголь: 'не помню время' — честный null, а не выдуманное время", () => {
  const r = normalizeAlcohol(beerDraft({ firstDrinkUnknown: true, firstDrinkTime: "" }));
  assert.ok(!("error" in r));
  if (!("error" in r) && r.drank) assert.equal(r.firstDrinkTime, null);
});

test("алкоголь: без времени и без пометки 'не помню' — ошибка", () => {
  const r = normalizeAlcohol(beerDraft({ firstDrinkTime: "", firstDrinkUnknown: false }));
  assert.ok("error" in r);
});

// --- Адаптивные шаги ---------------------------------------------------

test("адаптивные шаги: ничего не известно — все шаги на месте, детерминированный порядок", () => {
  const steps = buildCheckinSteps({ sleepKnown: false, sleepPartial: false, waterKnown: false, alcoholKnown: false, moodKnown: false, dinnerKnown: false, wellnessKnown: false, dayFactorKnown: false });
  assert.deepEqual(steps.map(s => s.id), ["sleep", "water", "alcohol", "mood", "dinner", "wellness", "dayFactor"]);
  assert.ok(steps.every(s => s.status === "missing"));
});

test("адаптивные шаги: известный ужин полностью исключается из списка", () => {
  const steps = buildCheckinSteps({ sleepKnown: false, sleepPartial: false, waterKnown: false, alcoholKnown: false, moodKnown: false, dinnerKnown: true, wellnessKnown: false, dayFactorKnown: false });
  assert.ok(!steps.some(s => s.id === "dinner"));
});

test("адаптивные шаги: известные значения не исчезают, а помечаются 'known' (остаются подтверждаемыми)", () => {
  const steps = buildCheckinSteps({ sleepKnown: true, sleepPartial: false, waterKnown: true, alcoholKnown: true, moodKnown: true, dinnerKnown: false, wellnessKnown: true, dayFactorKnown: false });
  const byId = Object.fromEntries(steps.map(s => [s.id, s.status]));
  assert.equal(byId.sleep, "known");
  assert.equal(byId.water, "known");
  assert.equal(byId.alcohol, "known");
  assert.equal(byId.mood, "known");
  assert.equal(byId.wellness, "known");
  assert.equal(byId.dinner, "missing"); // не известен -> остаётся вопросом
});

test("адаптивные шаги: только длительность сна известна (legacy sleepHours) — статус 'partial'", () => {
  const steps = buildCheckinSteps({ sleepKnown: false, sleepPartial: true, waterKnown: false, alcoholKnown: false, moodKnown: false, dinnerKnown: false, wellnessKnown: false, dayFactorKnown: false });
  assert.equal(steps.find(s => s.id === "sleep")?.status, "partial");
});

test("deriveKnownState: собирает статусы из сырых данных существующих таблиц", () => {
  const known = deriveKnownState({
    activityRow: { sleepStart: "2026-07-27T23:40", sleepEnd: "2026-07-28T07:10", waterLogged: true, alcoholLogged: false, dinner: true, dayFactor: "Работа" },
    latestMoodToday: { mood: "🙂" },
    dinnerLoggedInFoodLogs: false,
    wellnessToday: { energy: 4, pain: 1 },
  });
  assert.equal(known.sleepKnown, true);
  assert.equal(known.waterKnown, true);
  assert.equal(known.alcoholKnown, false);
  assert.equal(known.moodKnown, true);
  assert.equal(known.dinnerKnown, true);
  assert.equal(known.wellnessKnown, true);
  assert.equal(known.dayFactorKnown, true);
});

test("адаптивные шаги: сохранённый главный фактор дня тоже помечается 'known', а не остаётся вопросом", () => {
  const known = deriveKnownState({
    activityRow: { dayFactor: "Работа" },
    latestMoodToday: null,
    dinnerLoggedInFoodLogs: false,
    wellnessToday: null,
  });
  assert.equal(known.dayFactorKnown, true);
  const steps = buildCheckinSteps(known);
  assert.equal(steps.find(s => s.id === "dayFactor")?.status, "known");
});

// --- Восстановление состояния при повторном открытии --------------------

test("восстановление состояния: повторное открытие подставляет сохранённые значения", () => {
  const state = buildInitialCheckinState({
    date: "2026-07-28",
    activityRow: {
      sleepStart: "2026-07-27T23:40", sleepEnd: "2026-07-28T07:10", sleepQuality: 4,
      waterLiters: 1.75, waterLogged: true,
      alcoholLogged: true, alcoholType: "Пиво", alcoholServings: 3, alcoholServingVolumeMl: 450, firstDrinkTime: "21:35", alcoholRelativeAmount: "usual",
      dinner: true, dayFactor: "Работа", dayFactorNote: "Дедлайн",
    },
    latestMoodToday: { mood: "🙂", note: "Норм день" },
    wellnessToday: { energy: 4, pain: 1, painArea: "колено", note: "Немного побаливает" },
  });
  assert.equal(state.sleep.startTime, "23:40");
  assert.equal(state.sleep.endTime, "07:10");
  assert.equal(state.water.liters, 1.75);
  assert.equal(state.alcohol.drank, true);
  assert.equal(state.alcohol.servings, 3);
  assert.equal(state.mood.mood, "🙂");
  assert.equal(state.dinner.dinner, true);
  assert.equal(state.wellness.pain, 1);
  assert.equal(state.dayFactor.factor, "Работа");
});

test("восстановление состояния: пустая БД — форма пустая, а не выдуманные значения", () => {
  const state = buildInitialCheckinState({ date: "2026-07-28", activityRow: null, latestMoodToday: null, wellnessToday: null });
  assert.equal(state.sleep.startTime, "");
  assert.equal(state.water.liters, null);
  assert.equal(state.alcohol.drank, null);
  assert.equal(state.mood.mood, null);
  assert.equal(state.dinner.dinner, null);
});

test("восстановление состояния: legacy dinner=false (столбец без своего 'logged' флага) не выдаётся за подтверждённый ответ", () => {
  const state = buildInitialCheckinState({
    date: "2026-07-28",
    activityRow: { dinner: false },
    latestMoodToday: null,
    wellnessToday: null,
  });
  // dinner=false в БД неотличим от "ещё не отвечено" (в отличие от water/alcohol,
  // у которых есть свой *_logged флаг) — честнее показать шаг как неотвеченный,
  // чем молча предзаполнить "Не было" и рискнуть тихим сохранением непрошенного факта.
  assert.equal(state.dinner.dinner, null);
});

test("восстановление состояния: legacy dinner=true подставляется как подтверждённый факт", () => {
  const state = buildInitialCheckinState({
    date: "2026-07-28",
    activityRow: { dinner: true },
    latestMoodToday: null,
    wellnessToday: null,
  });
  assert.equal(state.dinner.dinner, true);
});

// --- Валидация и сводка --------------------------------------------------

test("валидация: пустая форма проходит без ошибок и без полей в payload", () => {
  const r = validateCheckinState(emptyState("2026-07-28"));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.payload.sleepStart, undefined);
    assert.equal(r.payload.waterLiters, undefined);
    assert.equal(r.payload.alcohol, undefined);
  }
});

test("валидация: только время начала сна без конца — ошибка на шаге sleep", () => {
  const state = emptyState("2026-07-28");
  state.sleep.startTime = "23:40";
  const r = validateCheckinState(state);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0].step, "sleep");
});

test("сводка: отличает null (нет ответа) от 0 (явный ответ)", () => {
  const withZero = buildCheckinSummary({ date: "2026-07-28", waterLiters: 0 }, false);
  const withoutAnswer = buildCheckinSummary({ date: "2026-07-28" }, false);
  assert.ok(withZero.some(l => l.step === "water" && l.value === "0 л"));
  assert.ok(!withoutAnswer.some(l => l.step === "water"));
});

test("сводка: содержит факт тренировки, не редактируемый из чек-ина", () => {
  const lines = buildCheckinSummary({ date: "2026-07-28" }, true);
  const workoutLine = lines.find(l => l.step === "workout");
  assert.equal(workoutLine?.value, "выполнена");
  assert.equal(workoutLine?.editable, false);
});

test("сводка: нет общей оценки, каждая строка редактируема (кроме тренировки)", () => {
  const state = emptyState("2026-07-28");
  state.water.liters = 1.5;
  state.mood.mood = "🙂";
  const validated = validateCheckinState(state);
  assert.ok(validated.ok);
  if (!validated.ok) return;
  const lines = buildCheckinSummary(validated.payload, true);
  assert.ok(!lines.some(l => /\d\/10/.test(l.value)));
  for (const l of lines) if (l.step !== "workout") assert.equal(l.editable, true);
});

test("сводка алкоголя: формат '3 × 450 мл · первый напиток в 21:35'", () => {
  const state = emptyState("2026-07-28");
  state.alcohol = beerDraft();
  const validated = validateCheckinState(state);
  assert.ok(validated.ok);
  if (!validated.ok) return;
  const line = buildCheckinSummary(validated.payload, false).find(l => l.step === "alcohol");
  assert.equal(line?.value, "3 × 450 мл · первый напиток в 21:35");
});
