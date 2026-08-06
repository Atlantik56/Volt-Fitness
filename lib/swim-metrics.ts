// Чистые функции форматирования и расчёта метрик VOLT Swim. Никогда не
// подставляют 0/NaN/Infinity вместо отсутствующих данных — вызывающий код
// показывает «Нет данных», получив null.
import type { SwimAggregateRecord, SwimRecordEntry, SwimRecordsData } from "@/app/swim/types";

export function formatMeters(meters: number): string | null {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return `${Math.round(meters)} м`;
}

export function formatKm(meters: number): string | null {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} км`;
}

export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

// Темп на 100 м считается только при валидной дистанции и длительности —
// иначе легко получить Infinity (дистанция 0) или мнимую точность.
export function formatPace100m(distanceMeters: number, durationSeconds: number): string | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const secondsPer100 = durationSeconds / (distanceMeters / 100);
  if (!Number.isFinite(secondsPer100) || secondsPer100 <= 0) return null;
  const total = Math.round(secondsPer100);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function weeklyVolumeMeters(logs: readonly { distanceMeters: number }[]): number {
  return logs.reduce((sum, log) => sum + (Number.isFinite(log.distanceMeters) && log.distanceMeters > 0 ? log.distanceMeters : 0), 0);
}

export type SwimMetricLog = {
  date: string;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate: number;
  calories: number;
};

export type SwimMetricPeriod = "30d" | "90d" | "1y";

const PERIOD_DAYS: Record<SwimMetricPeriod, number> = { "30d": 30, "90d": 90, "1y": 365 };

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function percentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// Детерминированная агрегация для Analytics. Нули допустимы только для
// суммарного объёма; средние считаются по строкам, где метрика действительно
// присутствует, поэтому отсутствие пульса/темпа не превращается в ноль.
export function computeSwimPeriodMetrics(logs: readonly SwimMetricLog[], period: SwimMetricPeriod, todayIso: string) {
  const days = PERIOD_DAYS[period];
  const fromDate = addDays(todayIso, -(days - 1));
  const previousFrom = addDays(fromDate, -days);
  const previousTo = addDays(fromDate, -1);
  const current = logs.filter((log) => log.date >= fromDate && log.date <= todayIso);
  const previous = logs.filter((log) => log.date >= previousFrom && log.date <= previousTo);
  const positiveDistance = current.filter((log) => Number.isFinite(log.distanceMeters) && log.distanceMeters > 0);
  const paced = current.filter((log) => log.distanceMeters > 0 && log.durationSeconds > 0);
  const heartRates = current.map((log) => log.avgHeartRate).filter((value) => Number.isFinite(value) && value > 0);
  const calorieValues = current.map((log) => log.calories).filter((value) => Number.isFinite(value) && value > 0);
  const distanceMeters = weeklyVolumeMeters(current);
  const previousDistance = weeklyVolumeMeters(previous);
  const pacedDistance = weeklyVolumeMeters(paced);
  const pacedDuration = paced.reduce((sum, log) => sum + log.durationSeconds, 0);

  const buckets = new Map<string, { distanceMeters: number; workoutCount: number }>();
  for (const log of current) {
    const weekday = new Date(`${log.date}T12:00:00Z`).getUTCDay() || 7;
    const bucketStart = addDays(log.date, -(weekday - 1));
    const bucket = buckets.get(bucketStart) ?? { distanceMeters: 0, workoutCount: 0 };
    bucket.workoutCount += 1;
    if (Number.isFinite(log.distanceMeters) && log.distanceMeters > 0) bucket.distanceMeters += log.distanceMeters;
    buckets.set(bucketStart, bucket);
  }

  return {
    fromDate,
    toDate: todayIso,
    workoutCount: current.length,
    distanceMeters,
    durationSeconds: current.reduce((sum, log) => sum + (log.durationSeconds > 0 ? log.durationSeconds : 0), 0),
    calories: calorieValues.length ? calorieValues.reduce((sum, value) => sum + value, 0) : null,
    avgHeartRate: heartRates.length ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length) : null,
    avgPaceLabel: formatPace100m(pacedDistance, pacedDuration),
    averageDistanceMeters: positiveDistance.length ? Math.round(distanceMeters / positiveDistance.length) : null,
    distanceDeltaPercent: percentDelta(distanceMeters, previousDistance),
    volume: [...buckets.entries()].filter(([, value]) => value.distanceMeters > 0).sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, ...value })),
  };
}

export type SwimRecordsLog = SwimMetricLog & { id: number; title: string };

function validMetric(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function recordOf(log: SwimRecordsLog, value: number): SwimRecordEntry {
  return { id: log.id, date: log.date, title: log.title, value };
}

// При равенстве метрики выигрывает более свежая тренировка, затем больший id.
// Это делает выбор стабильным независимо от порядка строк в запросе.
function bestLog(
  logs: readonly SwimRecordsLog[],
  valueOf: (log: SwimRecordsLog) => number | null,
  direction: "max" | "min" = "max",
): SwimRecordEntry | null {
  let best: SwimRecordEntry | null = null;
  for (const log of logs) {
    const value = valueOf(log);
    if (value === null || !validMetric(value)) continue;
    if (!best) { best = recordOf(log, value); continue; }
    const improves = direction === "max" ? value > best.value : value < best.value;
    const tiedAndNewer = value === best.value && (log.date > best.date || (log.date === best.date && log.id > best.id));
    if (improves || tiedAndNewer) best = recordOf(log, value);
  }
  return best;
}

function isoWeekStart(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  return addDays(iso, -(weekday - 1));
}

function aggregateBy(
  logs: readonly SwimRecordsLog[],
  keyOf: (log: SwimRecordsLog) => string,
): Map<string, { value: number; swimCount: number }> {
  const groups = new Map<string, { value: number; swimCount: number }>();
  for (const log of logs) {
    const key = keyOf(log);
    const group = groups.get(key) ?? { value: 0, swimCount: 0 };
    group.swimCount += 1;
    if (validMetric(log.distanceMeters)) group.value += log.distanceMeters;
    groups.set(key, group);
  }
  return groups;
}

function bestAggregate(
  groups: ReadonlyMap<string, { value: number; swimCount: number }>,
  score: (group: { value: number; swimCount: number }) => number,
): SwimAggregateRecord {
  let best: SwimAggregateRecord = null;
  let bestScore = 0;
  for (const [period, group] of groups) {
    const current = score(group);
    if (!validMetric(current)) continue;
    if (!best || current > bestScore || (current === bestScore && period > best.period)) {
      best = { period, value: current, swimCount: group.swimCount };
      bestScore = current;
    }
  }
  return best;
}

function longestStreak(logs: readonly SwimRecordsLog[]): number | null {
  const dates = [...new Set(logs.map((log) => log.date))].sort();
  if (!dates.length) return null;
  let longest = 1;
  let current = 1;
  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index] === addDays(dates[index - 1], 1)) current += 1;
    else current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

// Records строятся исключительно из уже отфильтрованных workout_logs.
// Неполные метрики исключаются из конкретного рекорда, но сам заплыв остаётся
// в lifetime count и календарных сериях.
export function computeSwimRecords(logs: readonly SwimRecordsLog[], todayIso: string): Omit<SwimRecordsData, "hasAnyHistory"> {
  const weekStart = isoWeekStart(todayIso);
  const monthStart = todayIso.slice(0, 7);
  const weekLogs = logs.filter((log) => log.date >= weekStart && log.date <= todayIso);
  const monthLogs = logs.filter((log) => log.date.startsWith(monthStart) && log.date <= todayIso);
  const distances = logs.filter((log) => validMetric(log.distanceMeters));
  const durations = logs.filter((log) => validMetric(log.durationSeconds));
  const weeks = aggregateBy(logs, (log) => isoWeekStart(log.date));
  const months = aggregateBy(logs, (log) => log.date.slice(0, 7));
  const days = aggregateBy(logs, (log) => log.date);
  const totalDistanceMeters = distances.length ? distances.reduce((sum, log) => sum + log.distanceMeters, 0) : null;
  const totalDurationSeconds = durations.length ? durations.reduce((sum, log) => sum + log.durationSeconds, 0) : null;

  return {
    totalDistanceMeters,
    totalSwims: logs.length,
    totalDurationSeconds,
    firstSwimDate: logs.length ? logs.reduce((first, log) => log.date < first ? log.date : first, logs[0].date) : null,
    periodBest: {
      week: { record: bestLog(weekLogs, (log) => validMetric(log.distanceMeters) ? log.distanceMeters : null), swimCount: weekLogs.length },
      month: { record: bestLog(monthLogs, (log) => validMetric(log.distanceMeters) ? log.distanceMeters : null), swimCount: monthLogs.length },
    },
    largestSwim: bestLog(logs, (log) => validMetric(log.distanceMeters) ? log.distanceMeters : null),
    fastestPace: bestLog(logs, (log) => validMetric(log.distanceMeters) && validMetric(log.durationSeconds) ? log.durationSeconds / (log.distanceMeters / 100) : null, "min"),
    longestDuration: bestLog(logs, (log) => validMetric(log.durationSeconds) ? log.durationSeconds : null),
    highestHeartRate: bestLog(logs, (log) => validMetric(log.avgHeartRate) ? log.avgHeartRate : null),
    mostCalories: bestLog(logs, (log) => validMetric(log.calories) ? log.calories : null),
    longestWeek: bestAggregate(weeks, (group) => group.value),
    longestMonth: bestAggregate(months, (group) => group.value),
    mostActiveMonth: bestAggregate(months, (group) => group.swimCount),
    longestStreakDays: longestStreak(logs),
    bestTrainingDay: bestAggregate(days, (group) => group.value),
    averageDistanceMeters: distances.length && totalDistanceMeters !== null ? Math.round(totalDistanceMeters / distances.length) : null,
  };
}
