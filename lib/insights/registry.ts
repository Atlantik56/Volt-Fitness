// AI-4 — Insight Layer registry (docs/INSIGHT_ENGINE.md, docs/ROADMAP_AI.md раздел AI-4).
//
// Не пересчитывает и не переопределяет доменную логику — только читает готовые
// результаты существующих чистых модулей (lib/coach-insights.ts, lib/evening.ts,
// lib/mood.ts) и оборачивает их в единый типизированный контракт (lib/insights/types.ts):
// id, evidence, confidence, usedSignals у каждого инсайта.
//
// Три экспортируемые функции соответствуют трём разным местам показа (не одному
// общему списку с общим лимитом — это сознательное решение, см. docs/INSIGHT_ENGINE.md
// "AI-4 implementation notes" внизу файла):
// - buildCardInsights: карточка "Что заметил VOLT" на главной. Ровно то же
//   поведение, что раньше давал buildCoachInsights (тот же id/tone/priority/
//   порядок/COACH_INSIGHTS_MAX) — только с достроенными полями контракта.
//   (GET /api/coach/insights удалён как мёртвый route без потребителей — решение
//   зафиксировано в docs/INSIGHT_ENGINE.md.)
// - buildEveningInsights: вкладка "Аналитика" вечернего прогресса.
// - buildMoodInsights: "Что заметил VOLT" в "Моя история" → "Состояние и заметки".

import { buildCoachInsights, COACH_INSIGHTS_MAX, type CoachInsight, type CoachInsightsInput } from "../coach-insights.ts";
import { findEveningPatterns } from "../evening.ts";
import { findMoodPatterns, MIN_PATTERN_ENTRIES, type MoodLog } from "../mood.ts";
import { daysBetween } from "../stats.ts";
import { hashEvidence, confidenceFromCount } from "./hash.ts";
import type { Insight, InsightCategory, InsightKind } from "./types.ts";

const REVISION = "ai4-v1";

function dateMinus(iso: string, days: number): string | undefined {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t - days * 86400000).toISOString().slice(0, 10);
}

