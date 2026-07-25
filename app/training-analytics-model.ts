import { normalizeCoachPlanKind, type CoachPlanKind } from "../lib/coach.ts";

const DAY_MS = 86400000;

export const ANALYTICS_PERIODS = ["4W", "3M", "6M", "1Y"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
export const ANALYTICS_PERIOD_LABELS: Record<AnalyticsPeriod, string> = { "4W": "4 недели", "3M": "3 месяца", "6M": "6 месяцев", "1Y": "1 год" };

export interface WorkoutDetail {
  key: string;
  name: string;
  originalName: string;
  value: number;
  weight: number;
  difficulty: string;
  unit: string;
}

export interface WorkoutRecord {
  id: number;
  date: string;
  type: string;
  title: string;
  rounds: number;
  durationSeconds: number;
  restSeconds: number;
  minHeartRate: number;
  avgHeartRate: number;
  maxHeartRate: number;
  calories: number;
  distanceMeters: number;
  avgSpeed: number;
  effort: string;
  painAfter: number;
  details?: WorkoutDetail[];
}

export interface StrengthLogRecord {
  exercise: string;
  weight: number;
  reps: number;
  date: string;
}

export interface WeeklyPlanDay {
  day: number; // 1 (Monday) .. 7 (Sunday)
  type: string;
}

export interface ScheduleOverrideRecord {
  originalDate: string;
  scheduledDate: string;
  planTitle: string;
  replacementTitle?: string;
}

function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export function localIso(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function periodCutoffDate(period: AnalyticsPeriod, anchor: Date): Date {
  const d = new Date(anchor);
  if (period === "4W") d.setDate(d.getDate() - 27);
  else if (period === "3M") d.setMonth(d.getMonth() - 3);
  else if (period === "6M") d.setMonth(d.getMonth() - 6);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
}

function isoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function daysBetweenInclusive(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / DAY_MS) + 1;
}

function weekBucket(dateIso: string, originIso: string): number {
  return Math.floor((new Date(`${dateIso}T00:00:00`).getTime() - new Date(`${originIso}T00:00:00`).getTime()) / (7 * DAY_MS));
}

export function computeExpectedTrainingDays(planDays: WeeklyPlanDay[], fromIso: string, toIso: string): number {
  if (fromIso > toIso) return 0;
  const trainingWeekdays = new Set(planDays.filter((p) => p.type !== "Отдых").map((p) => p.day));
  let count = 0;
  const to = new Date(`${toIso}T00:00:00`).getTime();
  for (let t = new Date(`${fromIso}T00:00:00`).getTime(); t <= to; t += DAY_MS) {
    if (trainingWeekdays.has(isoWeekday(new Date(t)))) count++;
  }
  return count;
}

function buildExpectedPlanByDate(
  planDays: WeeklyPlanDay[],
  scheduleOverrides: ScheduleOverrideRecord[],
  fromIso: string,
  toIso: string,
): Map<string, CoachPlanKind> {
  const planByWeekday = new Map(
    planDays.map((day) => [day.day, normalizeCoachPlanKind(day.type)]),
  );
  const movedFrom = new Map(scheduleOverrides.map((item) => [item.originalDate, item]));
  const movedTo = new Map(scheduleOverrides.map((item) => [item.scheduledDate, item]));
  const expected = new Map<string, CoachPlanKind>();
  const cursor = new Date(`${fromIso}T12:00:00`);
  const end = new Date(`${toIso}T12:00:00`);
  while (cursor <= end) {
    const date = localIso(cursor);
    const movedHere = movedTo.get(date);
    const movedAway = movedFrom.get(date);
    let kind: CoachPlanKind | undefined;
    if (movedHere) {
      kind = normalizeCoachPlanKind("", movedHere.replacementTitle || movedHere.planTitle);
    } else if (!movedAway || movedAway.scheduledDate === date) {
      kind = planByWeekday.get(isoWeekday(cursor));
    }
    if (kind && kind !== "rest") expected.set(date, kind);
    cursor.setDate(cursor.getDate() + 1);
  }
  return expected;
}

export interface PeriodSummary {
  period: AnalyticsPeriod;
  fromDate: string;
  toDate: string;
  totalWorkouts: number;
  byKind: Record<CoachPlanKind, number>;
  activeDays: number;
  activeWeeks: number;
  totalWeeks: number;
  regularityPct: number | null;
  expectedTrainingDays: number;
  planCompletionPct: number | null;
}

export function computePeriodSummary(
  workouts: WorkoutRecord[],
  planDays: WeeklyPlanDay[],
  period: AnalyticsPeriod,
  anchor: Date,
  scheduleOverrides: ScheduleOverrideRecord[] = [],
): PeriodSummary {
  const fromIso = localIso(periodCutoffDate(period, anchor));
  const toIso = localIso(anchor);
  const inPeriod = workouts.filter((w) => w.date >= fromIso && w.date <= toIso);
  const byKind: Record<CoachPlanKind, number> = { strength: 0, cardio: 0, recovery: 0, rest: 0 };
  const activeDays = new Set<string>();
  const activeWeeks = new Set<number>();
  for (const w of inPeriod) {
    byKind[normalizeCoachPlanKind(w.type, w.title)]++;
    activeDays.add(w.date);
    activeWeeks.add(weekBucket(w.date, fromIso));
  }
  const totalWeeks = Math.max(1, Math.ceil(daysBetweenInclusive(fromIso, toIso) / 7));
  const expectedPlanByDate = buildExpectedPlanByDate(planDays, scheduleOverrides, fromIso, toIso);
  const expectedTrainingDays = expectedPlanByDate.size;
  const completedPlannedDays = new Set<string>();
  for (const workout of inPeriod) {
    const expectedKind = expectedPlanByDate.get(workout.date);
    if (expectedKind === normalizeCoachPlanKind(workout.type, workout.title)) {
      completedPlannedDays.add(workout.date);
    }
  }
  return {
    period,
    fromDate: fromIso,
    toDate: toIso,
    totalWorkouts: inPeriod.length,
    byKind,
    activeDays: activeDays.size,
    activeWeeks: activeWeeks.size,
    totalWeeks,
    regularityPct: Math.round(Math.min(1, activeWeeks.size / totalWeeks) * 100),
    expectedTrainingDays,
    planCompletionPct: expectedTrainingDays > 0 ? Math.round(Math.min(1, completedPlannedDays.size / expectedTrainingDays) * 100) : null,
  };
}

export interface HeatmapCell {
  date: string;
  count: number;
}

export function buildHeatmap(workouts: WorkoutRecord[], fromIso: string, toIso: string): HeatmapCell[] {
  if (fromIso > toIso) return [];
  const counts = new Map<string, number>();
  for (const w of workouts) {
    if (w.date >= fromIso && w.date <= toIso) counts.set(w.date, (counts.get(w.date) || 0) + 1);
  }
  const cells: HeatmapCell[] = [];
  const to = new Date(`${toIso}T00:00:00`).getTime();
  for (let t = new Date(`${fromIso}T00:00:00`).getTime(); t <= to; t += DAY_MS) {
    const iso = localIso(new Date(t));
    cells.push({ date: iso, count: counts.get(iso) || 0 });
  }
  return cells;
}

export interface VolumeBucket {
  key: string;
  strengthSessions: number;
  strengthActiveMinutes: number;
  strengthTotalReps: number;
  cardioSessions: number;
  cardioDistanceMeters: number;
  cardioActiveMinutes: number;
  cardioAvgHeartRate: number | null;
}

function bucketKeyOf(dateIso: string, granularity: "week" | "month"): string {
  if (granularity === "month") return dateIso.slice(0, 7);
  const monday = new Date(`${dateIso}T00:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localIso(monday);
}

export function groupVolumeByPeriod(workouts: WorkoutRecord[], granularity: "week" | "month"): VolumeBucket[] {
  const buckets = new Map<string, VolumeBucket>();
  const cardioHeartRates = new Map<string, number[]>();
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    const key = bucketKeyOf(w.date, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, { key, strengthSessions: 0, strengthActiveMinutes: 0, strengthTotalReps: 0, cardioSessions: 0, cardioDistanceMeters: 0, cardioActiveMinutes: 0, cardioAvgHeartRate: null });
    }
    const bucket = buckets.get(key)!;
    const kind = normalizeCoachPlanKind(w.type, w.title);
    if (kind === "strength") {
      bucket.strengthSessions++;
      bucket.strengthActiveMinutes += w.durationSeconds / 60;
      bucket.strengthTotalReps += (w.details || []).filter((d) => d.unit === "повт.").reduce((sum, d) => sum + d.value, 0);
    } else if (kind === "cardio") {
      bucket.cardioSessions++;
      bucket.cardioDistanceMeters += w.distanceMeters;
      bucket.cardioActiveMinutes += w.durationSeconds / 60;
      if (w.avgHeartRate > 0) {
        const samples = cardioHeartRates.get(key) ?? [];
        samples.push(w.avgHeartRate);
        cardioHeartRates.set(key, samples);
        bucket.cardioAvgHeartRate = round1(samples.reduce((sum, value) => sum + value, 0) / samples.length);
      }
    }
  }
  return [...buckets.values()].map((b) => ({ ...b, strengthActiveMinutes: Math.round(b.strengthActiveMinutes), cardioActiveMinutes: Math.round(b.cardioActiveMinutes) })).sort((a, b) => a.key.localeCompare(b.key));
}

export interface WellnessSummary {
  sessionsTotal: number;
  sessionsWithPain: number;
  avgPain: number | null;
  hardEffortSessions: number;
}

export function computeWellnessSummary(workouts: WorkoutRecord[]): WellnessSummary {
  const sessionsTotal = workouts.length;
  if (!sessionsTotal) return { sessionsTotal: 0, sessionsWithPain: 0, avgPain: null, hardEffortSessions: 0 };
  const sessionsWithPain = workouts.filter((w) => w.painAfter > 0).length;
  const avgPain = round1(workouts.reduce((sum, w) => sum + w.painAfter, 0) / sessionsTotal);
  const hardEffortSessions = workouts.filter((w) => w.effort === "Тяжело" || w.effort === "Боль").length;
  return { sessionsTotal, sessionsWithPain, avgPain, hardEffortSessions };
}

export interface StrengthRecord {
  exercise: string;
  weight: number;
  reps: number;
  date: string;
  isRecord: boolean;
}

export function computeStrengthRecords(logs: StrengthLogRecord[]): StrengthRecord[] {
  const byExercise = new Map<string, StrengthLogRecord[]>();
  for (const log of logs) {
    if (!byExercise.has(log.exercise)) byExercise.set(log.exercise, []);
    byExercise.get(log.exercise)!.push(log);
  }
  const results: StrengthRecord[] = [];
  for (const [exercise, exerciseLogs] of byExercise) {
    const sorted = [...exerciseLogs].sort((a, b) => a.date.localeCompare(b.date));
    let best = sorted[0];
    for (const log of sorted) if (log.weight > best.weight) best = log;
    results.push({ exercise, weight: best.weight, reps: best.reps, date: best.date, isRecord: sorted.length > 1 });
  }
  return results.sort((a, b) => b.weight - a.weight);
}

export interface CardioRecord {
  title: string;
  kind: "distance" | "pace";
  value: number;
  unit: string;
  date: string;
}

export function computeCardioRecords(workouts: WorkoutRecord[]): CardioRecord[] {
  const cardio = workouts.filter((w) => normalizeCoachPlanKind(w.type, w.title) === "cardio");
  const byTitle = new Map<string, WorkoutRecord[]>();
  for (const w of cardio) {
    if (!byTitle.has(w.title)) byTitle.set(w.title, []);
    byTitle.get(w.title)!.push(w);
  }
  const results: CardioRecord[] = [];
  for (const [title, list] of byTitle) {
    const withDistance = list.filter((w) => w.distanceMeters > 0);
    if (withDistance.length) {
      const best = withDistance.reduce((a, b) => (b.distanceMeters > a.distanceMeters ? b : a));
      results.push({ title, kind: "distance", value: Math.round(best.distanceMeters), unit: "м", date: best.date });
    }
    const withPace = list.filter((w) => w.distanceMeters > 0 && w.durationSeconds > 0);
    if (withPace.length) {
      const best = withPace.reduce((a, b) => (b.durationSeconds / b.distanceMeters < a.durationSeconds / a.distanceMeters ? b : a));
      results.push({ title, kind: "pace", value: round1(best.durationSeconds / 60 / (best.distanceMeters / 1000)), unit: "мин/км", date: best.date });
    }
  }
  return results;
}

const CSV_HEADERS = ["date", "type", "title", "rounds", "durationSeconds", "restSeconds", "minHeartRate", "avgHeartRate", "maxHeartRate", "calories", "distanceMeters", "avgSpeed", "effort", "painAfter"] as const;

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildWorkoutsCsv(workouts: WorkoutRecord[]): string {
  const rows = workouts.map((w) => CSV_HEADERS.map((key) => csvEscape((w as unknown as Record<string, unknown>)[key])).join(","));
  return [CSV_HEADERS.join(","), ...rows].join("\n");
}

export function buildWorkoutsJson(workouts: WorkoutRecord[]): string {
  return JSON.stringify(workouts, null, 2);
}
