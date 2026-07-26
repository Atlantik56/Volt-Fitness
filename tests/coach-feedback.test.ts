import assert from "node:assert/strict";
import test from "node:test";
import { buildPostWorkoutFeedback } from "../lib/coach-feedback.ts";

const base = () => ({ effort: "Нормально", painAfter: 0, streak: 1, planType: "Силовая", planTitle: "Гантели по кругу" });

test("6.13: боль после тренировки — заботливый тон, а не похвала, и без диагноза", () => {
  const text = buildPostWorkoutFeedback({ ...base(), painAfter: 6 });
  assert.match(text, /6\/10/);
  assert.match(text, /врачу/);
});

test("6.13: боль имеет приоритет над высоким усилием и серией", () => {
  const text = buildPostWorkoutFeedback({ ...base(), effort: "Тяжело", streak: 5, painAfter: 7 });
  assert.match(text, /7\/10/);
});

test("6.13: тяжёлая тренировка без боли признаёт усилие, не хвалит результат", () => {
  const text = buildPostWorkoutFeedback({ ...base(), effort: "Тяжело" });
  assert.match(text, /Тяжело/);
});

test("6.13: лёгкая тренировка — короткая нейтральная реплика", () => {
  const text = buildPostWorkoutFeedback({ ...base(), effort: "Легко" });
  assert.match(text, /Легко/);
});

test("6.13: серия дней подряд упоминается только реальным числом, без боли и высокого усилия", () => {
  const text = buildPostWorkoutFeedback({ ...base(), streak: 4 });
  assert.match(text, /4-й день подряд/);
});

test("6.13: без боли, без выраженного усилия и без серии — спокойное закрытие по типу плана", () => {
  const strength = buildPostWorkoutFeedback({ ...base(), streak: 1, planType: "Силовая" });
  const cardio = buildPostWorkoutFeedback({ ...base(), streak: 1, planType: "Кардио", planTitle: "Ходьба или велосипед" });
  const rest = buildPostWorkoutFeedback({ ...base(), streak: 1, planType: "Отдых", planTitle: "Полный отдых" });
  assert.notEqual(strength, cardio);
  assert.notEqual(cardio, rest);
});

test("6.13: одинаковый вход даёт одинаковый результат (детерминизм)", () => {
  const input = { ...base(), effort: "Тяжело", painAfter: 2, streak: 6 };
  assert.equal(buildPostWorkoutFeedback(input), buildPostWorkoutFeedback(input));
});
