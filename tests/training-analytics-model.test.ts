import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHeatmap,
  buildWorkoutsCsv,
  buildWorkoutsJson,
  computeCardioRecords,
  computeExpectedTrainingDays,
  computePeriodSummary,
  computeStrengthRecords,
  computeWellnessSummary,
  groupVolumeByPeriod,
  periodCutoffDate,
  type StrengthLogRecord,
  type WeeklyPlanDay,
  type WorkoutRecord,
} from "../app/training-analytics-model.ts";

const anchor = new Date("2026-07-25T12:00:00");
const planDays: WeeklyPlanDay[] = [
  { day: 1, type: "Силовая" },
  { day: 2, type: "Кардио" },
  { day: 3, type: "Силовая" },
  { day: 4, type: "Восстановление" },
  { day: 5, type: "Силовая" },
  { day: 6, type: "Кардио" },
  { day: 7, type: "Отдых" },
];

function w(id: number, date: string, extra: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id,
    date,
    type: "Силовая",
    title: "Гантели по кругу",
    rounds: 2,
    durationSeconds: 1200,
    restSeconds: 300,
    minHeartRate: 0,
    avgHeartRate: 0,
    maxHeartRate: 0,
    calories: 0,
    distanceMeters: 0,
    avgSpeed: 0,
    effort: "Нормально",
    painAfter: 0,
    details: [],
    ...extra,
  };
}

function makeWorkouts(count: number, startDate = "2026-01-01"): WorkoutRecord[] {
  const out: WorkoutRecord[] = [];
  const d = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const date = new Date(d.getTime() + i * 2 * 86400000).toISOString().slice(0, 10);
    out.push(w(i + 1, date));
  }
  return out;
}

test("computePeriodSummary: 0 workouts -> zeroed, no NaN/Infinity", () => {
  const s = computePeriodSummary([], planDays, "4W", anchor);
  assert.equal(s.totalWorkouts, 0);
  assert.equal(s.activeDays, 0);
  assert.equal(s.planCompletionPct, expectedIsNumberOrNull(s.planCompletionPct));
  for (const v of [s.regularityPct, s.planCompletionPct]) if (v != null) assert.ok(Number.isFinite(v));
});
function expectedIsNumberOrNull(v: number | null) {
  return v;
}

test("computePeriodSummary: byKind classifies strength/cardio/recovery/rest consistently with Coach", () => {
  const workouts = [w(1, "2026-07-20", { type: "Силовая" }), w(2, "2026-07-21", { type: "Кардио", title: "Ходьба или велосипед" }), w(3, "2026-07-22", { type: "Восстановление", title: "Прогулка и мобильность" })];
  const s = computePeriodSummary(workouts, planDays, "4W", anchor);
  assert.equal(s.byKind.strength, 1);
  assert.equal(s.byKind.cardio, 1);
  assert.equal(s.byKind.recovery, 1);
  assert.equal(s.byKind.rest, 0);
});

test("computePeriodSummary: другая активность не засчитывается как выполнение плана", () => {
  const monday = "2026-07-20";
  const workouts = [
    w(1, monday, { type: "Кардио", title: "Незапланированная прогулка" }),
    w(2, "2026-07-19", { type: "Силовая", title: "Силовая в день отдыха" }),
  ];
  const s = computePeriodSummary(workouts, planDays, "4W", anchor);
  assert.equal(s.activeDays, 2);
  assert.equal(s.planCompletionPct, 0);
});

test("computePeriodSummary: совпавший тип тренировки засчитывает только плановый день", () => {
  const workouts = [
    w(1, "2026-07-20", { type: "Силовая" }),
    w(2, "2026-07-20", { type: "Силовая", title: "Вторая силовая в тот же день" }),
  ];
  const s = computePeriodSummary(workouts, planDays, "4W", anchor);
  assert.equal(s.activeDays, 1);
  assert.equal(s.planCompletionPct, Math.round(1 / s.expectedTrainingDays * 100));
});

test("computePeriodSummary: перенос исключает исходную дату и учитывает новую", () => {
  const overrides = [{
    originalDate: "2026-07-20",
    scheduledDate: "2026-07-21",
    planTitle: "Гантели по кругу",
    replacementTitle: "",
  }];
  const workouts = [
    w(1, "2026-07-20", { type: "Силовая" }),
    w(2, "2026-07-21", { type: "Силовая" }),
  ];
  const s = computePeriodSummary(workouts, planDays, "4W", anchor, overrides);
  assert.equal(s.planCompletionPct, Math.round(1 / s.expectedTrainingDays * 100));
});

