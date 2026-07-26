import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExerciseProgression,
  canTransitionStatus,
  shouldSuppressRepeat,
  validateProgressionMatch,
  weightStep,
  type ProgressionWorkoutContext,
} from "../lib/progression-engine.ts";

const base = (overrides: Partial<ProgressionWorkoutContext> = {}): ProgressionWorkoutContext => ({
  exercise: "Жим гантелей лёжа",
  painAfter: 0,
  effort: "Нормально",
  workoutComplete: true,
  coachAction: "proceed",
  history: [],
  targetMaxReps: 12,
  ...overrides,
});

test("6.12: без сохранённой истории — no-change, а не выдуманное предложение", () => {
  const result = buildExerciseProgression(base({ history: [] }));
  assert.equal(result.action, "no-change");
  assert.equal(result.reasonCode, "no-history");
  assert.deepEqual(result.to, result.from);
});

test("6.12: одна запись без истории для сравнения — no-change", () => {
  const result = buildExerciseProgression(base({
    history: [{ date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" }],
  }));
  assert.equal(result.action, "no-change");
  assert.equal(result.reasonCode, "insufficient-history");
});

test("6.12: одинаковый вход всегда даёт одинаковый допустимый результат (детерминизм)", () => {
  const ctx = base({
    history: [
      { date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" },
      { date: "2026-07-18", weight: 10, reps: 12, difficulty: "Легко" },
    ],
  });
  const a = buildExerciseProgression(ctx);
  const b = buildExerciseProgression(ctx);
  assert.deepEqual(a, b);
});

test("6.12: два подряд «Легко» на верху диапазона повторов — increase на безопасный шаг", () => {
  const result = buildExerciseProgression(base({
    history: [
      { date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" },
      { date: "2026-07-18", weight: 10, reps: 12, difficulty: "Легко" },
    ],
  }));
  assert.equal(result.action, "increase");
  assert.equal(result.to.weight, 10 + weightStep("Жим гантелей лёжа", 10));
  assert.equal(result.to.reps, result.from.reps);
});

test("6.12: два подряд «Легко», но повторы ниже верха диапазона — increase не предлагается", () => {
  const result = buildExerciseProgression(base({
    targetMaxReps: 12,
    history: [
      { date: "2026-07-25", weight: 10, reps: 8, difficulty: "Легко" },
      { date: "2026-07-18", weight: 10, reps: 8, difficulty: "Легко" },
    ],
  }));
  assert.notEqual(result.action, "increase");
});

test("6.12: боль после тренировки блокирует увеличение", () => {
  const result = buildExerciseProgression(base({
    painAfter: 3,
    history: [
      { date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" },
      { date: "2026-07-18", weight: 10, reps: 12, difficulty: "Легко" },
    ],
  }));
  assert.notEqual(result.action, "increase");
  assert.equal(result.action, "maintain");
  assert.ok(result.usedSignals.some(s => s.includes("боль")));
});

test("6.12: незавершённая тренировка блокирует увеличение", () => {
  const result = buildExerciseProgression(base({
    workoutComplete: false,
    history: [
      { date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" },
      { date: "2026-07-18", weight: 10, reps: 12, difficulty: "Легко" },
    ],
  }));
  assert.equal(result.action, "maintain");
  assert.equal(result.reasonCode, "incomplete-hold");
});

test("6.12: щадящее решение Coach (reduce/replace/rest) блокирует увеличение", () => {
  for (const action of ["reduce", "replace", "rest"] as const) {
    const result = buildExerciseProgression(base({
      coachAction: action,
      history: [
        { date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" },
        { date: "2026-07-18", weight: 10, reps: 12, difficulty: "Легко" },
      ],
    }));
    assert.equal(result.action, "maintain", `action=${action}`);
    assert.equal(result.reasonCode, "coach-hold");
  }
});

test("6.12: тяжёлая боль (>=5) или сложность «Боль» — deload, не increase", () => {
  const byPain = buildExerciseProgression(base({ painAfter: 6, history: [{ date: "2026-07-25", weight: 20, reps: 10, difficulty: "Нормально" }] }));
  assert.equal(byPain.action, "deload");
  assert.ok(byPain.to.weight < byPain.from.weight);

  const byDifficulty = buildExerciseProgression(base({ history: [{ date: "2026-07-25", weight: 20, reps: 10, difficulty: "Боль" }] }));
  assert.equal(byDifficulty.action, "deload");
});

test("6.12: два подряд «Тяжело» без боли — decrease", () => {
  const result = buildExerciseProgression(base({
    history: [
      { date: "2026-07-25", weight: 20, reps: 10, difficulty: "Тяжело" },
      { date: "2026-07-18", weight: 20, reps: 10, difficulty: "Тяжело" },
    ],
  }));
  assert.equal(result.action, "decrease");
  assert.ok(result.to.weight < result.from.weight);
});

test("6.12: стабильные показатели без явного триггера — maintain", () => {
  const result = buildExerciseProgression(base({
    history: [
      { date: "2026-07-25", weight: 20, reps: 10, difficulty: "Нормально" },
      { date: "2026-07-18", weight: 20, reps: 10, difficulty: "Нормально" },
    ],
  }));
  assert.equal(result.action, "maintain");
  assert.equal(result.reasonCode, "steady-maintain");
});

test("6.12: гантели используют шаг 1 кг, тренажёры/штанга — 2.5 кг", () => {
  assert.equal(weightStep("Жим гантелей лёжа", 10), 1);
  assert.equal(weightStep("Жим от груди в тренажёре сидя", 10), 2.5);
  assert.equal(weightStep("Что угодно", 0), 1);
});

test("6.12 CoachMemory: не повторяет то же отклонённое предложение без новых данных", () => {
  const candidate = buildExerciseProgression(base({
    history: [
      { date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" },
      { date: "2026-07-18", weight: 10, reps: 12, difficulty: "Легко" },
    ],
  }));
  const rejectedSame = { status: "rejected" as const, action: candidate.action, reasonCode: candidate.reasonCode, from: candidate.from, to: candidate.to };
  assert.equal(shouldSuppressRepeat(rejectedSame, candidate), true);

  const rejectedDifferent = { status: "rejected" as const, action: "maintain" as const, reasonCode: "steady-maintain", from: candidate.from, to: candidate.from };
  assert.equal(shouldSuppressRepeat(rejectedDifferent, candidate), false);

  assert.equal(shouldSuppressRepeat(null, candidate), false);
  assert.equal(shouldSuppressRepeat({ status: "pending", action: candidate.action, reasonCode: candidate.reasonCode, from: candidate.from, to: candidate.to }, candidate), false);
});

test("6.12: серверная валидация отклоняет устаревшее/подменённое предложение", () => {
  const recomputed = buildExerciseProgression(base({
    history: [
      { date: "2026-07-25", weight: 10, reps: 12, difficulty: "Легко" },
      { date: "2026-07-18", weight: 10, reps: 12, difficulty: "Легко" },
    ],
  }));
  assert.equal(validateProgressionMatch({ action: recomputed.action, to: recomputed.to }, recomputed), true);
  assert.equal(validateProgressionMatch({ action: "increase", to: { weight: 999, reps: 12 } }, recomputed), false);
  assert.equal(validateProgressionMatch({ action: "maintain", to: recomputed.to }, recomputed), false);
});

test("6.12: защита от повторного применения — допустимые переходы статуса", () => {
  assert.equal(canTransitionStatus("pending", "accepted"), true);
  assert.equal(canTransitionStatus("pending", "rejected"), true);
  assert.equal(canTransitionStatus("accepted", "cancelled"), true);
  assert.equal(canTransitionStatus("accepted", "accepted"), false);
  assert.equal(canTransitionStatus("rejected", "accepted"), false);
  assert.equal(canTransitionStatus("cancelled", "accepted"), false);
  assert.equal(canTransitionStatus("pending", "cancelled"), false);
});
