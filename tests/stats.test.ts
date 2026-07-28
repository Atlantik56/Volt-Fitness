import assert from "node:assert/strict";
import test from "node:test";
import { avg, round1, daysBetween } from "../lib/stats.ts";

test("avg: пустой массив даёт null, а не NaN", () => {
  assert.equal(avg([]), null);
});

test("avg: один элемент возвращает сам элемент", () => {
  assert.equal(avg([42]), 42);
});

test("avg: несколько элементов — простое среднее", () => {
  assert.equal(avg([1, 2, 3]), 2);
});

test("avg: дробные и отрицательные значения", () => {
  assert.equal(avg([-1, 1]), 0);
  assert.equal(avg([0.1, 0.2]), 0.15000000000000002);
  assert.equal(avg([-4, -2]), -3);
});

test("round1: округляет до одного знака", () => {
  assert.equal(round1(1.24), 1.2);
  assert.equal(round1(1.25), 1.3);
  assert.equal(round1(1.05), 1.1);
});

test("round1: целые значения не меняются", () => {
  assert.equal(round1(5), 5);
  assert.equal(round1(0), 0);
});

test("round1: отрицательные значения около нуля не дают -0", () => {
  assert.equal(round1(-0.04), 0);
  assert.equal(Object.is(round1(-0.04), -0), false);
  assert.equal(round1(-1.24), -1.2);
});

test("daysBetween: одинаковые даты — 0", () => {
  assert.equal(daysBetween("2026-07-28", "2026-07-28"), 0);
});

test("daysBetween: соседние даты — 1, порядок аргументов задаёт знак", () => {
  assert.equal(daysBetween("2026-07-28", "2026-07-29"), 1);
  assert.equal(daysBetween("2026-07-29", "2026-07-28"), -1);
});

test("daysBetween: переход месяца и года считается по календарным суткам", () => {
  assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
  assert.equal(daysBetween("2025-12-31", "2026-01-01"), 1);
});

test("daysBetween: некорректная дата даёт null, а не NaN", () => {
  assert.equal(daysBetween("не дата", "2026-07-28"), null);
  assert.equal(daysBetween("2026-07-28", "тоже не дата"), null);
  assert.equal(daysBetween("", ""), null);
});

test("daysBetween: не зависит от текущей временной зоны — считает от UTC-полночи", () => {
  // Если бы даты парсились в локальной зоне, соседние сутки могли бы не давать
  // ровно 1 в зонах со сдвигом относительно UTC. Проверяем стабильный контракт.
  assert.equal(daysBetween("2026-03-28", "2026-03-29"), 1);
});
