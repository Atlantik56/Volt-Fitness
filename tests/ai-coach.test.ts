import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { computeNutritionWeeklyStats, computeWeightWeeklyTrend } from "../lib/coach-weekly.ts";
import { buildAiCoachContext, renderAiCoachContextText } from "../lib/ai-context.ts";
import { askAiCoach, askMwsAiCoach, AiCoachError, SYSTEM_PROMPT, parseStructuredReply } from "../lib/ai-coach.ts";
import { askAiHub } from "../lib/ai-hub.ts";
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

test("контекст явно сообщает модели, включён ли бассейн (иначе модель гадает/отрицает его вслепую)", () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-07-24T12:00:00") }); // неделя 1
  try {
    const ctx1 = buildAiCoachContext({ date: DATE, profile: { programStart: "2026-07-21" }, measurements: [], foodLogs: [], workouts: [], wellnessLogs: [], activity: [] });
    assert.equal(ctx1.poolActive, false);
    assert.ok(renderAiCoachContextText(ctx1).includes("ещё не включён"));
  } finally { mock.timers.reset() }

  mock.timers.enable({ apis: ["Date"], now: new Date("2026-07-27T12:00:00") }); // неделя 2
  try {
    const ctx2 = buildAiCoachContext({ date: DATE, profile: { programStart: "2026-07-21" }, measurements: [], foodLogs: [], workouts: [], wellnessLogs: [], activity: [] });
    assert.equal(ctx2.poolActive, true);
    assert.ok(renderAiCoachContextText(ctx2).includes("уже включён"));
  } finally { mock.timers.reset() }
});

const fakeContext = buildAiCoachContext({ date: DATE, plan: null, profile: {}, measurements: [], foodLogs: [], workouts: [], wellnessLogs: [], activity: [] });

test("AI-10: оба провайдера получают правила только обоснованной конструктивной критики", async () => {
  let anthropicSystem = "";
  const anthropicFetch = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    anthropicSystem = body.system[0].text;
    return new Response(JSON.stringify({ content: [{ text: '{"answer":"Хороший обед","mainRecommendation":null}' }] }), { status: 200 });
  };
  await askAiCoach("key", fakeContext, [], "Съел обед с 41 г белка", anthropicFetch as any);

  let mwsSystem = "";
  const mwsFetch = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    mwsSystem = body.messages[0].content;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"Хороший обед","mainRecommendation":null}' } }] }), { status: 200 });
  };
  await askMwsAiCoach("key", "project1", "model1", fakeContext, [], "Съел обед с 41 г белка", mwsFetch as any);

  for (const prompt of [anthropicSystem, mwsSystem]) {
    assert.ok(prompt.includes("Критикуй только тогда"));
    assert.ok(prompt.includes("не выдавай незавершённую дневную цель за ошибку отдельного приёма пищи"));
    assert.ok(prompt.includes("40 г белка за обед"));
    assert.ok(prompt.includes("назови конкретный факт"));
    assert.ok(prompt.includes("один реалистичный следующий шаг"));
  }
  assert.equal(anthropicSystem, mwsSystem);
  // Тела запросов обоих провайдеров совпадают с реально экспортируемой
  // константой — тест ловит рассинхронизацию, если кто-то отредактирует
  // промпт в одной ветке кода и забудет про другую.
  assert.equal(anthropicSystem, SYSTEM_PROMPT);
  assert.equal(mwsSystem, SYSTEM_PROMPT);
});

test("AI-10 доработка: промпт запрещает критику ради критики и требует значимого отклонения", () => {
  assert.ok(SYSTEM_PROMPT.includes("Не ищи недостаток только ради замечания"));
  assert.ok(SYSTEM_PROMPT.includes("значимое отклонение от подходящего ориентира"));
  assert.ok(SYSTEM_PROMPT.includes("Если показатели находятся в разумной зоне, не ищи, что ещё покритиковать"));
});

test("AI-10 доработка: промпт запрещает стыд, обвинения и оценку личности", () => {
  assert.ok(SYSTEM_PROMPT.includes("без стыда, обвинений и оценки личности"));
});

test("AI-10 доработка: промпт запрещает LLM пересчитывать или изобретать показатели", () => {
  assert.ok(SYSTEM_PROMPT.includes("Не придумывай показатели, которых там нет"));
  assert.ok(SYSTEM_PROMPT.includes("Отвечай только на основе присланного контекста"));
});

