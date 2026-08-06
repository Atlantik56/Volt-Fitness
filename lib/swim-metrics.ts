// Чистые функции форматирования и расчёта метрик VOLT Swim. Никогда не
// подставляют 0/NaN/Infinity вместо отсутствующих данных — вызывающий код
// показывает «Нет данных», получив null.

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
