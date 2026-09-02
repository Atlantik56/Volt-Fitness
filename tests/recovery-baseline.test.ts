import assert from "node:assert/strict";
import test from "node:test";
import {
  BASELINE_WINDOW_DAYS, MIN_BASELINE_DAYS,
  buildRecoveryBaseline, evaluateRecoveryLimiter, type RecoverySample,
} from "../lib/recovery-baseline.ts";

const hours = (h: number) => Math.round(h * 3600);
const sample = (date: string, sleepH: number | null, hrv: number | null = 25, rhr: number | null = 75): RecoverySample =>
  ({ date, sleepSeconds: sleepH === null ? null : hours(sleepH), hrvRmssd: hrv, restingHr: rhr });

/** Реальный профиль владельца: сон стабильно короткий, 3.3–5.5 ч. */
const shortSleeper = (days: number) =>
  Array.from({ length: days }, (_, i) => sample(`2026-08-${String(i + 1).padStart(2, "0")}`, 4.5, 25, 75));

test("baseline uses the median so one bad night does not move the norm", () => {
  const samples = [...shortSleeper(9), sample("2026-08-10", 0.5, 25, 75)];
  const baseline = buildRecoveryBaseline(samples);
  assert.equal(baseline.sleepHours, 4.5);
  assert.equal(baseline.days, 10);
  assert.equal(baseline.sufficient, true);
});

test("a chronically short sleeper is NOT blocked at their own normal", () => {
  // Суть AI-13: 4.5 ч — мало по абсолютной мерке, но это личная норма.
  // Абсолютный порог блокировал бы рост каждый день; относительный — нет.
  const baseline = buildRecoveryBaseline(shortSleeper(14));
  const limiter = evaluateRecoveryLimiter(sample("2026-09-01", 4.5), baseline);
  assert.equal(limiter.allowGrowth, true);
  assert.equal(limiter.reasonCode, "recovery-normal");
});

test("a real drop below the personal baseline blocks growth", () => {
  const baseline = buildRecoveryBaseline(shortSleeper(14));
  const limiter = evaluateRecoveryLimiter(sample("2026-09-01", 2.5), baseline);
  assert.equal(limiter.allowGrowth, false);
  assert.equal(limiter.reasonCode, "recovery-below-baseline");
  assert.match(limiter.usedSignals.join(" "), /сон 2\.5 ч против обычных 4\.5 ч/);
});

test("the limiter never reduces the plan — it only withholds growth", () => {
  const baseline = buildRecoveryBaseline(shortSleeper(14));
  const limiter = evaluateRecoveryLimiter(sample("2026-09-01", 2.0, 12, 95), baseline);
  assert.equal(limiter.allowGrowth, false);
  // В контракте нет поля, которым можно было бы снизить нагрузку.
  assert.equal("reduce" in limiter, false);
  assert.match(limiter.reason, /текущую оставляем/);
});

test("HRV and resting HR each trigger on their own, and are reported", () => {
  const baseline = buildRecoveryBaseline(shortSleeper(14));
  const lowHrv = evaluateRecoveryLimiter(sample("2026-09-01", 4.5, 15, 75), baseline);
  assert.equal(lowHrv.allowGrowth, false);
  assert.match(lowHrv.usedSignals.join(" "), /ВСР 15 против обычных 25/);

  const highRhr = evaluateRecoveryLimiter(sample("2026-09-01", 4.5, 25, 95), baseline);
  assert.equal(highRhr.allowGrowth, false);
  assert.match(highRhr.usedSignals.join(" "), /пульс покоя 95 против обычных 75/);
});

test("an insufficient baseline allows growth instead of blocking on ignorance", () => {
  const baseline = buildRecoveryBaseline(shortSleeper(MIN_BASELINE_DAYS - 1));
  assert.equal(baseline.sufficient, false);
  const limiter = evaluateRecoveryLimiter(sample("2026-09-01", 1.0), baseline);
  assert.equal(limiter.allowGrowth, true);
  assert.equal(limiter.reasonCode, "baseline-insufficient");
  assert.equal(limiter.limitedData, true);
});

test("a missing day is reported as no data rather than as a bad day", () => {
  const baseline = buildRecoveryBaseline(shortSleeper(14));
  const limiter = evaluateRecoveryLimiter(null, baseline);
  assert.equal(limiter.allowGrowth, true);
  assert.equal(limiter.reasonCode, "no-data-today");
  assert.equal(limiter.limitedData, true);
});

test("days without metrics do not count towards baseline sufficiency", () => {
  const samples = [...shortSleeper(5), ...Array.from({ length: 20 }, (_, i) => sample(`2026-07-${String(i + 1).padStart(2, "0")}`, null, null, null))];
  const baseline = buildRecoveryBaseline(samples);
  assert.equal(baseline.days, 5);
  assert.equal(baseline.sufficient, false);
});

test("the baseline window is a month, long enough to survive a bad week", () => {
  assert.equal(BASELINE_WINDOW_DAYS, 28);
  assert.ok(BASELINE_WINDOW_DAYS > MIN_BASELINE_DAYS);
});
