// AI-6 — Milestones (docs/MILESTONES.md). Чистая детерминированная логика: без
// React, API и прямого доступа к БД. Автоматические вехи ВСЕГДА пересчитываются
// из существующих источников (measurements/workout_logs/strength_logs/
// program_stages/photos) — не хранятся и не копируют исходные данные, поэтому
// пересчёт истории не может создать дубли. Ручные вехи (таблица `milestones`)
// живут отдельно — см. lib/milestone-service.ts.
//
// Первый ограниченный набор типов (согласован в docs/MILESTONES.md):
// первая тренировка, 10/25/50/100 тренировок, личный рекорд, новый минимальный
// вес, завершение этапа программы, лучший завершённый месяц по регулярности
// (только при достаточных данных), контрольное фото раз в PHOTO_CHECKPOINT_MIN_DAYS
// дней. "Устойчивое улучшение показателя" из восьмого пункта спеки сознательно
// не дублируется здесь — это уже существующий weight-trend инсайт из AI-4
// (lib/coach-insights.ts, lib/insights/registry.ts); заводить вторую копию той
// же фактуры запрещено самой спекой ("не делать вторую копию исходных данных").

import { round1, daysBetween } from "./stats.ts";

export const MILESTONES_REVISION = "ai6-v1";

export type MilestoneCategory = "тело" | "тренировки" | "состояние" | "этапы" | "личное";
export type MilestoneKind =
  | "first-workout" | "workout-count" | "personal-record" | "new-min-weight"
  | "program-stage-completed" | "best-month-regularity" | "photo-checkpoint" | "manual";

// Контракт по docs/MILESTONES.md; `category` добавлено явно поверх спеки — она
// нужна UI для фильтров ("тело, тренировки, состояние, этапы, личные вехи"),
// как tone/priority были добавлены поверх контракта Insight в AI-4.
export type Milestone = {
  id: string;
  kind: MilestoneKind;
  occurredAt: string;
  title: string;
  summary: string;
  sourceIds: string[];
  sourceRevision: string;
  automatic: boolean;
  category: MilestoneCategory;
};

type WorkoutRow = { id: number; date: string };
type StrengthLogRow = { id: number; date: string; exercise: string; weight: number };
type MeasurementRow = { id: number; date: string; weight: number | null };
type ProgramStageRow = { id: number; title: string; endDate: string | null };
type PhotoRow = { id: number; date: string };

const byDateThenId = <T extends { date: string; id: number }>(a: T, b: T) => (a.date === b.date ? a.id - b.id : a.date.localeCompare(b.date));

// ---------------------------------------------------------------------------
// Первая тренировка

function buildFirstWorkoutMilestone(workouts: WorkoutRow[]): Milestone[] {
  if (!workouts.length) return [];
  const first = [...workouts].sort(byDateThenId)[0];
  return [{
    id: "first-workout", kind: "first-workout", occurredAt: first.date,
    title: "Первая тренировка", summary: "Начало истории тренировок в VOLT.",
    sourceIds: [`workout:${first.id}`], sourceRevision: MILESTONES_REVISION, automatic: true, category: "тренировки",
  }];
}

// ---------------------------------------------------------------------------
// 10/25/50/100 тренировок

const WORKOUT_COUNT_THRESHOLDS = [10, 25, 50, 100] as const;

