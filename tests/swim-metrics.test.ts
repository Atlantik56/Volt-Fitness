import assert from "node:assert/strict";
import test from "node:test";
import { formatDuration, formatKm, formatMeters, formatPace100m, weeklyVolumeMeters } from "../lib/swim-metrics.ts";

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