// Структурная гарантия дедупликации id (docs/INSIGHT_ENGINE.md, раздел "Тесты":
// "Контракт и registry: стабильный порядок, дедупликация id") — сейчас каждый
// источник и так не производит повторов внутри себя, но список — публичный
// контракт registry, а не побочный эффект текущей реализации источников:
// дедуп не должен зависеть от того, что источники "случайно" его не нарушают.
function dedupeById(insights: Insight[]): Insight[] {
  const seen = new Set<string>();
  return insights.filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

// ---------------------------------------------------------------------------
// coach-insights.ts → Insight
//
// Evidence для каждого id — это honesty-релевантные счётчики уже присутствующие
// во входных данных (не переоткрытие внутренних порогов coach-insights.ts, а
// метаданные о том, сколько записей стояло за решением конкретного правила).

type CoachEvidence = { count: number; min: number; signals: string[]; periodDays?: number };

// Считает РАЗЛИЧНЫЕ даты в окне, а не количество строк — иначе несколько
// записей за один день (например, две тренировки или два приёма пищи в один
// день) задвоили бы evidenceCount и раздули confidence без реального роста
// доказательной базы. Так же считают и honesty-gate внутри coach-insights.ts
// (distinctDays в activityRhythmInsight, daysLogged7d в computeNutritionWeeklyStats).
function distinctDaysWithin(rows: { date: string }[], anchor: string, days: number): number {
  const dates = new Set<string>();
  for (const r of rows) {
    const gap = daysBetween(r.date, anchor);
    if (gap != null && gap >= 0 && gap < days) dates.add(r.date);
  }
  return dates.size;
}

function coachEvidence(insight: CoachInsight, input: CoachInsightsInput): CoachEvidence {
  switch (insight.id) {
    case "weight-plateau":
    case "weight-on-track":
    case "weight-off-track":
      return { count: distinctDaysWithin(input.measurements.filter(m => m.weight != null) as any, input.date, 14), min: 4, signals: ["measurements.weight"], periodDays: 14 };
    case "workouts-missed":
      // Утверждение "тренировок не было N дней" целиком опирается на одну
      // конкретную запись — дату последней тренировки, а не на то, сколько
      // всего тренировок когда-либо было сохранено в базе (это никак не
      // относится к достоверности утверждения о пропуске).
      return { count: 1, min: 1, signals: ["workouts.date", "planDays"] };
    case "plan-completion-good":
    case "plan-completion-low":
      return { count: distinctDaysWithin(input.workouts, input.date, 28), min: 8, signals: ["workouts.date", "planDays", "scheduleOverrides"], periodDays: 28 };
    case "protein-low-week":
      return { count: distinctDaysWithin(input.foodLogs, input.date, 7), min: 3, signals: ["foodLogs.protein"], periodDays: 7 };
    case "new-strength-record": {
      // Только записи ПО ЭТОМУ упражнению — не общее число силовых записей по
      // всем упражнениям (иначе конфиденс рекорда в одном упражнении рос бы от
      // того, сколько раз выполнялись совсем другие упражнения).
      const exercise = insight.title.replace(/^Новый рабочий вес: /, "");
      return { count: input.strengthLogs.filter(l => l.exercise === exercise).length, min: 2, signals: ["strengthLogs.weight"] };
    }
    case "activity-rhythm-up":
      return { count: distinctDaysWithin(input.workouts, input.date, 14), min: 4, signals: ["workouts.date"], periodDays: 14 };
    case "mood-pattern":
      return { count: (input.moodLogs ?? []).length, min: MIN_PATTERN_ENTRIES, signals: ["moodLogs.mood", "workouts.date", "activity.sleepHours"] };
    default:
      // Неизвестный (будущий) id из coach-insights.ts — не должно случиться, но не
      // должно и падать: честная нулевая уверенность вместо выдуманного числа.
      return { count: 0, min: 1, signals: [] };
  }
}

const COACH_KIND: Record<string, InsightKind> = { "new-strength-record": "milestone", "mood-pattern": "pattern" };

function adaptCoachInsight(insight: CoachInsight, input: CoachInsightsInput): Insight {
  const ev = coachEvidence(insight, input);
  const evidence = [...ev.signals, `count:${ev.count}`];
  return {
    id: insight.id,
    category: insight.category as InsightCategory,
    kind: COACH_KIND[insight.id] ?? "observation",
    tone: insight.tone,
    priority: insight.priority,
    title: insight.title,
    summary: insight.text,
    confidence: confidenceFromCount(ev.count, ev.min),
    evidenceCount: ev.count,
    evidenceHash: hashEvidence(evidence, REVISION),
    sourceRevision: REVISION,
    periodStart: ev.periodDays ? dateMinus(input.date, ev.periodDays) : undefined,
    periodEnd: ev.periodDays ? input.date : undefined,
    usedSignals: ev.signals,
  };
}

// Единая точка показа "Что заметил VOLT" на главной и в GET /api/coach/insights.
// Сознательно НЕ включает полный список вечерних/mood-паттернов — это отдельные
// поверхности (buildEveningInsights/buildMoodInsights), см. заметку вверху файла.
export function buildCardInsights(input: CoachInsightsInput, anchor: Date = new Date(`${input.date}T12:00:00Z`)): Insight[] {
  const raw = buildCoachInsights(input, anchor);
  return dedupeById(raw.slice(0, COACH_INSIGHTS_MAX).map(i => adaptCoachInsight(i, input)));
}

// ---------------------------------------------------------------------------
// lib/evening.ts findEveningPatterns → Insight
//
// findEveningPatterns возвращает фиксированные (не интерполированные) строки —
// поэтому текст правила однозначно определяет стабильный id, без парсинга чисел.

const EVENING_PATTERN_IDS: Record<string, string> = {
  "В тренировочные дни ты обычно начинаешь пить позже.": "evening-training-later-drink",
  "После полноценного ужина количество алкоголя обычно меньше.": "evening-dinner-less-alcohol",
  "По пятницам желание выпить обычно выше.": "evening-friday-more-alcohol",
  "За последние две недели сон улучшился одновременно с ростом активности.": "evening-sleep-activity-up",
};
const EVENING_PATTERN_SIGNALS: Record<string, string[]> = {
  "evening-training-later-drink": ["activity.firstDrinkTime", "workouts.date"],
  "evening-dinner-less-alcohol": ["activity.dinner", "activity.beers"],
  "evening-friday-more-alcohol": ["activity.beers", "activity.date"],
  "evening-sleep-activity-up": ["activity.sleepHours", "activity.activeMinutes"],
};
// Наименьший порог среди honesty gate внутри findEveningPatterns (`>= 3` записей
// на группу) — единая консервативная оценка вместо переоткрытия каждого порога.
const EVENING_MIN_ENTRIES = 3;

function fallbackPatternId(prefix: string, text: string): string {
  return `${prefix}-${hashEvidence([text], REVISION)}`;
}

export function buildEveningInsights(activity: any[], workouts: { date: string }[]): Insight[] {
  const patterns = findEveningPatterns(activity, workouts);
  return dedupeById(patterns.map(text => {
    const id = EVENING_PATTERN_IDS[text] ?? fallbackPatternId("evening-pattern", text);
    const signals = EVENING_PATTERN_SIGNALS[id] ?? ["activity"];
    const count = activity.length;
    return {
      id,
      category: "evening" as InsightCategory,
      kind: "pattern" as InsightKind,
      tone: "info" as const,
      priority: 5,
      title: "Есть закономерность",
      summary: text,
      confidence: confidenceFromCount(count, EVENING_MIN_ENTRIES),
      evidenceCount: count,
      evidenceHash: hashEvidence([...signals, `count:${count}`], REVISION),
      sourceRevision: REVISION,
      usedSignals: signals,
    };
  }));
}

// ---------------------------------------------------------------------------
// lib/mood.ts findMoodPatterns → Insight

const MOOD_PATTERN_IDS: Record<string, string> = {
  "В дни тренировок настроение в среднем лучше.": "mood-training-better",
  "После полноценного сна настроение чаще лучше.": "mood-sleep-better",
};
const MOOD_PATTERN_SIGNALS: Record<string, string[]> = {
  "mood-training-better": ["moodLogs.mood", "workouts.date"],
  "mood-sleep-better": ["moodLogs.mood", "activity.sleepHours"],
};

export function buildMoodInsights(moodLogs: MoodLog[], workouts: { date: string }[], activity: any[]): Insight[] {
  const patterns = findMoodPatterns(moodLogs, workouts, activity);
  return dedupeById(patterns.map(text => {
    const id = MOOD_PATTERN_IDS[text] ?? fallbackPatternId("mood-pattern", text);
    const signals = MOOD_PATTERN_SIGNALS[id] ?? ["moodLogs.mood"];
    const count = moodLogs.length;
    return {
      id,
      category: "mood" as InsightCategory,
      kind: "pattern" as InsightKind,
      tone: "info" as const,
      priority: 5,
      title: "Заметна связь с настроением",
      summary: text,
      confidence: confidenceFromCount(count, MIN_PATTERN_ENTRIES),
      evidenceCount: count,
      evidenceHash: hashEvidence([...signals, `count:${count}`], REVISION),
      sourceRevision: REVISION,
      usedSignals: signals,
    };
  }));
}
