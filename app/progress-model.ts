import { round1 } from "../lib/stats.ts";

const DAY_MS = 86400000;

export const MEASUREMENT_KEYS = ["weight", "waist", "chest", "biceps", "thigh", "neck"] as const;
export type MetricKey = (typeof MEASUREMENT_KEYS)[number];
export const METRIC_LABELS: Record<MetricKey, string> = { weight: "Вес", waist: "Талия", chest: "Грудь", biceps: "Бицепс", thigh: "Бедро", neck: "Шея" };
export const METRIC_UNITS: Record<MetricKey, string> = { weight: "кг", waist: "см", chest: "см", biceps: "см", thigh: "см", neck: "см" };

export const PERIODS = ["1M", "3M", "6M", "1Y", "ALL"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Period, string> = { "1M": "1М", "3M": "3М", "6M": "6М", "1Y": "1Г", ALL: "Всё" };

export interface Measurement {
  id: number;
  date: string;
  weight: number | null;
  waist: number | null;
  chest: number | null;
  biceps: number | null;
  thigh: number | null;
  neck: number | null;
  created_at?: string;
}

export interface MetricPoint {
  id: number;
  date: string;
  value: number;
}

export interface MetricStats {
  points: MetricPoint[];
  last: number | null;
  lastDate: string | null;
  changeInPeriod: number | null;
  changeSinceStart: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export type ProgressState = "empty" | "first" | "early" | "monthly" | "long";

export interface ProgressSummary {
  state: ProgressState;
  currentWeight: number | null;
  lastDate: string | null;
  change30d: number | null;
  changeSinceStart: number | null;
  remainingToGoal: number | null;
  goalPct: number | null;
  workoutsLast30d: number;
  measurementCount: number;
}

export interface MetricCardData {
  key: MetricKey;
  label: string;
  unit: string;
  last: number | null;
  lastDate: string | null;
  change30d: number | null;
  changeSinceStart: number | null;
  hasData: boolean;
}

export interface HistoryEntry extends Measurement {
  deltaWeight: number | null;
}

export interface HistoryMonthGroup {
  key: string;
  label: string;
  entries: HistoryEntry[];
}

export interface HistoryYearGroup {
  year: string;
  months: HistoryMonthGroup[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toTime(date: string): number {
  return new Date(`${date}T00:00:00`).getTime();
}

export function localIsoDate(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function sortMeasurementsAsc(measurements: Measurement[]): Measurement[] {
  return [...measurements].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date.localeCompare(b.date)));
}

export function sortMeasurementsDesc(measurements: Measurement[]): Measurement[] {
  return [...measurements].sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
}

function numericSeries(measurements: Measurement[], key: MetricKey): MetricPoint[] {
  return sortMeasurementsAsc(measurements)
    .filter((m) => m[key] != null && Number.isFinite(Number(m[key])))
    .map((m) => ({ id: m.id, date: m.date, value: Number(m[key]) }));
}

export function periodCutoffDate(period: Period, anchor: Date): Date | null {
  if (period === "ALL") return null;
  const d = new Date(anchor);
  if (period === "1M") d.setMonth(d.getMonth() - 1);
  else if (period === "3M") d.setMonth(d.getMonth() - 3);
  else if (period === "6M") d.setMonth(d.getMonth() - 6);
  else if (period === "1Y") d.setFullYear(d.getFullYear() - 1);
  return d;
}

function changeOverDays(all: MetricPoint[], days: number): number | null {
  if (all.length < 2) return null;
  const last = all[all.length - 1];
  const cutoffIso = localIsoDate(new Date(toTime(last.date) - days * DAY_MS));
  const candidates = all.filter((p) => p.date <= cutoffIso);
  if (!candidates.length) return null;
  const ref = candidates[candidates.length - 1];
  return round1(last.value - ref.value);
}

export function computeMetricStats(measurements: Measurement[], key: MetricKey, period: Period, anchor: Date): MetricStats {
  const all = numericSeries(measurements, key);
  if (!all.length) return { points: [], last: null, lastDate: null, changeInPeriod: null, changeSinceStart: null, min: null, max: null, count: 0 };
  const last = all[all.length - 1];
  const cutoff = periodCutoffDate(period, anchor);
  const cutoffIso = cutoff ? localIsoDate(cutoff) : null;
  const points = cutoffIso ? all.filter((p) => p.date >= cutoffIso) : all;
  const changeInPeriod = points.length && all.length >= 2 ? round1(last.value - points[0].value) : null;
  const changeSinceStart = all.length >= 2 ? round1(last.value - all[0].value) : null;
  const valuesForRange = points.length ? points.map((p) => p.value) : [last.value];
  return {
    points,
    last: last.value,
    lastDate: last.date,
    changeInPeriod,
    changeSinceStart,
    min: round1(Math.min(...valuesForRange)),
    max: round1(Math.max(...valuesForRange)),
    count: points.length,
  };
}

export function computeTrendPoints(points: MetricPoint[]): [MetricPoint, MetricPoint] | null {
  if (points.length < 5) return null;
  const t0 = toTime(points[0].date);
  const xs = points.map((p) => (toTime(p.date) - t0) / DAY_MS);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const lastX = xs[xs.length - 1];
  const start = { id: -1, date: points[0].date, value: intercept };
  const end = { id: -2, date: points[points.length - 1].date, value: intercept + slope * lastX };
  if (!Number.isFinite(start.value) || !Number.isFinite(end.value)) return null;
  return [start, end];
}

function countWorkoutsInWindow(workouts: { date: string }[], anchor: Date, days: number): number {
  const nowIso = localIsoDate(anchor);
  const cutoffIso = localIsoDate(new Date(anchor.getTime() - days * DAY_MS));
  return workouts.filter((w) => w.date >= cutoffIso && w.date <= nowIso).length;
}

export function computeProgressSummary(
  measurements: Measurement[],
  profile: { startWeight: number; targetWeight: number },
  workouts: { date: string }[],
  anchor: Date
): ProgressSummary {
  const workoutsLast30d = countWorkoutsInWindow(workouts, anchor, 30);
  const points = numericSeries(measurements, "weight");
  const count = points.length;
  if (!count) {
    return { state: "empty", currentWeight: null, lastDate: null, change30d: null, changeSinceStart: null, remainingToGoal: null, goalPct: null, workoutsLast30d, measurementCount: 0 };
  }
  const last = points[points.length - 1];
  const first = points[0];
  const currentWeight = last.value;
  const startWeight = Number(profile.startWeight);
  const targetWeight = Number(profile.targetWeight);
  const totalToLose = startWeight - targetWeight;
  const goalPct = totalToLose !== 0 && Number.isFinite(totalToLose) ? clamp(((startWeight - currentWeight) / totalToLose) * 100, 0, 100) : null;
  const remainingToGoal = round1(currentWeight - targetWeight);
  const changeSinceStart = count > 1 ? round1(currentWeight - first.value) : null;
  const change30d = changeOverDays(points, 30);
  const state: ProgressState = count === 1 ? "first" : count <= 3 ? "early" : count < 12 ? "monthly" : "long";
  return { state, currentWeight, lastDate: last.date, change30d, changeSinceStart, remainingToGoal, goalPct, workoutsLast30d, measurementCount: count };
}

export function computeMetricCards(measurements: Measurement[]): MetricCardData[] {
  return MEASUREMENT_KEYS.map((key) => {
    const all = numericSeries(measurements, key);
    const last = all.length ? all[all.length - 1] : null;
    return {
      key,
      label: METRIC_LABELS[key],
      unit: METRIC_UNITS[key],
      last: last ? last.value : null,
      lastDate: last ? last.date : null,
      change30d: changeOverDays(all, 30),
      changeSinceStart: all.length >= 2 ? round1(last!.value - all[0].value) : null,
      hasData: all.length > 0,
    };
  });
}

export function buildHistory(measurements: Measurement[]): HistoryEntry[] {
  const asc = sortMeasurementsAsc(measurements);
  const withDelta: HistoryEntry[] = asc.map((m, i) => {
    const prev = i > 0 ? asc[i - 1] : null;
    const deltaWeight = prev && m.weight != null && prev.weight != null ? round1(Number(m.weight) - Number(prev.weight)) : null;
    return { ...m, deltaWeight };
  });
  return [...withDelta].sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
}

export function filterHistoryByPeriod(entries: HistoryEntry[], period: Period, anchor: Date): HistoryEntry[] {
  const cutoff = periodCutoffDate(period, anchor);
  if (!cutoff) return entries;
  const cutoffIso = localIsoDate(cutoff);
  return entries.filter((e) => e.date >= cutoffIso);
}

const MONTH_LABELS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export function groupHistoryByMonth(entries: HistoryEntry[]): HistoryYearGroup[] {
  const years = new Map<string, Map<string, HistoryEntry[]>>();
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    const monthKey = entry.date.slice(0, 7);
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year)!;
    if (!months.has(monthKey)) months.set(monthKey, []);
    months.get(monthKey)!.push(entry);
  }
  return [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, monthEntries]) => ({ key, label: MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? key, entries: monthEntries })),
    }));
}
