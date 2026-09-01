import { isCyclingSlot } from "./cycling.ts";
import { isSwimActivity } from "./swim-classify.ts";

export const ANALYTICS_RANGES = ["current_week", "previous_week", "4_weeks", "8_weeks", "12_weeks", "current_month", "previous_month"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export type AnalyticsSport = "strength" | "swim" | "cycling" | "cardio" | "recovery";

export type AnalyticsPeriod = {
  key: AnalyticsRange;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  label: string;
};

export type AnalyticsWorkout = {
  id: number;
  date: string;
  sport: AnalyticsSport;
  title: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgSpeedKph: number | null;
  metricsSource: "manual" | "imported_fit" | "unknown";
};

export type AnalyticsStrengthSet = {
  workoutId: number;
  date: string;
  exercise: string;
  weightKg: number | null;
  reps: number | null;
};

export type AnalyticsPlannedSlot = {
  date: string;
  sport: AnalyticsSport;
  title: string;
  required: boolean;
};

export type MetricComparison = {
  current: number;
  previous: number;
  delta: number;
  percentChange: number | null;
  state: "up" | "down" | "same" | "new" | "no_data";
};

export type AnalyticsTrendPoint = {
  from: string;
  to: string;
  label: string;
  sessions: number;
  durationMinutes: number;
  distanceMeters: number;
  strengthVolumeKg: number;
};

export type AnalyticsSportSummary = {
  sport: AnalyticsSport;
  sessions: number;
  durationMinutes: number;
  distanceMeters: number | null;
  calories: number | null;
  avgHeartRate: number | null;
};

export type AnalyticsOverview = {
  period: AnalyticsPeriod;
  overview: {
    workouts: number;
    activeDays: number;
    activeWeeks: number;
    durationMinutes: number;
    distanceMeters: number | null;
    calories: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
    weeklyConsistencyStreak: number;
    bySport: AnalyticsSportSummary[];
  };
  consistency: {
    activeWeeks: number;
    totalWeeks: number;
    activeWeekPercent: number;
    workoutsPerActiveWeek: number | null;
  };
  plan: {
    planned: number;
    completed: number;
    skipped: number;
    completionPercent: number | null;
    bySport: Array<{ sport: AnalyticsSport; planned: number; completed: number; skipped: number; completionPercent: number | null }>;
  };
  strength: {
    workouts: number;
    exercises: number;
    sets: number;
    reps: number;
    volumeKg: number;
    progression: Array<{ exercise: string; firstWeightKg: number; latestWeightKg: number; bestWeightKg: number; deltaKg: number; observations: number }>;
  };
  swim: {
    workouts: number;
    distanceMeters: number | null;
    durationMinutes: number;
    averagePaceSecondsPer100m: number | null;
    longestSwimMeters: number | null;
    planned: number;
    completedPlanned: number;
  };
  cycling: {
    workouts: number;
    distanceMeters: number | null;
    durationMinutes: number;
    avgSpeedKph: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
    cadenceRpm: null;
    powerWatts: null;
    elevationGainMeters: null;
  };
  trends: {
    weekly: AnalyticsTrendPoint[];
  };
  comparisons: {
    workouts: MetricComparison;
    durationMinutes: MetricComparison;
    distanceMeters: MetricComparison;
    strengthVolumeKg: MetricComparison;
    planCompletionPercent: MetricComparison | null;
  };
  dataCoverage: {
    includedWorkouts: number;
    excludedStravaWorkouts: number;
    manualWorkouts: number;
    importedFitWorkouts: number;
    unknownSourceWorkouts: number;
    withDuration: number;
    withDistance: number;
    withHeartRate: number;
    withCalories: number;
    unavailableMetrics: string[];
  };
  insights: Array<{ id: string; tone: "good" | "neutral" | "warn"; title: string; summary: string; evidence: string }>;
};

export type AnalyticsBundle = {
  generatedAt: string;
  defaultRange: AnalyticsRange;
  ranges: Record<AnalyticsRange, AnalyticsOverview>;
};

export type RawAnalyticsWorkout = {
  id: unknown;
  date: unknown;
  type: unknown;
  title: unknown;
  durationSeconds: unknown;
  distanceMeters: unknown;
  calories: unknown;
  avgHeartRate: unknown;
  maxHeartRate: unknown;
  avgSpeed: unknown;
  metricsSource: unknown;
  externalActivitySource: unknown;
};

export type RawStrengthSet = {
  workoutId: unknown;
  date: unknown;
  exercise: unknown;
  weight: unknown;
  reps: unknown;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const finitePositive = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const finiteNonNegative = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const round1 = (value: number) => Math.round(value * 10) / 10;
const pluralRu = (value: number, one: string, few: string, many: string) => {
  const mod100 = Math.abs(value) % 100, mod10 = mod100 % 10;
  return mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
};

export function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  return addIsoDays(iso, -(weekday - 1));
}

function monthStart(iso: string): string { return `${iso.slice(0, 7)}-01`; }
function shiftMonthStart(iso: string, months: number): string {
  const date = new Date(`${monthStart(iso)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}
function monthEnd(iso: string): string { return addIsoDays(shiftMonthStart(iso, 1), -1); }
export function resolveAnalyticsPeriod(key: AnalyticsRange, todayIso: string): AnalyticsPeriod {
  if (!datePattern.test(todayIso)) throw new Error("Invalid analytics anchor date");
  let from: string;
  let to: string;
  if (key === "current_week") { from = mondayOf(todayIso); to = todayIso; }
  else if (key === "previous_week") { to = addIsoDays(mondayOf(todayIso), -1); from = addIsoDays(to, -6); }
  else if (key === "4_weeks" || key === "8_weeks" || key === "12_weeks") {
    const days = Number(key.split("_")[0]) * 7;
    to = todayIso; from = addIsoDays(todayIso, -(days - 1));
  } else if (key === "current_month") { from = monthStart(todayIso); to = todayIso; }
  else {
    to = addIsoDays(monthStart(todayIso), -1);
    from = monthStart(to);
  }
  const length = Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000) + 1;
  let previousFrom: string;
  let previousTo: string;
  if (key === "current_week") {
    previousFrom = addIsoDays(from, -7);
    previousTo = addIsoDays(to, -7);
  } else if (key === "current_month") {
    previousFrom = shiftMonthStart(from, -1);
    previousTo = [addIsoDays(previousFrom, length - 1), monthEnd(previousFrom)].sort()[0];
  } else if (key === "previous_month") {
    previousFrom = shiftMonthStart(from, -1);
    previousTo = monthEnd(previousFrom);
  } else {
    previousTo = addIsoDays(from, -1);
    previousFrom = addIsoDays(previousTo, -(length - 1));
  }
  const labels: Record<AnalyticsRange, string> = {
    current_week: "Эта неделя", previous_week: "Прошлая неделя", "4_weeks": "4 недели", "8_weeks": "8 недель", "12_weeks": "12 недель", current_month: "Этот месяц", previous_month: "Прошлый месяц",
  };
  return { key, from, to, previousFrom, previousTo, label: labels[key] };
}

export function classifyAnalyticsSport(candidate: { type?: unknown; title?: unknown; id?: unknown; discipline?: unknown }): AnalyticsSport {
  const discipline = String(candidate.discipline ?? "").toLowerCase();
  if (discipline === "swim") return "swim";
  if (discipline === "bike" || discipline === "cycling") return "cycling";
  if (discipline === "strength") return "strength";
  if (discipline === "recovery") return "recovery";
  if (isSwimActivity(String(candidate.type ?? ""), String(candidate.title ?? ""))) return "swim";
  if (isCyclingSlot(candidate)) return "cycling";
  const text = `${candidate.type ?? ""} ${candidate.title ?? ""}`.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  if (/восстанов|мобильност|прогулк|отдых/.test(text)) return "recovery";
  if (/кардио|ходьб|бег|эллипс|греб/.test(text)) return "cardio";
  return "strength";
}

export function normalizeAnalyticsWorkouts(rows: readonly RawAnalyticsWorkout[]): { included: AnalyticsWorkout[]; excludedStrava: number } {
  const included: AnalyticsWorkout[] = [];
  let excludedStrava = 0;
  for (const row of rows) {
    if (String(row.externalActivitySource ?? "").toLowerCase() === "strava") { excludedStrava += 1; continue; }
    const id = Number(row.id);
    const date = String(row.date ?? "");
    if (!Number.isSafeInteger(id) || id < 1 || !datePattern.test(date)) continue;
    const source = String(row.metricsSource ?? "");
    included.push({
      id, date, sport: classifyAnalyticsSport(row), title: String(row.title ?? ""),
      durationSeconds: finitePositive(row.durationSeconds), distanceMeters: finitePositive(row.distanceMeters),
      calories: finitePositive(row.calories), avgHeartRate: finitePositive(row.avgHeartRate), maxHeartRate: finitePositive(row.maxHeartRate),
      avgSpeedKph: finitePositive(row.avgSpeed), metricsSource: source === "manual" ? "manual" : source === "imported_metric" ? "imported_fit" : "unknown",
    });
  }
  return { included, excludedStrava };
}

export function normalizeStrengthSets(rows: readonly RawStrengthSet[], allowedWorkoutIds: ReadonlySet<number>): AnalyticsStrengthSet[] {
  return rows.flatMap((row) => {
    const workoutId = Number(row.workoutId), date = String(row.date ?? ""), exercise = String(row.exercise ?? "").trim();
    if (!allowedWorkoutIds.has(workoutId) || !datePattern.test(date) || !exercise) return [];
    return [{ workoutId, date, exercise, weightKg: finiteNonNegative(row.weight), reps: finiteNonNegative(row.reps) }];
  });
}

function inRange<T extends { date: string }>(rows: readonly T[], from: string, to: string): T[] { return rows.filter((row) => row.date >= from && row.date <= to); }
function sumPresent(rows: readonly AnalyticsWorkout[], key: "distanceMeters" | "calories"): number | null {
  const values = rows.map((row) => row[key]).filter((value): value is number => value !== null);
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0)) : null;
}
function averagePresent(rows: readonly AnalyticsWorkout[], key: "avgHeartRate"): number | null {
  const values = rows.map((row) => row[key]).filter((value): value is number => value !== null);
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}
function maxPresent(rows: readonly AnalyticsWorkout[], key: "maxHeartRate"): number | null {
  const values = rows.map((row) => row[key]).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}
function durationMinutes(rows: readonly AnalyticsWorkout[]): number { return Math.round(rows.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0) / 60); }
function strengthVolume(rows: readonly AnalyticsStrengthSet[]): number { return round1(rows.reduce((sum, row) => sum + (row.weightKg ?? 0) * (row.reps ?? 0), 0)); }

export function compareMetric(current: number, previous: number, hasData = true): MetricComparison {
  const delta = round1(current - previous);
  if (!hasData) return { current, previous, delta, percentChange: null, state: "no_data" };
  if (previous === 0 && current > 0) return { current, previous, delta, percentChange: null, state: "new" };
  const percentChange = previous === 0 ? 0 : round1((delta / previous) * 100);
  return { current, previous, delta, percentChange, state: delta > 0 ? "up" : delta < 0 ? "down" : "same" };
}

function planSummary(plans: readonly AnalyticsPlannedSlot[], workouts: readonly AnalyticsWorkout[]) {
  const required = plans.filter((plan) => plan.required);
  const available = new Map<string, number>();
  for (const workout of workouts) available.set(`${workout.date}:${workout.sport}`, (available.get(`${workout.date}:${workout.sport}`) ?? 0) + 1);
  const completedBySport = new Map<AnalyticsSport, number>();
  for (const slot of required) {
    const key = `${slot.date}:${slot.sport}`, count = available.get(key) ?? 0;
    if (count > 0) { available.set(key, count - 1); completedBySport.set(slot.sport, (completedBySport.get(slot.sport) ?? 0) + 1); }
  }
  const sports: AnalyticsSport[] = ["strength", "swim", "cycling", "cardio", "recovery"];
  const bySport = sports.map((sport) => {
    const planned = required.filter((slot) => slot.sport === sport).length, completed = completedBySport.get(sport) ?? 0;
    return { sport, planned, completed, skipped: Math.max(0, planned - completed), completionPercent: planned ? Math.round((completed / planned) * 100) : null };
  });
  const completed = bySport.reduce((sum, row) => sum + row.completed, 0);
  return { planned: required.length, completed, skipped: Math.max(0, required.length - completed), completionPercent: required.length ? Math.round((completed / required.length) * 100) : null, bySport };
}

function weeklyTrend(workouts: readonly AnalyticsWorkout[], sets: readonly AnalyticsStrengthSet[], from: string, to: string): AnalyticsTrendPoint[] {
  const points: AnalyticsTrendPoint[] = [];
  for (let start = mondayOf(from); start <= to; start = addIsoDays(start, 7)) {
    const end = [addIsoDays(start, 6), to].sort()[0];
    const visibleFrom = start < from ? from : start;
    const periodWorkouts = inRange(workouts, visibleFrom, end), periodSets = inRange(sets, visibleFrom, end);
    points.push({ from: visibleFrom, to: end, label: visibleFrom.slice(5), sessions: periodWorkouts.length, durationMinutes: durationMinutes(periodWorkouts), distanceMeters: sumPresent(periodWorkouts, "distanceMeters") ?? 0, strengthVolumeKg: strengthVolume(periodSets) });
  }
  return points;
}

function weeklyStreak(workouts: readonly AnalyticsWorkout[], anchor: string): number {
  const active = new Set(workouts.map((workout) => mondayOf(workout.date)));
  let week = mondayOf(anchor), streak = 0;
  if (!active.has(week)) week = addIsoDays(week, -7);
  while (active.has(week)) { streak += 1; week = addIsoDays(week, -7); }
  return streak;
}

function buildInsights(overview: Pick<AnalyticsOverview, "overview" | "plan" | "strength" | "swim" | "cycling" | "comparisons">): AnalyticsOverview["insights"] {
  const items: AnalyticsOverview["insights"] = [];
  if (overview.plan.completionPercent !== null) items.push({ id: "plan", tone: overview.plan.completionPercent >= 80 ? "good" : overview.plan.completionPercent < 50 ? "warn" : "neutral", title: overview.plan.completionPercent >= 80 ? "План выполняется устойчиво" : "План выполняется частично", summary: `Выполнено ${overview.plan.completed} из ${overview.plan.planned} обязательных тренировок.`, evidence: `${overview.plan.completionPercent}% за выбранный период` });
  const volume = overview.comparisons.strengthVolumeKg;
  if (overview.strength.sets > 0) items.push({ id: "strength", tone: volume.state === "up" ? "good" : "neutral", title: volume.state === "up" ? "Силовой объём вырос" : "Силовой объём зафиксирован", summary: `${overview.strength.sets} ${pluralRu(overview.strength.sets,"подход","подхода","подходов")} и ${overview.strength.reps} ${pluralRu(overview.strength.reps,"повторение","повторения","повторений")}.`, evidence: volume.percentChange === null ? `${overview.strength.volumeKg} кг·повт.` : `${volume.percentChange > 0 ? "+" : ""}${volume.percentChange}% к прошлому периоду` });
  if (overview.swim.workouts > 0) items.push({ id: "swim", tone: "neutral", title: "Плавание входит в общий ритм", summary: `${overview.swim.workouts} ${pluralRu(overview.swim.workouts,"тренировка","тренировки","тренировок")}${overview.swim.distanceMeters ? ` · ${Math.round(overview.swim.distanceMeters)} м` : ""}.`, evidence: overview.swim.averagePaceSecondsPer100m === null ? "Темп доступен только при наличии дистанции и времени" : `Средний темп ${Math.floor(overview.swim.averagePaceSecondsPer100m / 60)}:${String(Math.round(overview.swim.averagePaceSecondsPer100m % 60)).padStart(2, "0")} / 100 м` });
  if (overview.cycling.workouts > 0) items.push({ id: "cycling", tone: "neutral", title: "Велотренировки учтены отдельно", summary: `${overview.cycling.workouts} ${pluralRu(overview.cycling.workouts,"тренировка","тренировки","тренировок")} · ${overview.cycling.durationMinutes} мин.`, evidence: overview.cycling.avgSpeedKph === null ? "Скорость не записана" : `Средняя скорость ${overview.cycling.avgSpeedKph} км/ч` });
  if (!items.length) items.push({ id: "empty", tone: "neutral", title: "Пока недостаточно данных", summary: "Завершите тренировку, чтобы увидеть фактическую динамику.", evidence: "Синтетические значения не используются" });
  return items.slice(0, 5);
}

export function buildAnalyticsOverview(input: { period: AnalyticsPeriod; workouts: readonly AnalyticsWorkout[]; strengthSets: readonly AnalyticsStrengthSet[]; plans: readonly AnalyticsPlannedSlot[]; excludedStravaWorkouts: number }): AnalyticsOverview {
  const { period } = input;
  const current = inRange(input.workouts, period.from, period.to), previous = inRange(input.workouts, period.previousFrom, period.previousTo);
  const currentSets = inRange(input.strengthSets, period.from, period.to), previousSets = inRange(input.strengthSets, period.previousFrom, period.previousTo);
  const currentPlans = inRange(input.plans, period.from, period.to), previousPlans = inRange(input.plans, period.previousFrom, period.previousTo);
  const plan = planSummary(currentPlans, current), previousPlan = planSummary(previousPlans, previous);
  const bySport = (["strength", "swim", "cycling", "cardio", "recovery"] as AnalyticsSport[]).map((sport) => {
    const rows = current.filter((workout) => workout.sport === sport);
    return { sport, sessions: rows.length, durationMinutes: durationMinutes(rows), distanceMeters: sumPresent(rows, "distanceMeters"), calories: sumPresent(rows, "calories"), avgHeartRate: averagePresent(rows, "avgHeartRate") };
  });
  const strengthRows = current.filter((workout) => workout.sport === "strength");
  const swimRows = current.filter((workout) => workout.sport === "swim");
  const cyclingRows = current.filter((workout) => workout.sport === "cycling");
  const progression = [...new Set(currentSets.map((row) => row.exercise))].flatMap((exercise) => {
    const rows = currentSets.filter((row) => row.exercise === exercise && row.weightKg !== null).sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) return [];
    const first = rows[0].weightKg as number, latest = rows.at(-1)!.weightKg as number, best = Math.max(...rows.map((row) => row.weightKg as number));
    return [{ exercise, firstWeightKg: first, latestWeightKg: latest, bestWeightKg: best, deltaKg: round1(latest - first), observations: rows.length }];
  }).sort((a, b) => Math.abs(b.deltaKg) - Math.abs(a.deltaKg)).slice(0, 8);
  const swimDistance = sumPresent(swimRows, "distanceMeters");
  const swimDurationSeconds = swimRows.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0);
  const pacedSwims = swimRows.filter((row) => row.distanceMeters !== null && row.durationSeconds !== null);
  const pacedDistance = pacedSwims.reduce((sum, row) => sum + (row.distanceMeters ?? 0), 0), pacedDuration = pacedSwims.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0);
  const cyclingDistance = sumPresent(cyclingRows, "distanceMeters");
  const cyclingTimedDistance = cyclingRows.filter((row) => row.distanceMeters !== null && row.durationSeconds !== null);
  const cyclingHours = cyclingTimedDistance.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0) / 3600;
  const activeWeeks = new Set(current.map((row) => mondayOf(row.date))).size;
  const totalWeeks = weeklyTrend(current, currentSets, period.from, period.to).length;
  const overviewBase: AnalyticsOverview = {
    period,
    overview: { workouts: current.length, activeDays: new Set(current.map((row) => row.date)).size, activeWeeks, durationMinutes: durationMinutes(current), distanceMeters: sumPresent(current, "distanceMeters"), calories: sumPresent(current, "calories"), avgHeartRate: averagePresent(current, "avgHeartRate"), maxHeartRate: maxPresent(current, "maxHeartRate"), weeklyConsistencyStreak: weeklyStreak(input.workouts.filter((row) => row.date <= period.to), period.to), bySport },
    consistency: { activeWeeks, totalWeeks, activeWeekPercent: totalWeeks ? Math.round((activeWeeks / totalWeeks) * 100) : 0, workoutsPerActiveWeek: activeWeeks ? round1(current.length / activeWeeks) : null },
    plan,
    strength: { workouts: strengthRows.length, exercises: new Set(currentSets.map((row) => row.exercise)).size, sets: currentSets.length, reps: Math.round(currentSets.reduce((sum, row) => sum + (row.reps ?? 0), 0)), volumeKg: strengthVolume(currentSets), progression },
    swim: { workouts: swimRows.length, distanceMeters: swimDistance, durationMinutes: Math.round(swimDurationSeconds / 60), averagePaceSecondsPer100m: pacedDistance > 0 ? round1(pacedDuration / (pacedDistance / 100)) : null, longestSwimMeters: swimRows.some((row) => row.distanceMeters !== null) ? Math.max(...swimRows.map((row) => row.distanceMeters ?? 0)) : null, planned: plan.bySport.find((row) => row.sport === "swim")?.planned ?? 0, completedPlanned: plan.bySport.find((row) => row.sport === "swim")?.completed ?? 0 },
    cycling: { workouts: cyclingRows.length, distanceMeters: cyclingDistance, durationMinutes: durationMinutes(cyclingRows), avgSpeedKph: cyclingHours > 0 ? round1(cyclingTimedDistance.reduce((sum, row) => sum + (row.distanceMeters ?? 0), 0) / 1000 / cyclingHours) : null, avgHeartRate: averagePresent(cyclingRows, "avgHeartRate"), maxHeartRate: maxPresent(cyclingRows, "maxHeartRate"), cadenceRpm: null, powerWatts: null, elevationGainMeters: null },
    trends: { weekly: weeklyTrend(current, currentSets, period.from, period.to) },
    comparisons: {
      workouts: compareMetric(current.length, previous.length), durationMinutes: compareMetric(durationMinutes(current), durationMinutes(previous)),
      distanceMeters: compareMetric(sumPresent(current, "distanceMeters") ?? 0, sumPresent(previous, "distanceMeters") ?? 0, current.some((row) => row.distanceMeters !== null) || previous.some((row) => row.distanceMeters !== null)),
      strengthVolumeKg: compareMetric(strengthVolume(currentSets), strengthVolume(previousSets), currentSets.length > 0 || previousSets.length > 0),
      planCompletionPercent: plan.completionPercent === null && previousPlan.completionPercent === null ? null : compareMetric(plan.completionPercent ?? 0, previousPlan.completionPercent ?? 0, plan.completionPercent !== null || previousPlan.completionPercent !== null),
    },
    dataCoverage: { includedWorkouts: current.length, excludedStravaWorkouts: input.excludedStravaWorkouts, manualWorkouts: current.filter((row) => row.metricsSource === "manual").length, importedFitWorkouts: current.filter((row) => row.metricsSource === "imported_fit").length, unknownSourceWorkouts: current.filter((row) => row.metricsSource === "unknown").length, withDuration: current.filter((row) => row.durationSeconds !== null).length, withDistance: current.filter((row) => row.distanceMeters !== null).length, withHeartRate: current.filter((row) => row.avgHeartRate !== null || row.maxHeartRate !== null).length, withCalories: current.filter((row) => row.calories !== null).length, unavailableMetrics: ["cadence", "power", "elevationGain", "swolf", "swimLengths", "swimIntervals"] },
    insights: [],
  };
  overviewBase.insights = buildInsights(overviewBase);
  return overviewBase;
}

export function buildAnalyticsCoachContext(overview: AnalyticsOverview) {
  return {
    period: overview.period,
    overview: overview.overview,
    consistency: overview.consistency,
    plan: overview.plan,
    strength: { workouts: overview.strength.workouts, sets: overview.strength.sets, reps: overview.strength.reps, volumeKg: overview.strength.volumeKg, progression: overview.strength.progression.slice(0, 3) },
    swim: overview.swim,
    cycling: overview.cycling,
    comparisons: overview.comparisons,
    dataCoverage: overview.dataCoverage,
  };
}
