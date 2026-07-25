import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHistory,
  computeMetricCards,
  computeMetricStats,
  computeProgressSummary,
  computeTrendPoints,
  filterHistoryByPeriod,
  groupHistoryByMonth,
  periodCutoffDate,
  sortMeasurementsAsc,
  sortMeasurementsDesc,
  type Measurement,
} from "../app/progress-model.ts";

const profile = { startWeight: 86, targetWeight: 67 };
const anchor = new Date("2026-07-25T12:00:00");

function m(id: number, date: string, weight: number | null, extra: Partial<Measurement> = {}): Measurement {
  return { id, date, weight, waist: null, chest: null, biceps: null, thigh: null, neck: null, ...extra };
}

function makeSeries(count: number, startDate = "2026-01-01", startWeight = 100): Measurement[] {
  const out: Measurement[] = [];
  const d = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const date = new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10);
    out.push(m(i + 1, date, round1(startWeight - i * 0.1)));
  }
  return out;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

test("computeProgressSummary: 0 measurements -> empty state, no NaN", () => {
  const s = computeProgressSummary([], profile, [], anchor);
  assert.equal(s.state, "empty");
  assert.equal(s.currentWeight, null);
  assert.equal(s.measurementCount, 0);
});

test("computeProgressSummary: 1 measurement -> first state, no change fields", () => {
  const s = computeProgressSummary([m(1, "2026-07-21", 85.9)], profile, [], anchor);
  assert.equal(s.state, "first");
  assert.equal(s.currentWeight, 85.9);
  assert.equal(s.changeSinceStart, null);
  assert.ok(Number.isFinite(s.goalPct!));
});

test("computeProgressSummary: 3 measurements -> early state with real change, no NaN/Infinity", () => {
  const data = [m(1, "2026-07-21", 86), m(2, "2026-07-23", 85), m(3, "2026-07-25", 84)];
  const s = computeProgressSummary(data, profile, [], anchor);
  assert.equal(s.state, "early");
  assert.equal(s.changeSinceStart, -2);
  assert.ok(Number.isFinite(s.goalPct!));
});

test("computeProgressSummary: 20 and 50 and 100 measurements produce finite, deterministic output", () => {
  for (const count of [20, 50, 100]) {
    const data = makeSeries(count);
    const s1 = computeProgressSummary(data, profile, [], anchor);
    const s2 = computeProgressSummary(data, profile, [], anchor);
    assert.deepEqual(s1, s2);
    assert.equal(s1.state, count >= 12 ? "long" : "monthly");
    for (const v of [s1.currentWeight, s1.change30d, s1.changeSinceStart, s1.remainingToGoal, s1.goalPct]) {
      if (v != null) assert.ok(Number.isFinite(v), `expected finite, got ${v}`);
    }
  }
});

test("computeProgressSummary: does not mutate input array", () => {
  const data = [m(2, "2026-07-23", 85), m(1, "2026-07-21", 86)];
  const before = JSON.stringify(data);
  computeProgressSummary(data, profile, [], anchor);
  assert.equal(JSON.stringify(data), before);
});

test("computeProgressSummary: zero total-to-lose does not produce NaN/Infinity goalPct", () => {
  const s = computeProgressSummary([m(1, "2026-07-21", 86)], { startWeight: 70, targetWeight: 70 }, [], anchor);
  assert.equal(s.goalPct, null);
});

test("sortMeasurementsAsc/Desc: handles unsorted input and duplicate dates without mutation", () => {
  const data = [m(3, "2026-07-24", 84), m(1, "2026-07-21", 86), m(2, "2026-07-24", 85)];
  const before = JSON.stringify(data);
  const asc = sortMeasurementsAsc(data);
  const desc = sortMeasurementsDesc(data);
  assert.deepEqual(asc.map((x) => x.id), [1, 2, 3]);
  assert.deepEqual(desc.map((x) => x.id), [3, 2, 1]);
  assert.equal(JSON.stringify(data), before);
});

test("computeMetricStats: periods 1M/3M/6M/1Y/ALL filter correctly", () => {
  const data = makeSeries(400, "2025-01-01", 100);
  for (const period of ["1M", "3M", "6M", "1Y", "ALL"] as const) {
    const stats = computeMetricStats(data, "weight", period, new Date("2026-07-25"));
    assert.ok(stats.count >= 0);
    assert.equal(stats.count, stats.points.length);
    for (const p of stats.points) assert.ok(Number.isFinite(p.value));
  }
  const all = computeMetricStats(data, "weight", "ALL", new Date("2026-07-25"));
  const oneMonth = computeMetricStats(data, "weight", "1M", new Date("2026-07-25"));
  assert.ok(oneMonth.count <= all.count);
});

