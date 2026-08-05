import assert from "node:assert/strict";
import test from "node:test";
import { matchLapsToIntervals } from "../lib/swim/fit-match.ts";
import type { FitLap } from "../lib/fit-import-service.ts";
import type { SwimInterval, SwimWorkoutDef } from "../lib/swim/types.ts";

const interval = (over: Partial<SwimInterval> = {}): SwimInterval => ({
  id: "i1", type: "main_set", exerciseId: "freestyle", distanceMeters: 50, repeats: 2,
  description: "test", restSeconds: 20, targetPaceSecondsPer100: null, equipment: [], ...over,
});
const workout = (over: Partial<SwimWorkoutDef> = {}): SwimWorkoutDef => ({
  id: "w1", title: "Test workout", goal: "goal", level: "beginner", estimatedMinutes: 30,
  intervals: [interval()], ...over,
});
const lap = (distanceMeters: number, durationSeconds: number): FitLap => ({ distanceMeters, durationSeconds, numLengths: null });

test("количество лапов совпадает с планом — распределяет лапы по интервалам по порядку", () => {
  const w = workout({ intervals: [interval({ id: "warmup", distanceMeters: 100, repeats: 1 }), interval({ id: "main", distanceMeters: 50, repeats: 2 })] });
  const laps = [lap(100, 90), lap(50, 42), lap(50, 44)];
  const result = matchLapsToIntervals(w, laps);
  assert.ok(result.perInterval);
  assert.equal(result.perInterval!.length, 2);
  assert.equal(result.perInterval![0].actualMeters, 100);
  assert.equal(result.perInterval![0].lapCount, 1);
  assert.equal(result.perInterval![1].actualMeters, 100);
  assert.equal(result.perInterval![1].actualSeconds, 86);
  assert.equal(result.totalActualMeters, 200);
  assert.equal(result.totalActualSeconds, 176);
});

test("число лапов не совпадает с планом — только агрегат, без ложного распределения", () => {
  const w = workout({ intervals: [interval({ repeats: 4 })] });
  const laps = [lap(50, 40), lap(50, 41)];
  const result = matchLapsToIntervals(w, laps);
  assert.equal(result.perInterval, null);
  assert.equal(result.totalActualMeters, 100);
  assert.equal(result.totalActualSeconds, 81);
});

test("нет лапов — только агрегат (нулевой), без деления на ноль", () => {
  const w = workout();
  const result = matchLapsToIntervals(w, []);
  assert.equal(result.perInterval, null);
  assert.equal(result.totalActualMeters, 0);
  assert.equal(result.totalActualSeconds, 0);
});
