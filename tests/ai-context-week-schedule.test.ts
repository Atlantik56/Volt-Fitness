import assert from "node:assert/strict";
import test from "node:test";
import { buildAiCoachContext, renderAiCoachContextText } from "../lib/ai-context.ts";

const BASE = { date: "2026-06-01", ready: true, plan: { title: "Бассейн", type: "Кардио" } };

test("planChanged=false — контекст не упоминает исходный план вовсе", () => {
  const ctx = buildAiCoachContext(BASE as any);
  assert.equal(ctx.planChanged, false);
  assert.equal(ctx.originalPlan, null);
  const text = renderAiCoachContextText(ctx);
  assert.ok(!text.includes("изменил план"));
});

test("planChanged=true передаёт и исходный, и актуальный план с причиной", () => {
  const ctx = buildAiCoachContext({
    ...BASE,
    originalPlan: { title: "Гантели по кругу", type: "Силовая" },
    planChanged: true,
    changeReasonCode: "no_equipment",
  } as any);
  assert.equal(ctx.planChanged, true);
  assert.deepEqual(ctx.originalPlan, { title: "Гантели по кругу", type: "Силовая" });
  assert.equal(ctx.changeReasonCode, "no_equipment");
  const text = renderAiCoachContextText(ctx);
  assert.ok(text.includes("Гантели по кругу"));
  assert.ok(text.includes("Бассейн"));
  assert.ok(text.includes("нет оборудования"));
});

test("planChanged=true без причины явно говорит 'не придумывай', а не подставляет догадку", () => {
  const ctx = buildAiCoachContext({
    ...BASE,
    originalPlan: { title: "Гантели по кругу", type: "Силовая" },
    planChanged: true,
    changeReasonCode: "",
  } as any);
  const text = renderAiCoachContextText(ctx);
  assert.ok(text.includes("не придумывай"));
});

test("изменённая и выполненная тренировка не считается пропуском исходного плана", () => {
  // Coach считает выполненным то, что совпадает с ПЕРЕДАННЫМ (актуальным) планом —
  // если вызывающая сторона передаёт scheduled-план (см. app/page.tsx todayPlan),
  // тренировка по нему не помечается как невыполненная, даже если план был изменён.
  const ctx = buildAiCoachContext({
    date: "2026-06-01", ready: true,
    plan: { title: "Бассейн", type: "Кардио" },
    originalPlan: { title: "Гантели по кругу", type: "Силовая" },
    planChanged: true,
    workouts: [{ date: "2026-06-01", type: "Кардио", title: "Бассейн" }],
  } as any);
  assert.equal(ctx.coachDecision?.action, "complete");
});
