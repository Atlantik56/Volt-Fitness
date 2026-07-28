// Sprint 6.9 — Insights Engine.
// Детерминированный агрегатор: только читает уже существующие расчётные модели
// (training-analytics-model, coach-weekly) и складывает выводы в единый список.
// Никакого ИИ здесь нет и не должно быть — LLM только объясняет уже готовые факты.

import { computeNutritionWeeklyStats, computeWeightWeeklyTrend } from "./coach-weekly.ts";
import { computePeriodSummary, type ScheduleOverrideRecord, type WeeklyPlanDay, type WorkoutRecord } from "../app/training-analytics-model.ts";
import { findMoodPatterns, type MoodLog } from "./mood.ts";

export type CoachInsightCategory = "weight" | "training" | "nutrition" | "consistency" | "mood";
export type CoachInsightTone = "good" | "warn" | "info";

export type CoachInsight = {
  id: string;
  category: CoachInsightCategory;
  tone: CoachInsightTone;
  priority: number;
  title: string;
  text: string;
};

export type CoachInsightsInput = {
  date: string;
  measurements: { date: string; weight: number | null }[];
  workouts: WorkoutRecord[];
  foodLogs: { date: string; calories?: number; protein?: number }[];
  strengthLogs: { exercise: string; weight: number; date: string }[];
  planDays: WeeklyPlanDay[];
  scheduleOverrides?: ScheduleOverrideRecord[];
  targets: { calories: number; protein: number };
  targetWeight: number | null;
  moodLogs?: MoodLog[];
  activity?: { date: string; sleepHours?: number }[];
};

export const COACH_INSIGHTS_MAX = 4;

const round1 = (n: number) => Math.round(n * 10) / 10;

const daysBetween = (from: string, to: string) => {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
};

function weightInsight(input: CoachInsightsInput): CoachInsight | null {
  const trend = computeWeightWeeklyTrend(input.measurements, input.date);
  if (trend.avg7d == null || trend.avgPrev7d == null || trend.weekChange == null) return null;
  // Направление цели известно, только если задан targetWeight; иначе не судим "хорошо/плохо".
  const goalDirection = input.targetWeight != null ? (input.targetWeight < trend.avg7d ? "down" : "up") : null;
  if (trend.trend === "flat") return {
    id: "weight-plateau", category: "weight", tone: "info", priority: 2,
    title: "Вес почти не меняется",
    text: `Среднее за последние 7 дней ${trend.avg7d} кг, за предыдущие 7 — ${trend.avgPrev7d} кг: изменение меньше 0,2 кг.`,
  };
  if (goalDirection && trend.trend === goalDirection) return {
    id: "weight-on-track", category: "weight", tone: "good", priority: 3,
    title: "Вес движется к цели",
    text: `Среднее за неделю изменилось на ${trend.weekChange>0?"+":""}${trend.weekChange} кг по сравнению с предыдущей неделей.`,
  };
  if (goalDirection && trend.trend !== goalDirection) return {
    id: "weight-off-track", category: "weight", tone: "warn", priority: 1,
    title: "Вес движется в сторону от цели",
    text: `Среднее за неделю изменилось на ${trend.weekChange>0?"+":""}${trend.weekChange} кг — это не в сторону цели ${input.targetWeight} кг.`,
  };
  return null;
}