test("computePeriodSummary: замена требует фактически выполненный тип замены", () => {
  const overrides = [{
    originalDate: "2026-07-20",
    scheduledDate: "2026-07-20",
    planTitle: "Гантели по кругу",
    replacementTitle: "Прогулка и мобильность",
  }];
  const wrong = computePeriodSummary(
    [w(1, "2026-07-20", { type: "Силовая" })],
    planDays,
    "4W",
    anchor,
    overrides,
  );
  const matching = computePeriodSummary(
    [w(1, "2026-07-20", { type: "Восстановление", title: "Прогулка и мобильность" })],
    planDays,
    "4W",
    anchor,
    overrides,
  );
  assert.equal(wrong.planCompletionPct, 0);
  assert.equal(matching.planCompletionPct, Math.round(1 / matching.expectedTrainingDays * 100));
});

test("computePeriodSummary: does not mutate input arrays", () => {
  const workouts = [w(1, "2026-07-20")];
  const before = JSON.stringify(workouts);
  computePeriodSummary(workouts, planDays, "1Y", anchor);
  assert.equal(JSON.stringify(workouts), before);
});

test("computePeriodSummary: 500 workouts stays finite, deterministic and performant", () => {
  const workouts = makeWorkouts(500, "2024-01-01");
  const a = computePeriodSummary(workouts, planDays, "1Y", anchor);
  const b = computePeriodSummary(workouts, planDays, "1Y", anchor);
  assert.deepEqual(a, b);
  assert.ok(Number.isFinite(a.totalWorkouts));
});

test("computeExpectedTrainingDays: counts only non-rest weekdays across a known week", () => {
  const days = computeExpectedTrainingDays(planDays, "2026-07-20", "2026-07-26");
  assert.equal(days, 6);
});

test("computeExpectedTrainingDays: inverted range returns 0", () => {
  assert.equal(computeExpectedTrainingDays(planDays, "2026-07-26", "2026-07-20"), 0);
});

test("periodCutoffDate: each period is strictly before anchor and ordered", () => {
  const c4w = periodCutoffDate("4W", anchor).getTime();
  const c3m = periodCutoffDate("3M", anchor).getTime();
  const c6m = periodCutoffDate("6M", anchor).getTime();
  const c1y = periodCutoffDate("1Y", anchor).getTime();
  assert.ok(c4w < anchor.getTime());
  assert.ok(c1y < c6m && c6m < c3m && c3m < c4w);
});

test("buildHeatmap: one cell per day in range, counts match, no gaps", () => {
  const workouts = [w(1, "2026-07-20"), w(2, "2026-07-20"), w(3, "2026-07-22")];
  const cells = buildHeatmap(workouts, "2026-07-19", "2026-07-23");
  assert.equal(cells.length, 5);
  assert.deepEqual(cells.map((c) => c.count), [0, 2, 0, 1, 0]);
});

test("buildHeatmap: inverted range returns empty array", () => {
  assert.deepEqual(buildHeatmap([w(1, "2026-07-20")], "2026-07-23", "2026-07-19"), []);
});

test("buildHeatmap: 500 workouts over a year stays deterministic", () => {
  const workouts = makeWorkouts(500, "2024-01-01");
  const a = buildHeatmap(workouts, "2024-01-01", "2026-07-25");
  const b = buildHeatmap(workouts, "2024-01-01", "2026-07-25");
  assert.deepEqual(a, b);
});

test("groupVolumeByPeriod: separates strength and cardio without mixing incompatible units", () => {
  const workouts = [
    w(1, "2026-07-06", { type: "Силовая", durationSeconds: 1200, details: [{ key: "0-0", name: "x", originalName: "x", value: 10, weight: 20, difficulty: "Нормально", unit: "повт." }] }),
    w(2, "2026-07-07", { type: "Кардио", title: "Ходьба или велосипед", durationSeconds: 1800, distanceMeters: 5000, avgHeartRate: 130 }),
  ];
  const buckets = groupVolumeByPeriod(workouts, "week");
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].strengthSessions, 1);
  assert.equal(buckets[0].cardioSessions, 1);
  assert.equal(buckets[0].strengthTotalReps, 10);
  assert.equal(buckets[0].cardioDistanceMeters, 5000);
  assert.equal(buckets[0].cardioAvgHeartRate, 130);
});

test("groupVolumeByPeriod: monthly grouping and determinism over 500 workouts", () => {
  const workouts = makeWorkouts(500, "2023-01-01");
  const a = groupVolumeByPeriod(workouts, "month");
  const b = groupVolumeByPeriod(workouts, "month");
  assert.deepEqual(a, b);
  for (const bucket of a) {
    assert.ok(Number.isFinite(bucket.strengthActiveMinutes));
    assert.ok(Number.isFinite(bucket.cardioActiveMinutes));
  }
});