test("computeMetricStats: missing circumference fields are skipped, not treated as zero", () => {
  const data = [m(1, "2026-07-21", 86, { waist: 97 }), m(2, "2026-07-23", 85), m(3, "2026-07-25", 84, { waist: 95 })];
  const stats = computeMetricStats(data, "waist", "ALL", anchor);
  assert.equal(stats.count, 2);
  assert.equal(stats.last, 95);
  assert.equal(stats.changeSinceStart, -2);
});

test("computeMetricStats: unsorted, same-date input yields deterministic result", () => {
  const data = [m(3, "2026-07-25", 84), m(1, "2026-07-21", 86), m(2, "2026-07-21", 85)];
  const a = computeMetricStats(data, "weight", "ALL", anchor);
  const b = computeMetricStats(data, "weight", "ALL", anchor);
  assert.deepEqual(a, b);
  assert.equal(a.count, 3);
});

test("computeMetricStats: empty series returns nulls, no NaN", () => {
  const stats = computeMetricStats([], "weight", "ALL", anchor);
  assert.equal(stats.last, null);
  assert.equal(stats.count, 0);
});

test("periodCutoffDate: ALL returns null, others return earlier date", () => {
  assert.equal(periodCutoffDate("ALL", anchor), null);
  assert.ok(periodCutoffDate("1M", anchor)!.getTime() < anchor.getTime());
  assert.ok(periodCutoffDate("1Y", anchor)!.getTime() < periodCutoffDate("1M", anchor)!.getTime());
});

test("computeTrendPoints: requires at least 5 points, no NaN/Infinity, deterministic", () => {
  assert.equal(computeTrendPoints([{ id: 1, date: "2026-01-01", value: 80 }]), null);
  const points = makeSeries(20).map((x) => ({ id: x.id, date: x.date, value: Number(x.weight) }));
  const trend = computeTrendPoints(points);
  assert.ok(trend);
  for (const p of trend!) assert.ok(Number.isFinite(p.value));
  assert.deepEqual(trend, computeTrendPoints(points));
});

test("computeTrendPoints: identical dates do not produce division by zero", () => {
  const points = [1, 2, 3, 4, 5].map((i) => ({ id: i, date: "2026-07-21", value: 80 + i }));
  const trend = computeTrendPoints(points);
  assert.equal(trend, null);
});

test("computeMetricCards: 0 measurements -> all cards report hasData=false, no NaN", () => {
  const cards = computeMetricCards([]);
  assert.equal(cards.length, 6);
  for (const c of cards) {
    assert.equal(c.hasData, false);
    assert.equal(c.last, null);
  }
});

test("computeMetricCards: 50 measurements with partial circumference data stays finite and deterministic", () => {
  const data = makeSeries(50).map((x, i) => (i % 3 === 0 ? { ...x, waist: 90 - i * 0.05 } : x));
  const a = computeMetricCards(data);
  const b = computeMetricCards(data);
  assert.deepEqual(a, b);
  for (const c of a) {
    if (c.last != null) assert.ok(Number.isFinite(c.last));
    if (c.change30d != null) assert.ok(Number.isFinite(c.change30d));
  }
});

test("buildHistory: computes weight delta vs previous entry and sorts newest first, no mutation", () => {
  const data = [m(1, "2026-07-21", 86), m(2, "2026-07-23", 85), m(3, "2026-07-25", 84.5)];
  const before = JSON.stringify(data);
  const history = buildHistory(data);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(history.map((h) => h.id), [3, 2, 1]);
  assert.equal(history[0].deltaWeight, -0.5);
  assert.equal(history[2].deltaWeight, null);
});

test("buildHistory: 100 measurements stays deterministic and finite", () => {
  const data = makeSeries(100);
  const a = buildHistory(data);
  const b = buildHistory(data);
  assert.deepEqual(a, b);
  for (const h of a) if (h.deltaWeight != null) assert.ok(Number.isFinite(h.deltaWeight));
});

test("filterHistoryByPeriod + groupHistoryByMonth: groups across years without loss, 20/50 entries", () => {
  for (const count of [20, 50]) {
    const data = makeSeries(count, "2025-06-01");
    const history = buildHistory(data);
    const grouped = groupHistoryByMonth(history);
    const total = grouped.reduce((n, y) => n + y.months.reduce((m2, mo) => m2 + mo.entries.length, 0), 0);
    assert.equal(total, count);
    const filtered = filterHistoryByPeriod(history, "3M", new Date("2026-07-25"));
    assert.ok(filtered.length <= history.length);
  }
});

test("groupHistoryByMonth: empty input returns empty array", () => {
  assert.deepEqual(groupHistoryByMonth([]), []);
});
