import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-fit-detail-"));
const { computeFitSets, computeFitSwimDetail } = await import("@/lib/fit-import-service.ts");

// Форма сообщений взята из настоящих файлов Garmin, снятых через intervals.icu:
// у длин есть lengthType/totalStrokes/totalTimerTime/swimStroke, у подходов —
// setType/repetitions/weight/duration/category.
const length = (strokes: number | null, seconds: number | null, type = "active") =>
  ({ lengthType: type, totalStrokes: strokes, totalTimerTime: seconds, swimStroke: "freestyle" });
const set = (reps: number | null, weight: number | null, type = "active") =>
  ({ setType: type, repetitions: reps, weight, duration: 60, category: ["row", "flye", "pushUp"] });

test("SWOLF is time plus strokes, because FIT does not store it", () => {
  const detail = computeFitSwimDetail([length(12, 38), length(13, 35.937)], {
    poolLengthMeters: 25, totalDistanceMeters: 50, durationSeconds: 74,
  })!;
  assert.equal(detail.lengths[0].swolf, 50);   // 38 + 12
  assert.equal(detail.lengths[1].swolf, 49);   // 35.937 + 13 → 48.937
  assert.equal(detail.avgSwolf, 49.5);
});

test("idle lengths are excluded — resting at the wall is not a swum length", () => {
  const detail = computeFitSwimDetail([length(12, 38), length(null, 20, "idle"), length(14, 40)], {
    poolLengthMeters: 25, totalDistanceMeters: 50, durationSeconds: 100,
  })!;
  assert.equal(detail.activeLengths, 2);
  assert.equal(detail.avgStrokesPerLength, 13);
});

test("pace counts only time in the water, not rest at the wall", () => {
  // Длительность сессии 2099 с включает отдых; активного плавания — 1900 с.
  // Темп обязан считаться по второму: иначе выходит 3:06/100м там, где Garmin
  // показывает 2:23/100м.
  const lengths = Array.from({ length: 50 }, () => length(12, 38));
  const detail = computeFitSwimDetail(lengths, {
    poolLengthMeters: 25, totalDistanceMeters: 1250, durationSeconds: 2500,
  })!;
  assert.equal(detail.movingSeconds, 1900, "время в воде — сумма активных длин");
  assert.equal(detail.paceSecondsPer100m, 152, "1900 с на 1250 м = 152 с/100 м");
});

test("without lengths the pace falls back to the session duration", () => {
  const detail = computeFitSwimDetail([], {
    poolLengthMeters: 25, totalDistanceMeters: 1150, durationSeconds: 2099,
  })!;
  assert.equal(detail.movingSeconds, null);
  assert.equal(detail.paceSecondsPer100m, 183);
});

test("a length missing strokes or time yields no SWOLF rather than a wrong one", () => {
  const detail = computeFitSwimDetail([length(null, 38), length(12, null), length(12, 38)], {
    poolLengthMeters: 25, totalDistanceMeters: 75, durationSeconds: 120,
  })!;
  assert.deepEqual(detail.lengths.map((l) => l.swolf), [null, null, 50]);
  assert.equal(detail.avgSwolf, 50, "среднее считается только по полным длинам");
});

test("swim detail is null when the file carries no length messages at all", () => {
  assert.equal(computeFitSwimDetail(undefined, { poolLengthMeters: null, totalDistanceMeters: null, durationSeconds: 1 }), null);
});

test("rest sets are dropped and working sets keep their reps", () => {
  const sets = computeFitSets([set(14, 3.6875), set(null, null, "rest"), set(13, 3.5)])!;
  assert.equal(sets.length, 2);
  assert.deepEqual(sets.map((s) => s.repetitions), [14, 13]);
});

test("a zero weight means bodyweight, not missing data", () => {
  // Владелец вводит вес на часах: гантели дают 3.5–3.7 кг, а отжимания,
  // планка и отведения — ноль. Такие подходы полноценны и прогрессируют
  // повторами, поэтому отбрасывать их нельзя.
  const sets = computeFitSets([set(12, 0), set(12, 3.6875)])!;
  assert.equal(sets[0].weightKg, 0);
  assert.equal(sets[0].bodyweight, true);
  assert.equal(sets[1].weightKg, 3.6875);
  assert.equal(sets[1].bodyweight, false);
});

test("a set without a weight field at all stays unknown", () => {
  const sets = computeFitSets([{ setType: "active", repetitions: 10, duration: 30, category: ["curl"] }])!;
  assert.equal(sets[0].weightKg, null);
  assert.equal(sets[0].bodyweight, false, "нет данных — это не вес тела");
});

test("only the first exercise guess is kept — the watch reports three candidates", () => {
  const sets = computeFitSets([set(10, 20)])!;
  assert.equal(sets[0].category, "row");
});

test("sets are null when the file has no set messages", () => {
  assert.equal(computeFitSets(undefined), null);
  assert.deepEqual(computeFitSets([]), []);
});