function buildWorkoutCountMilestones(workouts: WorkoutRow[]): Milestone[] {
  const sorted = [...workouts].sort(byDateThenId);
  const out: Milestone[] = [];
  for (const n of WORKOUT_COUNT_THRESHOLDS) {
    if (sorted.length < n) continue;
    const nth = sorted[n - 1];
    out.push({
      id: `workout-count-${n}`, kind: "workout-count", occurredAt: nth.date,
      title: `${n} тренировок позади`, summary: `Сохранена ${n}-я тренировка — ${nth.date}.`,
      sourceIds: [`workout:${nth.id}`], sourceRevision: MILESTONES_REVISION, automatic: true, category: "тренировки",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Личный рекорд — вся история PR по каждому упражнению, не только последний.
// Первая запись по упражнению не считается рекордом (не с чем сравнивать) —
// тот же принцип, что и в lib/coach-insights.ts newRecordInsight.

function buildPersonalRecordMilestones(logs: StrengthLogRow[]): Milestone[] {
  const byExercise = new Map<string, StrengthLogRow[]>();
  for (const log of logs) {
    if (!byExercise.has(log.exercise)) byExercise.set(log.exercise, []);
    byExercise.get(log.exercise)!.push(log);
  }
  const out: Milestone[] = [];
  for (const [exercise, exerciseLogs] of byExercise) {
    const sorted = [...exerciseLogs].sort(byDateThenId);
    let best = -Infinity;
    for (const log of sorted) {
      if (log.weight > best) {
        if (best !== -Infinity) {
          out.push({
            id: `personal-record-${exercise}-${log.id}`, kind: "personal-record", occurredAt: log.date,
            title: `Новый рабочий вес: ${exercise}`, summary: `${round1(log.weight)} кг — новый максимум для этого упражнения.`,
            sourceIds: [`strength_log:${log.id}`], sourceRevision: MILESTONES_REVISION, automatic: true, category: "тренировки",
          });
        }
        best = log.weight;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Новый минимальный вес — тот же принцип: первая точка не рекорд.

function buildNewMinWeightMilestones(measurements: MeasurementRow[]): Milestone[] {
  const points = measurements.filter((m): m is MeasurementRow & { weight: number } => m.weight != null).sort(byDateThenId);
  const out: Milestone[] = [];
  let min = Infinity;
  for (const m of points) {
    if (m.weight < min) {
      if (min !== Infinity) {
        out.push({
          id: `new-min-weight-${m.id}`, kind: "new-min-weight", occurredAt: m.date,
          title: "Новый минимальный вес", summary: `${round1(m.weight)} кг — ниже всех предыдущих замеров.`,
          sourceIds: [`measurement:${m.id}`], sourceRevision: MILESTONES_REVISION, automatic: true, category: "тело",
        });
      }
      min = m.weight;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Завершение этапа программы

function buildProgramStageMilestones(stages: ProgramStageRow[]): Milestone[] {
  return stages
    .filter((s): s is ProgramStageRow & { endDate: string } => s.endDate != null && s.endDate !== "")
    .map(s => ({
      id: `program-stage-completed-${s.id}`, kind: "program-stage-completed" as const, occurredAt: s.endDate,
      title: `Завершён этап: ${s.title}`, summary: `Этап программы «${s.title}» завершён ${s.endDate}.`,
      sourceIds: [`program_stage:${s.id}`], sourceRevision: MILESTONES_REVISION, automatic: true, category: "этапы" as const,
    }));
}

// ---------------------------------------------------------------------------
// Лучший завершённый месяц по регулярности — honesty gate: только полностью
// завершённые месяцы (месяц anchor'а исключён — он ещё не закончился) и
// минимум BEST_MONTH_MIN_WORKOUTS тренировок, иначе месяц не участвует вовсе
// (не объявляется "лучшим" из-за недостатка данных).

const BEST_MONTH_MIN_WORKOUTS = 4;
const monthKey = (date: string) => date.slice(0, 7);

function buildBestMonthMilestones(workouts: WorkoutRow[], anchor: string): Milestone[] {
  const byMonth = new Map<string, WorkoutRow[]>();
  for (const w of workouts) {
    const k = monthKey(w.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(w);
  }
  const anchorMonth = monthKey(anchor);
  const completedMonths = [...byMonth.entries()].filter(([k]) => k < anchorMonth).sort((a, b) => a[0].localeCompare(b[0]));
  const out: Milestone[] = [];
  let best = 0;
  for (const [month, list] of completedMonths) {
    if (list.length < BEST_MONTH_MIN_WORKOUTS) continue; // недостаточно данных — месяц не участвует
    if (list.length > best) {
      const last = [...list].sort((a, b) => a.date.localeCompare(b.date))[list.length - 1];
      out.push({
        id: `best-month-${month}`, kind: "best-month-regularity", occurredAt: last.date,
        title: "Лучший месяц по регулярности", summary: `${month}: ${list.length} тренировок — новый рекорд регулярности.`,
        sourceIds: list.map(w => `workout:${w.id}`), sourceRevision: MILESTONES_REVISION, automatic: true, category: "тренировки",
      });
      best = list.length;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Контрольное фото — только факт и дата (docs/MILESTONES.md: "photos — только
// факт и дата"), никогда filename/content_type. Раз в PHOTO_CHECKPOINT_MIN_DAYS
// дней от предыдущего чекпоинта, начиная с первого фото.

const PHOTO_CHECKPOINT_MIN_DAYS = 30;

function buildPhotoCheckpointMilestones(photos: PhotoRow[]): Milestone[] {
  const sorted = [...photos].sort(byDateThenId);
  if (!sorted.length) return [];
  const out: Milestone[] = [{
    id: "photo-first", kind: "photo-checkpoint", occurredAt: sorted[0].date,
    title: "Первое фото прогресса", summary: "Сохранено первое контрольное фото.",
    sourceIds: [`photo:${sorted[0].id}`], sourceRevision: MILESTONES_REVISION, automatic: true, category: "тело",
  }];
  let lastCheckpoint = sorted[0].date;
  for (const p of sorted.slice(1)) {
    const gap = daysBetween(lastCheckpoint, p.date);
    if (gap != null && gap >= PHOTO_CHECKPOINT_MIN_DAYS) {
      out.push({
        id: `photo-checkpoint-${p.id}`, kind: "photo-checkpoint", occurredAt: p.date,
        title: "Контрольное фото прогресса", summary: `Прошло ${PHOTO_CHECKPOINT_MIN_DAYS}+ дней с предыдущего контрольного фото.`,
        sourceIds: [`photo:${p.id}`], sourceRevision: MILESTONES_REVISION, automatic: true, category: "тело",
      });
      lastCheckpoint = p.date;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Сборка и сортировка — порядок детерминирован независимо от порядка входных
// массивов (сортировка по occurredAt, при равенстве — по id).

export type MilestoneSources = {
  workouts: WorkoutRow[];
  strengthLogs: StrengthLogRow[];
  measurements: MeasurementRow[];
  programStages: ProgramStageRow[];
  photos: PhotoRow[];
  anchor: string; // сегодняшняя дата ISO — нужна только для honesty gate best-month
};

export function buildAutomaticMilestones(sources: MilestoneSources): Milestone[] {
  const all = [
    ...buildFirstWorkoutMilestone(sources.workouts),
    ...buildWorkoutCountMilestones(sources.workouts),
    ...buildPersonalRecordMilestones(sources.strengthLogs),
    ...buildNewMinWeightMilestones(sources.measurements),
    ...buildProgramStageMilestones(sources.programStages),
    ...buildBestMonthMilestones(sources.workouts, sources.anchor),
    ...buildPhotoCheckpointMilestones(sources.photos),
  ];
  return all.sort((a, b) => (a.occurredAt === b.occurredAt ? a.id.localeCompare(b.id) : a.occurredAt.localeCompare(b.occurredAt)));
}

// ---------------------------------------------------------------------------
// Группировка для временной шкалы — тот же паттерн, что groupHistoryByMonth
// (app/progress-model.ts) и groupMoodByMonth (lib/mood.ts): убывающий порядок
// (новое сверху), без потери событий.

const MONTH_LABELS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export type MilestoneMonthGroup = { key: string; label: string; items: Milestone[] };
export type MilestoneYearGroup = { year: string; months: MilestoneMonthGroup[] };

export function groupMilestonesByMonth(milestones: Milestone[]): MilestoneYearGroup[] {
  const years = new Map<string, Map<string, Milestone[]>>();
  for (const m of milestones) {
    const year = m.occurredAt.slice(0, 4);
    const key = m.occurredAt.slice(0, 7);
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year)!;
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(m);
  }
  return [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, items]) => ({
          key, label: MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? key,
          items: [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)),
        })),
    }));
}

export function filterMilestonesByCategory(milestones: Milestone[], category: MilestoneCategory | null): Milestone[] {
  return category ? milestones.filter(m => m.category === category) : milestones;
}

// AI Sprint 6 — для баннера "🎉 Поздравляем!" на главной: есть ли автоматическая
// веха, которая ещё не была показана (курсор last_seen_milestone_id хранится в
// settings, не здесь — эта функция сама ничего не хранит и не решает, где
// показывать). Ручные вехи не празднуются баннером: пользователь только что сам
// её ввёл. Требует, чтобы `milestones` уже был отсортирован по occurredAt
// убыванием (как возвращают buildAutomaticMilestones + сортировка вызывающей
// стороны) — сама не пересортировывает, чтобы не скрывать порядок вызывающего.
export function findNewAutomaticMilestone(milestones: readonly Milestone[], lastSeenMilestoneId: string | null): Milestone | null {
  const latestAutomatic = milestones.find(m => m.automatic) ?? null;
  if (!latestAutomatic || latestAutomatic.id === lastSeenMilestoneId) return null;
  return latestAutomatic;
}

// ---------------------------------------------------------------------------
// LLM-safe проекция — только то, что не является "сырыми заметками/фото".
// Ручные вехи хранят note отдельно от summary в БД (lib/milestone-service.ts) —
// эта функция подстраховывает длину summary независимо от источника.

export type MilestoneLlmSafe = { kind: MilestoneKind; occurredAt: string; title: string; summary: string };
const LLM_SAFE_SUMMARY_MAX_CHARS = 200;

export function toLlmSafeMilestone(m: Milestone): MilestoneLlmSafe {
  return { kind: m.kind, occurredAt: m.occurredAt, title: m.title, summary: m.summary.slice(0, LLM_SAFE_SUMMARY_MAX_CHARS) };
}

// ---------------------------------------------------------------------------
// Lite-обзор месяца (docs/MILESTONES.md "Месячный обзор") — без API/LLM.

export type MonthOverview = {
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  weightChange: number | null; // null = недостаточно замеров в этом месяце
  workoutsCount: number;
  personalRecords: { exercise: string; occurredAt: string }[];
  stagesCompleted: { title: string; occurredAt: string }[];
  milestones: Milestone[];
  hasEnoughData: boolean;
};

function lastDayOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export function buildMonthOverview(monthKeyValue: string, sources: MilestoneSources): MonthOverview {
  const periodStart = `${monthKeyValue}-01`;
  const periodEnd = lastDayOfMonth(monthKeyValue);
  const inMonth = (date: string) => date >= periodStart && date <= periodEnd;

  const monthMeasurements = sources.measurements.filter(m => m.weight != null && inMonth(m.date)).sort(byDateThenId);
  const weightChange = monthMeasurements.length >= 2
    ? round1((monthMeasurements[monthMeasurements.length - 1].weight as number) - (monthMeasurements[0].weight as number))
    : null;

  const workoutsCount = sources.workouts.filter(w => inMonth(w.date)).length;

  const allMilestones = buildAutomaticMilestones(sources).filter(m => inMonth(m.occurredAt));
  const personalRecords = allMilestones.filter(m => m.kind === "personal-record").map(m => ({ exercise: m.title.replace(/^Новый рабочий вес: /, ""), occurredAt: m.occurredAt }));
  const stagesCompleted = allMilestones.filter(m => m.kind === "program-stage-completed").map(m => ({ title: m.title.replace(/^Завершён этап: /, ""), occurredAt: m.occurredAt }));

  const hasEnoughData = workoutsCount > 0 || weightChange != null || allMilestones.length > 0;

  return { monthKey: monthKeyValue, periodStart, periodEnd, weightChange, workoutsCount, personalRecords, stagesCompleted, milestones: allMilestones, hasEnoughData };
}
