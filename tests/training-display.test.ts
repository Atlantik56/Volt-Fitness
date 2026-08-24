import assert from "node:assert/strict";
import test from "node:test";
import { trainingLabelRu } from "../lib/training-display.ts";

test("переводит канонические названия тренировок только для отображения", () => {
  assert.equal(trainingLabelRu("Strength A"), "Силовая тренировка А");
  assert.equal(trainingLabelRu("Swim — Main aerobic session"), "Плавание — аэробная тренировка");
  assert.equal(trainingLabelRu("Bike / Indoor Cycling"), "Велотренировка в зоне 2");
});

test("переводит упражнения Plan v2 и не меняет неизвестные пользовательские названия", () => {
  assert.equal(trainingLabelRu("Machine Chest Press"), "Жим от груди в тренажёре");
  assert.equal(trainingLabelRu("Pallof Press / safe core"), "Жим Паллофа для корпуса");
  assert.equal(trainingLabelRu("Моё упражнение"), "Моё упражнение");
});
