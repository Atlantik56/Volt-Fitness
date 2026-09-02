import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAN_V3_PROGRAM_VERSION, PLAN_V4_EFFECTIVE_WEEK, PLAN_V4_LAST_DEFINED_WEEK,
  PLAN_V4_PROGRAM_VERSION, VOLT_PROGRAM_ID,
} from "../lib/training-program/definitions.ts";
import { resolveTrainingVersionWeek } from "../lib/training-program/registry.ts";

const weekOf = (index: number, version = PLAN_V4_PROGRAM_VERSION) =>
  (resolveTrainingVersionWeek(VOLT_PROGRAM_ID, version, index) as any).week;
const training = (index: number) =>
  weekOf(index).sessions.filter((s: any) => s.discipline !== "recovery");
const countBy = (index: number, discipline: string) =>
  training(index).filter((s: any) => s.discipline === discipline).length;

test("every week holds two swims, two rides and two strength sessions", () => {
  for (let w = PLAN_V4_EFFECTIVE_WEEK; w <= PLAN_V4_LAST_DEFINED_WEEK; w++) {
    assert.equal(countBy(w, "swim"), 2, `неделя ${w}: плавания`);
    assert.equal(countBy(w, "bike"), 2, `неделя ${w}: вело`);
    assert.equal(countBy(w, "strength"), 2, `неделя ${w}: силовые`);
  }
});

test("Saturday is always a mandatory ride", () => {
  for (let w = PLAN_V4_EFFECTIVE_WEEK; w <= PLAN_V4_LAST_DEFINED_WEEK; w++) {
    const saturday = weekOf(w).sessions.filter((s: any) => s.day === 6);
    assert.equal(saturday.length, 1, `неделя ${w}: одна сессия в субботу`);
    assert.equal(saturday[0].discipline, "bike");
    assert.equal(saturday[0].required, true, `неделя ${w}: суббота обязательна`);
  }
});

test("no day is ever doubled up — the v3 Monday stacking is gone", () => {
  for (let w = PLAN_V4_EFFECTIVE_WEEK; w <= PLAN_V4_LAST_DEFINED_WEEK; w++) {
    const perDay = new Map<number, number>();
    for (const s of weekOf(w).sessions as any[]) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);
    for (const [day, count] of perDay) assert.equal(count, 1, `неделя ${w}, день ${day}`);
  }
  // В Плане 3.0 понедельник нёс силовую и плавание одновременно.
  const v3Monday = weekOf(9, PLAN_V3_PROGRAM_VERSION).sessions.filter((s: any) => s.day === 1);
  assert.equal(v3Monday.length, 2, "исходная сдвоенность v3 зафиксирована для сравнения");
});

test("Friday swim is mandatory but declares an explicit cycling alternative", () => {
  const optional = training(PLAN_V4_EFFECTIVE_WEEK).filter((s: any) => !s.required);
  assert.equal(optional.length, 0);
  const friday = training(PLAN_V4_EFFECTIVE_WEEK).find((s: any) => s.day === 5);
  assert.equal(friday.discipline, "swim");
  assert.equal(friday.alternatives.length, 1);
  assert.equal(friday.alternatives[0].discipline, "bike");
});

test("Friday alternates aerobic and endurance roles by cycle week", () => {
  assert.equal(training(17).find((s: any) => s.day === 5).role, "aerobic");
  assert.equal(training(18).find((s: any) => s.day === 5).role, "endurance");
  assert.equal(training(19).find((s: any) => s.day === 5).role, "aerobic");
});

test("the long ride grows across the cycle while the cycle ends in a deload", () => {
  const minutes = (w: number) => training(w).find((s: any) => s.day === 6)!.estimatedDuration.minMinutes;
  assert.ok(minutes(17) < minutes(20), "адаптация короче развития");
  assert.ok(minutes(20) < minutes(23), "развитие короче пиковой недели");
  assert.ok(minutes(24) < minutes(23), "последняя неделя — разгрузка");
});

test("the cycle ends with an FTP test, otherwise zones stay a word without a number", () => {
  const wednesday = (w: number) => training(w).find((s: any) => s.day === 3)!;
  assert.match(wednesday(PLAN_V4_LAST_DEFINED_WEEK).title, /тест FTP/);
  assert.doesNotMatch(wednesday(PLAN_V4_EFFECTIVE_WEEK).title, /тест FTP/);
});

test("plan v3 is untouched — its history stays valid", () => {
  const v3 = weekOf(9, PLAN_V3_PROGRAM_VERSION);
  assert.equal(v3.sessions.filter((s: any) => s.discipline === "swim").length, 3);
  assert.equal(v3.sessions.filter((s: any) => s.day === 6)[0].discipline, "recovery", "суббота v3 осталась отдыхом");
});
