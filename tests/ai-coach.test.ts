import assert from "node:assert/strict";
import test from "node:test";
import { computeNutritionWeeklyStats, computeWeightWeeklyTrend } from "../lib/coach-weekly.ts";
import { buildAiCoachContext, renderAiCoachContextText } from "../lib/ai-context.ts";
import { askAiCoach, AiCoachError } from "../lib/ai-coach.ts";
import {
  dateInTimeZone,
  releaseDailyQuota,
  reserveDailyQuota,
} from "../lib/coach-chat-quota.ts";

const DATE = "2026-07-25";

test("6.8: средний вес за 7 дней сравнивается с предыдущими 7, а не с одной точкой", () => {
  const measurements = [
    { date: "2026-07-25", weight: 83 },
    { date: "2026-07-22", weight: 83.4 },
    { date: "2026-07-19", weight: 84.5 },
    { date: "2026-07-12", weight: 85 },
    { date: "2026-07-09", weight: 85.5 },
  ];
  const trend = computeWeightWeeklyTrend(measurements, DATE);
  assert.equal(trend.avg7d, 83.6);
  assert.equal(trend.avgPrev7d, 85);
  assert.equal(trend.trend, "down");
});

test("6.8: без данных за предыдущую неделю тренд неизвестен, а не выдуман", () => {
  const trend = computeWeightWeeklyTrend([{ date: DATE, weight: 83 }], DATE);
  assert.equal(trend.avg7d, 83);
  assert.equal(trend.avgPrev7d, null);
  assert.equal(trend.trend, "unknown");
});

test("6.8: без всех замеров — нет данных, а не ноль", () => {
  const trend = computeWeightWeeklyTrend([], DATE);
  assert.equal(trend.avg7d, null);
  assert.equal(trend.trend, "unknown");
});

test("6.8: соблюдение плана по питанию считается по попаданию в коридор цели", () => {
  const targets = { calories: 1700, protein: 150 };
  const logs = [
    { date: "2026-07-25", calories: 1650, protein: 140 },
    { date: "2026-07-24", calories: 900, protein: 130 },
    { date: "2026-07-23", calories: 1720, protein: 150 },
  ];
  const stats = computeNutritionWeeklyStats(logs, DATE, targets);
  assert.equal(stats.daysLogged7d, 3);
  assert.equal(stats.planAdherencePct, 67);
});

test("6.8: без записей питания за неделю — нет данных", () => {
  const stats = computeNutritionWeeklyStats([], DATE, { calories: 1700, protein: 150 });
  assert.equal(stats.daysLogged7d, 0);
  assert.equal(stats.avgCalories7d, null);
  assert.equal(stats.planAdherencePct, null);
});

test("6.8: AI Context Builder не выдумывает план и не тянет всю историю", () => {
  const ctx = buildAiCoachContext({
    date: DATE,
    plan: { title: "Гантели по кругу", type: "Силовая" },
    profile: { name: "Илья", height: 167, startWeight: 86, targetWeight: 67 },
    measurements: [{ date: DATE, weight: 83 }],
    foodLogs: [{ date: DATE, calories: 1500, protein: 140 }],
    workouts: Array.from({ length: 20 }, (_, i) => ({ date: `2026-07-${String(25 - i).padStart(2, "0")}`, title: "T", type: "Силовая" })),
    wellnessLogs: [],
    activity: [],
  });
  assert.equal(ctx.plan?.title, "Гантели по кругу");
  // Только последние 5 тренировок, а не вся история.
  assert.equal(ctx.recentWorkouts.length, 5);
  const rendered = renderAiCoachContextText(ctx);
  assert.ok(rendered.includes("Гантели по кругу"));
  assert.equal(/NaN|undefined/.test(rendered), false);
});

test("6.8: контекст без плана честно сообщает об отсутствии плана", () => {
  const ctx = buildAiCoachContext({ date: DATE, profile: {}, measurements: [], foodLogs: [], workouts: [], wellnessLogs: [], activity: [] });
  assert.equal(ctx.plan, null);
  assert.ok(renderAiCoachContextText(ctx).includes("плана нет"));
});

const fakeContext = buildAiCoachContext({ date: DATE, plan: null, profile: {}, measurements: [], foodLogs: [], workouts: [], wellnessLogs: [], activity: [] });

test("6.8: валидный структурированный ответ разбирается корректно", async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ content: [{ text: '{"answer":"Отдохни сегодня","mainRecommendation":"Ляг спать пораньше"}' }] }), { status: 200 });
  const reply = await askAiCoach("key", fakeContext, [], "Что делать?", fetchMock as any);
  assert.equal(reply.answer, "Отдохни сегодня");
  assert.equal(reply.mainRecommendation, "Ляг спать пораньше");
});

test("6.8: ответ в markdown-обёртке всё равно разбирается", async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ content: [{ text: '```json\n{"answer":"ОК","mainRecommendation":null}\n```' }] }), { status: 200 });
  const reply = await askAiCoach("key", fakeContext, [], "?", fetchMock as any);
  assert.equal(reply.answer, "ОК");
  assert.equal(reply.mainRecommendation, null);
});

test("6.8: невалидный JSON от модели отклоняется, а не выдаётся как ответ", async () => {
  const fetchMock = async () => new Response(JSON.stringify({ content: [{ text: "просто текст без структуры" }] }), { status: 200 });
  await assert.rejects(() => askAiCoach("key", fakeContext, [], "?", fetchMock as any), AiCoachError);
});

test("6.8: ответ без обязательного поля answer отклоняется", async () => {
  const fetchMock = async () => new Response(JSON.stringify({ content: [{ text: '{"mainRecommendation":"X"}' }] }), { status: 200 });
  await assert.rejects(() => askAiCoach("key", fakeContext, [], "?", fetchMock as any), AiCoachError);
});

test("6.8: недоступность AI API обрабатывается безопасно, а не падает", async () => {
  const fetchMock = async () => new Response("", { status: 503 });
  await assert.rejects(() => askAiCoach("key", fakeContext, [], "?", fetchMock as any), AiCoachError);
});

test("6.8: сетевая ошибка/таймаут превращается в понятную ошибку, а не бросает исходное исключение", async () => {
  const fetchMock = async () => {
    throw new Error("network down");
  };
  await assert.rejects(() => askAiCoach("key", fakeContext, [], "?", fetchMock as any), AiCoachError);
});

test("6.11: дневной лимит использует серверную московскую дату", () => {
  const instant = new Date("2026-07-25T21:30:00Z");
  assert.equal(dateInTimeZone(instant), "2026-07-26");
});

test("6.11: квота резервируется атомарным шагом и возвращается после ошибки", () => {
  const values = new Map<string, string>();
  const store = {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => values.set(key, value),
  };
  assert.equal(reserveDailyQuota(store, DATE, 2), true);
  assert.equal(reserveDailyQuota(store, DATE, 2), true);
  assert.equal(reserveDailyQuota(store, DATE, 2), false);
  releaseDailyQuota(store, DATE);
  assert.equal(reserveDailyQuota(store, DATE, 2), true);
});