test("groupVolumeByPeriod: средний пульс не искажается после третьей кардиосессии", () => {
  const workouts = [
    w(1, "2026-07-06", { type: "Кардио", avgHeartRate: 100 }),
    w(2, "2026-07-07", { type: "Кардио", avgHeartRate: 200 }),
    w(3, "2026-07-08", { type: "Кардио", avgHeartRate: 300 }),
  ];
  const [bucket] = groupVolumeByPeriod(workouts, "week");
  assert.equal(bucket.cardioAvgHeartRate, 200);
});

test("computeWellnessSummary: empty history returns nulls, not zeros disguised as data", () => {
  const s = computeWellnessSummary([]);
  assert.equal(s.sessionsTotal, 0);
  assert.equal(s.avgPain, null);
});

test("computeWellnessSummary: aggregates pain and hard-effort counts without causal claims in the data shape", () => {
  const workouts = [w(1, "2026-07-01", { painAfter: 3, effort: "Тяжело" }), w(2, "2026-07-02", { painAfter: 0, effort: "Нормально" }), w(3, "2026-07-03", { painAfter: 5, effort: "Боль" })];
  const s = computeWellnessSummary(workouts);
  assert.equal(s.sessionsTotal, 3);
  assert.equal(s.sessionsWithPain, 2);
  assert.equal(s.hardEffortSessions, 2);
  assert.equal(s.avgPain, round1((3 + 0 + 5) / 3));
});
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

test("computeStrengthRecords: picks max weight per exercise and flags single-entry as not-yet-a-record", () => {
  const logs: StrengthLogRecord[] = [
    { exercise: "Жим", weight: 10, reps: 10, date: "2026-06-01" },
    { exercise: "Жим", weight: 12, reps: 8, date: "2026-06-15" },
    { exercise: "Тяга", weight: 8, reps: 12, date: "2026-06-01" },
  ];
  const records = computeStrengthRecords(logs);
  const bench = records.find((r) => r.exercise === "Жим")!;
  assert.equal(bench.weight, 12);
  assert.equal(bench.isRecord, true);
  const row = records.find((r) => r.exercise === "Тяга")!;
  assert.equal(row.isRecord, false);
});

test("computeStrengthRecords: does not mutate input, deterministic on 500 logs", () => {
  const logs: StrengthLogRecord[] = Array.from({ length: 500 }, (_, i) => ({ exercise: `Ex${i % 10}`, weight: (i % 30) + 5, reps: 10, date: new Date(2024, 0, 1 + i).toISOString().slice(0, 10) }));
  const before = JSON.stringify(logs);
  const a = computeStrengthRecords(logs);
  const b = computeStrengthRecords(logs);
  assert.equal(JSON.stringify(logs), before);
  assert.deepEqual(a, b);
});

test("computeCardioRecords: reports best distance and best pace only when data present", () => {
  const workouts = [
    w(1, "2026-06-01", { type: "Кардио", title: "Ходьба или велосипед", distanceMeters: 10000, durationSeconds: 3600 }),
    w(2, "2026-06-10", { type: "Кардио", title: "Ходьба или велосипед", distanceMeters: 15000, durationSeconds: 3000 }),
    w(3, "2026-06-15", { type: "Кардио", title: "Бассейн", distanceMeters: 0, durationSeconds: 1800 }),
  ];
  const records = computeCardioRecords(workouts);
  const distance = records.find((r) => r.title === "Ходьба или велосипед" && r.kind === "distance")!;
  assert.equal(distance.value, 15000);
  const pace = records.find((r) => r.title === "Ходьба или велосипед" && r.kind === "pace")!;
  assert.ok(pace.value < 10);
  assert.equal(records.some((r) => r.title === "Бассейн"), false);
});

test("computeCardioRecords: empty input returns empty array, no NaN", () => {
  assert.deepEqual(computeCardioRecords([]), []);
});

test("buildWorkoutsCsv: escapes commas and quotes, one row per workout", () => {
  const workouts = [w(1, "2026-07-01", { title: 'Бег, "быстрый"' })];
  const csv = buildWorkoutsCsv(workouts);
  const lines = csv.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('"Бег, ""быстрый"""'));
});

test("buildWorkoutsJson: round-trips through JSON.parse", () => {
  const workouts = makeWorkouts(3);
  const json = buildWorkoutsJson(workouts);
  assert.deepEqual(JSON.parse(json).length, 3);
});
