// AI-1: weightStep консолидирован в lib/progression-engine.ts; app/exercise-progress.ts
// переиспользует его через re-export. Эти тесты фиксируют, что дублирования больше нет
// и что live-подсказка (app/exercise-progress.ts) не противоречит по направлению
// подтверждаемой прогрессии (lib/progression-engine.ts) для одних и тех же сигналов.
import assert from "node:assert/strict";
import test from "node:test";
import { buildExerciseProgression, weightStep as engineWeightStep, type ProgressionWorkoutContext } from "../lib/progression-engine.ts";
import { progressionDecision, weightStep as liveWeightStep } from "../app/exercise-progress.ts";

test("weightStep: app/exercise-progress.ts переиспользует ту же функцию, что и lib/progression-engine.ts", () => {
  assert.equal(liveWeightStep, engineWeightStep);
});

const base = (overrides: Partial<ProgressionWorkoutContext> = {}): ProgressionWorkoutContext => ({
  exercise: "Присед",
  painAfter: 0,
  effort: "Нормально",
  workoutComplete: true,
  coachAction: "proceed",
  history: [],
  targetMaxReps: 12,
  ...overrides,
});

test("нет противоречия: боль — оба источника указывают на снижение, а не на увеличение", () => {
  const live = progressionDecision("Присед", "3 × 10–12", [], { weight: 40, reps: 10, difficulty: "Боль" });
  const confirmable = buildExerciseProgression(base({
    history: [{ date: "2026-07-25", weight: 40, reps: 10, difficulty: "Боль" }],
  }));
  assert.equal(live.kind, "deload");
  assert.equal(confirmable.action, "deload");
});

test("нет противоречия: одна лёгкая тренировка — live допускает предложение веса, подтверждаемая прогрессия его не отклоняет (не decrease/deload)", () => {
  const live = progressionDecision("Присед", "3 × 10–12", [], { weight: 20, reps: 12, difficulty: "Легко" });
  const confirmable = buildExerciseProgression(base({
    history: [{ date: "2026-07-25", weight: 20, reps: 12, difficulty: "Легко" }],
  }));
  assert.equal(live.kind, "weight");
  // Подтверждаемое решение требует двух подряд «Легко» и здесь не увеличивает вес,
  // но и не идёт в противоположную сторону (decrease/deload) — противоречия по
  // направлению нет, только более консервативный порог.
  assert.ok(!["decrease", "deload"].includes(confirmable.action));
});

test("нет противоречия: два подряд «Тяжело» — оба источника не предлагают увеличение", () => {
  const live = progressionDecision("Присед", "3 × 10–12", [
    { exercise: "Присед", weight: 40, reps: 10, difficulty: "Тяжело" },
    { exercise: "Присед", weight: 40, reps: 10, difficulty: "Тяжело" },
  ]);
  const confirmable = buildExerciseProgression(base({
    history: [
      { date: "2026-07-25", weight: 40, reps: 10, difficulty: "Тяжело" },
      { date: "2026-07-18", weight: 40, reps: 10, difficulty: "Тяжело" },
    ],
  }));
  assert.notEqual(live.kind, "weight");
  assert.notEqual(confirmable.action, "increase");
});