test("AI-10 доработка: промпт требует учитывать погрешность оценочных порций и КБЖУ", () => {
  assert.ok(SYSTEM_PROMPT.includes("неопределённость оценочных порций и КБЖУ"));
});

test("AI-10 доработка: mainRecommendation остаётся одной строкой даже если модель прислала несколько пунктов", () => {
  const multiline = parseStructuredReply('{"answer":"ок","mainRecommendation":"Первый шаг\\nВторой шаг"}');
  assert.equal(multiline.mainRecommendation, "Первый шаг");
  const bulletList = parseStructuredReply('{"answer":"ок","mainRecommendation":"- Добавь овощей\\n- Пей больше воды"}');
  assert.equal(bulletList.mainRecommendation, "Добавь овощей");
  assert.equal(typeof multiline.mainRecommendation, "string");
});

test("AI-10 доработка: чрезмерно длинная mainRecommendation обрезается детерминированно", () => {
  const long = "а".repeat(500);
  const reply = parseStructuredReply(JSON.stringify({ answer: "ок", mainRecommendation: long }));
  assert.ok(reply.mainRecommendation!.length <= 200);
});

test("AI-10 доработка: формат AiCoachReply (answer/mainRecommendation/food) не изменился", async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ content: [{ text: '{"answer":"Для одного обеда 41 г белка — хороший результат. До дневной цели осталось 109 г.","mainRecommendation":"Добавь порцию овощей к следующему приёму","food":null}' }] }), { status: 200 });
  const reply = await askAiCoach("key", fakeContext, [], "Как у меня с белком за обед?", fetchMock as any);
  assert.deepEqual(Object.keys(reply).sort(), ["answer", "food", "mainRecommendation"]);
  assert.equal(typeof reply.answer, "string");
  assert.ok(reply.mainRecommendation === null || typeof reply.mainRecommendation === "string");
  assert.ok(reply.food === null || Array.isArray(reply.food));
});

test("AI-10 доработка: усиление правил не добавляет новых сетевых вызовов — по одному запросу на провайдера", async () => {
  let anthropicCalls = 0, mwsCalls = 0;
  const anthropicFetch = async () => { anthropicCalls++; return new Response(JSON.stringify({ content: [{ text: '{"answer":"ок","mainRecommendation":null}' }] }), { status: 200 }) };
  await askAiCoach("key", fakeContext, [], "Съел обед", anthropicFetch as any);
  assert.equal(anthropicCalls, 1);
  const mwsFetch = async () => { mwsCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"ок","mainRecommendation":null}' } }] }), { status: 200 }) };
  await askMwsAiCoach("key", "project1", "model1", fakeContext, [], "Съел обед", mwsFetch as any);
  assert.equal(mwsCalls, 1);
});

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

test("чат-коуч: описание еды разбирается в food, вопрос без еды даёт null", async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ content: [{ text: '{"answer":"Записал","mainRecommendation":null,"food":[{"name":"Омлет из 5 яиц","calories":400,"protein":33,"fat":28,"carbs":5}]}' }] }), { status: 200 });
  const reply = await askAiCoach("key", fakeContext, [], "Съел омлет из 5 яиц", fetchMock as any);
  assert.equal(reply.food?.length, 1);
  assert.equal(reply.food?.[0].name, "Омлет из 5 яиц");
  assert.equal(reply.food?.[0].calories, 400);
});

test("чат-коуч: food отсутствует в ответе — не ломает разбор, остаётся null", async () => {
  const fetchMock = async () => new Response(JSON.stringify({ content: [{ text: '{"answer":"Сегодня отдых","mainRecommendation":null}' }] }), { status: 200 });
  const reply = await askAiCoach("key", fakeContext, [], "Что по плану?", fetchMock as any);
  assert.equal(reply.food ?? null, null);
});

test("чат-коуч: мусорные элементы food (без названия или калорий) отфильтровываются", async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ content: [{ text: '{"answer":"ок","mainRecommendation":null,"food":[{"name":"","calories":100,"protein":1,"fat":1,"carbs":1},{"name":"Чай","calories":0,"protein":0,"fat":0,"carbs":0}]}' }] }), { status: 200 });
  const reply = await askAiCoach("key", fakeContext, [], "?", fetchMock as any);
  assert.equal(reply.food ?? null, null);
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

