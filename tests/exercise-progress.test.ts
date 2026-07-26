import assert from "node:assert/strict";
import test from "node:test";
import { progressionDecision, targetReps, weightStep } from "../app/exercise-progress.ts";

test("targetReps: диапазон без подходов разбирается как раньше", () => {
  assert.deepEqual(targetReps("10–12"), [10, 12]);
  assert.deepEqual(targetReps("12 / рука"), [12, 12]);
  assert.deepEqual(targetReps("20–30 сек"), [20, 30]);
  assert.deepEqual(targetReps(""), [1, 99]);
});

test("targetReps: число подходов перед × не путается с диапазоном повторов", () => {
  assert.deepEqual(targetReps("3 × 10–12"), [10, 12]);
  assert.deepEqual(targetReps("2 × 12"), [12, 12]);
  assert.deepEqual(targetReps("2 × 12 / нога"), [12, 12]);
  assert.deepEqual(targetReps("2–3 × 12"), [12, 12]);
  assert.deepEqual(targetReps("3 × 30–45 сек"), [30, 45]);
});

test("weightStep: гантели — 1 кг, остальное — 2.5 кг, нулевой вес — 1 кг", () => {
  assert.equal(weightStep("Жим гантелей лёжа", 10), 1);
  assert.equal(weightStep("Жим от груди в тренажёре", 10), 2.5);
  assert.equal(weightStep("Что угодно", 0), 1);
});

test("progressionDecision: без истории — стартовая нагрузка", () => {
  const result = progressionDecision("Присед", "3 × 10–12", []);
  assert.equal(result.kind, "start");
});

test("progressionDecision: верх диапазона повторов при «Легко» с форматом «N × min–max» — предлагает вес", () => {
  const result = progressionDecision("Жим от груди в тренажёре", "3 × 10–12", [], { weight: 20, reps: 12, difficulty: "Легко" });
  assert.equal(result.kind, "weight");
  assert.match(result.text, /22\.5/);
});

test("progressionDecision: 8 из 10–12 при «Легко» — не переходит на вес раньше времени", () => {
  const result = progressionDecision("Жим от груди в тренажёре", "3 × 10–12", [], { weight: 20, reps: 8, difficulty: "Легко" });
  assert.equal(result.kind, "reps");
});

test("progressionDecision: сложность «Боль» — deload независимо от повторов", () => {
  const result = progressionDecision("Присед", "2 × 12", [], { weight: 40, reps: 12, difficulty: "Боль" });
  assert.equal(result.kind, "deload");
});
