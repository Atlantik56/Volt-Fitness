import assert from "node:assert/strict";
import test from "node:test";
import { computeSwimPeriodMetrics, computeSwimRecords, formatDuration, formatKm, formatMeters, formatPace100m, weeklyVolumeMeters } from "../lib/swim-metrics.ts";

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

test("computeSwimRecords детерминированно считает lifetime, рекорды и календарные достижения", () => {
  const result = computeSwimRecords([
    { id: 1, date: "2026-07-31", title: "Июль", distanceMeters: 500, durationSeconds: 900, avgHeartRate: 0, calories: 100 },
    { id: 2, date: "2026-08-01", title: "Первый", distanceMeters: 900, durationSeconds: 1500, avgHeartRate: 120, calories: 180 },
    { id: 3, date: "2026-08-02", title: "Быстрый", distanceMeters: 900, durationSeconds: 1200, avgHeartRate: 135, calories: 220 },
    { id: 4, date: "2026-08-04", title: "Длинный", distanceMeters: 1200, durationSeconds: 2400, avgHeartRate: 128, calories: 0 },
    { id: 5, date: "2026-08-04", title: "Второй за день", distanceMeters: 300, durationSeconds: 600, avgHeartRate: 0, calories: 60 },
  ], "2026-08-06");

  assert.equal(result.totalDistanceMeters, 3800);
  assert.equal(result.totalSwims, 5);
  assert.equal(result.totalDurationSeconds, 6600);
  assert.equal(result.firstSwimDate, "2026-07-31");
  assert.equal(result.largestSwim?.id, 4);
  assert.equal(result.fastestPace?.id, 3);
  assert.equal(result.longestDuration?.id, 4);
  assert.equal(result.highestHeartRate?.value, 135);
  assert.equal(result.mostCalories?.value, 220);
  assert.equal(result.longestWeek?.value, 2300);
  assert.equal(result.longestMonth?.value, 3300);
  assert.equal(result.mostActiveMonth?.swimCount, 4);
  assert.equal(result.longestStreakDays, 3);
  assert.equal(result.bestTrainingDay?.value, 1500);
  assert.equal(result.averageDistanceMeters, 760);
  assert.equal(result.periodBest.week.record?.id, 4);
  assert.equal(result.periodBest.month.record?.id, 4);
});

test("computeSwimRecords честно возвращает null для отсутствующих метрик", () => {
  const result = computeSwimRecords([
    { id: 1, date: "2026-08-03", title: "Без метрик", distanceMeters: 0, durationSeconds: 0, avgHeartRate: 0, calories: 0 },
  ], "2026-08-06");
  assert.equal(result.totalDistanceMeters, null);
  assert.equal(result.totalDurationSeconds, null);
  assert.equal(result.largestSwim, null);
  assert.equal(result.fastestPace, null);
  assert.equal(result.highestHeartRate, null);
  assert.equal(result.mostCalories, null);
  assert.equal(result.longestWeek, null);
  assert.equal(result.averageDistanceMeters, null);
  assert.equal(result.longestStreakDays, 1);
  assert.equal(result.periodBest.week.swimCount, 1);
});

test("computeSwimRecords разрешает ничью в пользу более свежего лога", () => {
  const result = computeSwimRecords([
    { id: 1, date: "2026-08-02", title: "Раньше", distanceMeters: 900, durationSeconds: 1200, avgHeartRate: 120, calories: 100 },
    { id: 2, date: "2026-08-05", title: "Позже", distanceMeters: 900, durationSeconds: 1200, avgHeartRate: 120, calories: 100 },
  ], "2026-08-06");
  assert.equal(result.largestSwim?.id, 2);
  assert.equal(result.fastestPace?.id, 2);
  assert.equal(result.highestHeartRate?.id, 2);
});
