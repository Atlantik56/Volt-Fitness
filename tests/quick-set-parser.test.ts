import assert from "node:assert/strict";
import test from "node:test";
import { parseCompactSets } from "../lib/quick-set-parser.ts";

test("AI-9: базовый компактный ввод «45×8, 45×8, 45×7» разбирается в три подхода", () => {
  const result = parseCompactSets("45×8, 45×8, 45×7");
  assert.equal(result.ok, true);
  assert.deepEqual((result as any).sets, [{ weight: 45, reps: 8 }, { weight: 45, reps: 8 }, { weight: 45, reps: 7 }]);
});

test("AI-9: латинская x, кириллическая х и заглавные буквы принимаются одинаково", () => {
  for (const sep of ["x", "х", "X", "Х", "×"]) {
    const result = parseCompactSets(`45${sep}8`);
    assert.equal(result.ok, true, `разделитель "${sep}" должен приниматься`);
    assert.deepEqual((result as any).sets, [{ weight: 45, reps: 8 }]);
  }
});

test("AI-9: разделители подходов — запятая, точка с запятой, перенос строки", () => {
  assert.deepEqual((parseCompactSets("45×8; 46×7") as any).sets, [{ weight: 45, reps: 8 }, { weight: 46, reps: 7 }]);
  assert.deepEqual((parseCompactSets("45×8\n46×7") as any).sets, [{ weight: 45, reps: 8 }, { weight: 46, reps: 7 }]);
});

test("AI-9: дробный вес через точку", () => {
  const result = parseCompactSets("42.5×8");
  assert.equal(result.ok, true);
  assert.deepEqual((result as any).sets, [{ weight: 42.5, reps: 8 }]);
});

test("AI-9: дробный вес через запятую без пробела не путается с разделителем подходов", () => {
  const result = parseCompactSets("42,5×8, 43×7");
  assert.equal(result.ok, true);
  assert.deepEqual((result as any).sets, [{ weight: 42.5, reps: 8 }, { weight: 43, reps: 7 }]);
});

test("AI-9: собственный вес — вес 0 допустим", () => {
  const result = parseCompactSets("0×12, 0×10");
  assert.equal(result.ok, true);
  assert.deepEqual((result as any).sets, [{ weight: 0, reps: 12 }, { weight: 0, reps: 10 }]);
});

test("AI-9: пустой ввод даёт понятную ошибку, а не пустой результат", () => {
  const result = parseCompactSets("   ");
  assert.equal(result.ok, false);
  assert.match((result as any).error, /Введите/);
});

test("AI-9: некорректная строка отклоняется с понятной ошибкой, не отправляя данные", () => {
  const result = parseCompactSets("сорок пять на восемь");
  assert.equal(result.ok, false);
  assert.match((result as any).error, /Не удалось разобрать/);
});

test("AI-9: вес и повторы вне допустимого диапазона отклоняются", () => {
  assert.equal(parseCompactSets("999×8").ok, false);
  assert.equal(parseCompactSets("45×-1").ok, false);
});

test("AI-9: больше 20 подходов отклоняется", () => {
  const many = Array.from({ length: 21 }, () => "45×8").join(", ");
  const result = parseCompactSets(many);
  assert.equal(result.ok, false);
  assert.match((result as any).error, /Слишком много/);
});

test("AI-9: одна некорректная строка среди валидных отклоняет весь ввод (не отправляет частично разобранные данные)", () => {
  const result = parseCompactSets("45×8, мусор, 45×7");
  assert.equal(result.ok, false);
});
