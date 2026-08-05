import assert from "node:assert/strict";
import test from "node:test";
import { buildConfirmationExercises, buildIntervalSteps, buildSwimSnapshot, intervalTotalMeters, totalDistanceMeters } from "../lib/swim/workout-engine.ts";
import { swimWorkoutPlanKey } from "../lib/swim/workout-plan-key.ts";
import { getProgram } from "../lib/swim/program-engine.ts";
import type { SwimInterval, SwimProgramDef, SwimWorkoutDef } from "../lib/swim/types.ts";

const interval = (over: Partial<SwimInterval> = {}): SwimInterval => ({
  id: "i1", type: "main_set", exerciseId: "freestyle", distanceMeters: 100, repeats: 4,
  description: "test", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [], ...over,
});
const workout = (over: Partial<SwimWorkoutDef> = {}): SwimWorkoutDef => ({
  id: "w1", title: "Test workout", goal: "goal", level: "beginner", estimatedMinutes: 30,
  intervals: [interval()], ...over,
});
const program = (over: Partial<SwimProgramDef> = {}): SwimProgramDef => ({
  id: "p1", name: "Test program", description: "d", level: "beginner", status: "available", version: 1,
  weeks: [], ...over,
});

test("intervalTotalMeters умножает дистанцию на количество повторов", () => {
  assert.equal(intervalTotalMeters(interval({ distanceMeters: 50, repeats: 4 })), 200);
  assert.equal(intervalTotalMeters(interval({ distanceMeters: 100, repeats: 1 })), 100);
});

test("totalDistanceMeters суммирует все интервалы тренировки", () => {
  const w = workout({ intervals: [interval({ distanceMeters: 200, repeats: 1 }), interval({ distanceMeters: 50, repeats: 4 })] });
  assert.equal(totalDistanceMeters(w), 400);
});

test("buildSwimSnapshot производит валидный snapshot с версией программы в type", () => {
  const snapshot = buildSwimSnapshot(program({ version: 2 }), workout());
  assert.ok(snapshot);
  assert.equal(snapshot?.type, "Плавание v2");
  assert.equal(snapshot?.exercises.length, 1);
});

test("swimWorkoutPlanKey стабилен для одинаковой программы/тренировки и меняется с версией", () => {
  const p1 = program({ version: 1 });
  const p2 = program({ version: 2 });
  const w = workout();
  const key1a = swimWorkoutPlanKey(p1, w);
  const key1b = swimWorkoutPlanKey(p1, w);
  const key2 = swimWorkoutPlanKey(p2, w);
  assert.ok(key1a);
  assert.equal(key1a, key1b);
  assert.notEqual(key1a, key2);
});

test("buildIntervalSteps разворачивает каждый повтор в отдельный отрезок", () => {
  const w = workout({ intervals: [interval({ distanceMeters: 100, repeats: 2 }), interval({ id: "i2", distanceMeters: 50, repeats: 1 })] });
  const steps = buildIntervalSteps(w);
  assert.equal(steps.length, 3);
  assert.equal(steps[0].index, 0);
  assert.equal(steps[0].total, 3);
  assert.equal(steps[0].totalMeters, 100);
  assert.equal(steps[1].repeatIndex, 1);
  assert.equal(steps[2].totalMeters, 50);
});

test("buildConfirmationExercises кодирует дистанцию интервала в reps набора", () => {
  const w = workout({ intervals: [interval({ distanceMeters: 100, repeats: 4 })] });
  const exercises = buildConfirmationExercises(w);
  assert.equal(exercises.length, 1);
  assert.equal(exercises[0].sets[0].reps, 400);
  assert.equal(exercises[0].skipped, false);
});

test("реальная программа foundation даёт валидный planKey для каждой тренировки", () => {
  const foundation = getProgram("foundation");
  assert.ok(foundation);
  for (const week of foundation!.weeks) {
    for (const day of week.days) {
      if (!day.workout) continue;
      const key = swimWorkoutPlanKey(foundation!, day.workout);
      assert.ok(key, `нет planKey для ${day.workout.id}`);
    }
  }
});