function missedWorkoutsInsight(input: CoachInsightsInput): CoachInsight | null {
  const hasTrainingPlan = input.planDays.some(d => d.type !== "Отдых");
  if (!hasTrainingPlan) return null;
  const last = [...input.workouts].filter(w => w.date <= input.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const gap = last ? daysBetween(last.date, input.date) : null;
  if (gap == null || gap < 3) return null;
  return {
    id: "workouts-missed", category: "training", tone: "warn", priority: 0,
    title: `Тренировок не было ${gap} ${dayWord(gap)}`,
    text: last ? `Последняя сохранённая тренировка — ${last.date}.` : "Сохранённых тренировок пока нет.",
  };
}

function planCompletionInsight(input: CoachInsightsInput, anchor: Date): CoachInsight | null {
  if (!input.planDays.some(d => d.type !== "Отдых")) return null;
  const summary = computePeriodSummary(input.workouts, input.planDays, "4W", anchor, input.scheduleOverrides);
  if (summary.planCompletionPct == null) return null;
  if (summary.planCompletionPct >= 80) return {
    id: "plan-completion-good", category: "consistency", tone: "good", priority: 4,
    title: "Высокое выполнение плана",
    text: `За последние 4 недели выполнено ${summary.planCompletionPct}% запланированных тренировочных дней.`,
  };
  if (summary.planCompletionPct < 40) return {
    id: "plan-completion-low", category: "consistency", tone: "warn", priority: 1.5,
    title: "Выполнение плана снизилось",
    text: `За последние 4 недели выполнено только ${summary.planCompletionPct}% запланированных тренировочных дней.`,
  };
  return null;
}

function nutritionInsight(input: CoachInsightsInput): CoachInsight | null {
  const stats = computeNutritionWeeklyStats(input.foodLogs, input.date, input.targets);
  if (stats.daysLogged7d < 3 || stats.avgProtein7d == null) return null;
  if (stats.avgProtein7d < input.targets.protein * 0.8) return {
    id: "protein-low-week", category: "nutrition", tone: "warn", priority: 2.5,
    title: "Белка за неделю не хватает",
    text: `В среднем ${stats.avgProtein7d} г белка в день (записано ${stats.daysLogged7d} из 7) при цели ${input.targets.protein} г.`,
  };
  return null;
}

function newRecordInsight(input: CoachInsightsInput): CoachInsight | null {
  const byExercise = new Map<string, { weight: number; date: string }[]>();
  for (const log of input.strengthLogs) {
    if (!byExercise.has(log.exercise)) byExercise.set(log.exercise, []);
    byExercise.get(log.exercise)!.push({ weight: log.weight, date: log.date });
  }
  for (const [exercise, logs] of byExercise) {
    if (logs.length < 2) continue; // первая запись — не рекорд, не с чем сравнивать
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const previousMax = Math.max(...sorted.slice(0, -1).map(x => x.weight));
    const gap = daysBetween(latest.date, input.date);
    if (gap != null && gap <= 7 && latest.weight > previousMax) return {
      id: "new-strength-record", category: "training", tone: "good", priority: 3.5,
      title: `Новый рабочий вес: ${exercise}`,
      text: `${round1(latest.weight)} кг ${latest.date} — больше предыдущего максимума ${round1(previousMax)} кг.`,
    };
  }
  return null;
}

// Sprint 6.13 — только позитивная ветка: сравнение с прошлой неделей не должно
// звучать как упрёк, поэтому здесь нет warn-варианта на спад ритма.
function activityRhythmInsight(input: CoachInsightsInput): CoachInsight | null {
  const distinctDays = (from: number, to: number) => new Set(
    input.workouts.filter(w => { const gap = daysBetween(w.date, input.date); return gap != null && gap >= from && gap < to; }).map(w => w.date),
  ).size;
  const thisWeek = distinctDays(0, 7), prevWeek = distinctDays(7, 14);
  if (thisWeek < 2 || thisWeek <= prevWeek) return null;
  return {
    id: "activity-rhythm-up", category: "consistency", tone: "good", priority: 4.2,
    title: "Ритм активности вырос",
    text: `На этой неделе тренировок было ${thisWeek} (дней с активностью), на прошлой — ${prevWeek}.`,
  };
}

// Опирается только на lib/mood.ts — не дублирует поиск закономерностей, только
// оборачивает первый найденный паттерн в формат CoachInsight для карточки на главной.
function moodInsight(input: CoachInsightsInput): CoachInsight | null {
  const patterns = findMoodPatterns(input.moodLogs ?? [], input.workouts, input.activity ?? []);
  if (!patterns.length) return null;
  return {
    id: "mood-pattern", category: "mood", tone: "info", priority: 3.7,
    title: "Заметна связь с настроением",
    text: patterns[0],
  };
}

function dayWord(n: number) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня";
  return "дней";
}

// Собирает инсайты из уже существующих детерминированных моделей и возвращает
// не более COACH_INSIGHTS_MAX, отсортированных по приоритету (меньше — важнее).
export function buildCoachInsights(input: CoachInsightsInput, anchor: Date = new Date(`${input.date}T12:00:00Z`)): CoachInsight[] {
  const candidates = [
    missedWorkoutsInsight(input),
    weightInsight(input),
    nutritionInsight(input),
    newRecordInsight(input),
    planCompletionInsight(input, anchor),
    activityRhythmInsight(input),
    moodInsight(input),
  ].filter((x): x is CoachInsight => x !== null);
  return candidates.sort((a, b) => a.priority - b.priority).slice(0, COACH_INSIGHTS_MAX);
}
