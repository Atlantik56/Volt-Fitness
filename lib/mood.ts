// «Состояние и заметки» — самонаблюдение, а не диагностика. Настроение здесь всегда
// субъективная самооценка пользователя; закономерности показываем только когда данных
// достаточно, и никогда не делаем вывод по одной записи.

import { avg } from "./evening.ts";
import { localIsoDate, periodCutoffDate, type Period } from "../app/progress-model.ts";

export const MOOD_OPTIONS = ["😊", "🙂", "😐", "😔", "😢", "😡"] as const;
export type Mood = (typeof MOOD_OPTIONS)[number];

const MOOD_SCORE: Record<string, number> = { "😊": 5, "🙂": 4, "😐": 3, "😔": 2, "😢": 1, "😡": 1 };

export type MoodLog = { id: number; date: string; mood: string; note: string; createdAt?: string };

const MIN_PATTERN_ENTRIES = 5;
const MIN_BUCKET_ENTRIES = 3;

export function moodScore(mood: string): number | null {
  return MOOD_SCORE[mood] ?? null;
}

export function latestMood(logs: MoodLog[]): MoodLog | null {
  if (!logs.length) return null;
  return [...logs].sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)))[0];
}

export function filterMoodByPeriod(logs: MoodLog[], period: Period, anchor: Date): MoodLog[] {
  const cutoff = periodCutoffDate(period, anchor);
  if (!cutoff) return logs;
  const cutoffIso = localIsoDate(cutoff);
  return logs.filter(l => l.date >= cutoffIso);
}

const MONTH_LABELS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export type MoodMonthGroup = { key: string; label: string; entries: MoodLog[] };
export type MoodYearGroup = { year: string; months: MoodMonthGroup[] };

export function groupMoodByMonth(logs: MoodLog[]): MoodYearGroup[] {
  const years = new Map<string, Map<string, MoodLog[]>>();
  for (const log of logs) {
    const year = log.date.slice(0, 4);
    const monthKey = log.date.slice(0, 7);
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year)!;
    if (!months.has(monthKey)) months.set(monthKey, []);
    months.get(monthKey)!.push(log);
  }
  return [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, entries]) => ({ key, label: MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? key, entries })),
    }));
}

// Лучшая (максимальная) оценка настроения за день — если записей за день несколько.
function bestScoreByDate(logs: MoodLog[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const log of logs) {
    const score = moodScore(log.mood);
    if (score == null) continue;
    const prev = byDate.get(log.date);
    if (prev == null || score > prev) byDate.set(log.date, score);
  }
  return byDate;
}

export function findMoodPatterns(moodLogs: MoodLog[], workouts: { date: string }[], activity: any[]): string[] {
  const patterns: string[] = [];
  if (moodLogs.length < MIN_PATTERN_ENTRIES) return patterns;
  const byDate = bestScoreByDate(moodLogs);

  const workoutDates = new Set(workouts.map(w => w.date));
  const onTrain: number[] = [], offTrain: number[] = [];
  for (const [date, score] of byDate) (workoutDates.has(date) ? onTrain : offTrain).push(score);
  if (onTrain.length >= MIN_BUCKET_ENTRIES && offTrain.length >= MIN_BUCKET_ENTRIES && avg(onTrain) - avg(offTrain) >= 0.5) {
    patterns.push("В дни тренировок настроение в среднем лучше.");
  }

  const sleepByDate = new Map(activity.map((a: any) => [a.date, Number(a.sleepHours) || 0]));
  const goodSleep: number[] = [], poorSleep: number[] = [];
  for (const [date, score] of byDate) {
    const sleep = sleepByDate.get(date);
    if (!sleep) continue;
    (sleep >= 7 ? goodSleep : poorSleep).push(score);
  }
  if (goodSleep.length >= MIN_BUCKET_ENTRIES && poorSleep.length >= MIN_BUCKET_ENTRIES && avg(goodSleep) - avg(poorSleep) >= 0.5) {
    patterns.push("После полноценного сна настроение чаще лучше.");
  }

  return patterns;
}