test("AI Hub: MWS использует OpenAI-совместимый endpoint и разбирает ответ",async()=>{
  let calledUrl="";
  let auth="";
  const fetchMock=async(url:string,init:RequestInit)=>{
    calledUrl=url;auth=String((init.headers as Record<string,string>).authorization);
    return new Response(JSON.stringify({choices:[{message:{content:'{"answer":"Резерв работает","mainRecommendation":null}'}}]}),{status:200});
  };
  const reply=await askMwsAiCoach("secret","project-avatar-aang5615","qwen3-6-35b-a3b",fakeContext,[],"?",fetchMock);
  assert.equal(reply.answer,"Резерв работает");
  assert.ok(calledUrl.endsWith("/projects/project-avatar-aang5615/openai/v1/chat/completions"));
  assert.equal(auth,"Bearer secret");
});

test("AI Hub: Anthropic остаётся основным, когда он доступен",async()=>{
  let mwsCalls=0;
  const reply=await askAiHub({anthropicKey:"a",mwsKey:"m",mwsProject:"p1",mwsModel:"m1"},fakeContext,[],"?","auto",{
    anthropic:async()=>({answer:"Anthropic",mainRecommendation:null}),
    mws:async()=>{mwsCalls++;return {answer:"MWS",mainRecommendation:null}},
  });
  assert.equal(reply.provider,"anthropic");
  assert.equal(reply.routeReason,"primary");
  assert.equal(mwsCalls,0);
});

test("AI Hub: при сбое Anthropic запрос автоматически уходит в MWS",async()=>{
  const reply=await askAiHub({anthropicKey:"a",mwsKey:"m",mwsProject:"p1",mwsModel:"m1"},fakeContext,[],"?","auto",{
    anthropic:async()=>{throw new AiCoachError("timeout",504)},
    mws:async()=>({answer:"MWS",mainRecommendation:"Резерв"}),
  });
  assert.equal(reply.provider,"mws");
  assert.equal(reply.routeReason,"fallback");
});

test("AI Hub: ошибка настройки не маскируется переключением провайдера",async()=>{
  let mwsCalls=0;
  await assert.rejects(()=>askAiHub({anthropicKey:"a",mwsKey:"m",mwsProject:"p1",mwsModel:"m1"},fakeContext,[],"?","auto",{
    anthropic:async()=>{throw new AiCoachError("bad request",400)},
    mws:async()=>{mwsCalls++;return {answer:"MWS",mainRecommendation:null}},
  }),AiCoachError);
  assert.equal(mwsCalls,0);
});

test("AI Hub: ручной выбор MWS не вызывает Anthropic",async()=>{
  let anthropicCalls=0;
  const reply=await askAiHub({anthropicKey:"a",mwsKey:"m",mwsProject:"p1",mwsModel:"m1"},fakeContext,[],"?","mws",{
    anthropic:async()=>{anthropicCalls++;return {answer:"Anthropic",mainRecommendation:null}},
    mws:async()=>({answer:"MWS вручную",mainRecommendation:null}),
  });
  assert.equal(reply.provider,"mws");
  assert.equal(reply.answer,"MWS вручную");
  assert.equal(anthropicCalls,0);
});

test("AI Hub: консилиум делает ровно по одному короткому вызову каждой модели",async()=>{
  let anthropicCalls=0,mwsCalls=0,reviewPrompt="";
  const reply=await askAiHub({anthropicKey:"a",mwsKey:"m",mwsProject:"p1",mwsModel:"m1"},fakeContext,[],"Можно тренироваться?","consensus",{
    anthropic:async()=>{anthropicCalls++;return {answer:"Черновик",mainRecommendation:"Отдохни"}},
    mws:async(_key,_project,_model,_context,_history,question)=>{mwsCalls++;reviewPrompt=question;return {answer:"Итог",mainRecommendation:"Отдохни"}},
  });
  assert.equal(reply.provider,"anthropic+mws");
  assert.equal(reply.routeReason,"consensus");
  assert.equal(anthropicCalls,1);
  assert.equal(mwsCalls,1);
  assert.ok(reviewPrompt.includes("Черновик"));
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
