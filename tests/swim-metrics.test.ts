import assert from "node:assert/strict";
import test from "node:test";
import { computeSwimPeriodMetrics, formatDuration, formatKm, formatMeters, formatPace100m, weeklyVolumeMeters } from "../lib/swim-metrics.ts";

test("formatMeters округляет и требует положительное значение", () => {
  assert.equal(formatMeters(650), "650 м");
  assert.equal(formatMeters(650.6), "651 м");
  assert.equal(formatMeters(0), null);
  assert.equal(formatMeters(-10), null);
  assert.equal(formatMeters(NaN), null);
});

test("formatKm форматирует километры с запятой", () => {
  assert.equal(formatKm(3200), "3,2 км");
  assert.equal(formatKm(1000), "1,0 км");
  assert.equal(formatKm(0), null);
});

test("formatDuration даёт mm:ss или h:mm:ss", () => {
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(formatDuration(0), null);
  assert.equal(formatDuration(-5), null);
});

test("formatPace100m считает темп только при валидной дистанции и длительности", () => {
  // 1000 м за 1000 сек = 100 сек/100м = 1:40
  assert.equal(formatPace100m(1000, 1000), "1:40");
  assert.equal(formatPace100m(0, 1000), null);
  assert.equal(formatPace100m(1000, 0), null);
  assert.equal(formatPace100m(-100, 1000), null);
  assert.equal(formatPace100m(NaN, 1000), null);
  // Не должен вернуть Infinity/NaN при нулевой дистанции
  assert.notEqual(formatPace100m(0, 0), "Infinity");
});

test("weeklyVolumeMeters суммирует только положительные значения", () => {
  assert.equal(weeklyVolumeMeters([{ distanceMeters: 500 }, { distanceMeters: 800 }]), 1300);
  assert.equal(weeklyVolumeMeters([{ distanceMeters: 0 }, { distanceMeters: -50 }]), 0);
  assert.equal(weeklyVolumeMeters([]), 0);
});

test("computeSwimPeriodMetrics считает период и сравнение детерминированно", () => {
  const result = computeSwimPeriodMetrics([
    { date: "2026-07-05", distanceMeters: 500, durationSeconds: 600, avgHeartRate: 120, calories: 150 },
    { date: "2026-08-05", distanceMeters: 1000, durationSeconds: 1200, avgHeartRate: 130, calories: 250 },
    { date: "2026-08-06", distanceMeters: 1500, durationSeconds: 1500, avgHeartRate: 140, calories: 0 },
  ], "30d", "2026-08-06");
  assert.equal(result.workoutCount, 2);
  assert.equal(result.distanceMeters, 2500);
  assert.equal(result.durationSeconds, 2700);
  assert.equal(result.avgHeartRate, 135);
  assert.equal(result.calories, 250);
  assert.equal(result.avgPaceLabel, "1:48");
  assert.equal(result.averageDistanceMeters, 1250);
  assert.equal(result.distanceDeltaPercent, 400);
});

test("computeSwimPeriodMetrics не выдумывает отсутствующие средние", () => {
  const result = computeSwimPeriodMetrics([
    { date: "2026-08-06", distanceMeters: 0, durationSeconds: 900, avgHeartRate: 0, calories: 0 },
  ], "30d", "2026-08-06");
  assert.equal(result.avgPaceLabel, null);
  assert.equal(result.avgHeartRate, null);
  assert.equal(result.calories, null);
  assert.equal(result.averageDistanceMeters, null);
  assert.equal(result.distanceDeltaPercent, null);
  assert.deepEqual(result.volume, []);
});
