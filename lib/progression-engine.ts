// Sprint 6.12 — детерминированная прогрессия нагрузки после тренировки.
// Чистые функции: без обращения к БД и без ИИ. Один и тот же вход — один и тот же
// допустимый выход. AI (lib/ai-hub.ts) используется только для объяснения уже
// посчитанного здесь предложения, а не для его расчёта.

import { progressionAllowed, type CoachAction } from "./coach.ts";
import { round1 } from "./stats.ts";

export type ProgressionAction = "increase" | "maintain" | "decrease" | "deload" | "no-change";
export type ProgressionStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type ProgressionLoad = { weight: number; reps: number };

export type ProgressionProposal = {
  exercise: string;
  action: ProgressionAction;
  reasonCode: string;
  reason: string;
  usedSignals: string[];
  limitedData: boolean;
  from: ProgressionLoad;
  to: ProgressionLoad;
};

export type StrengthHistoryEntry = { date: string; weight: number; reps: number; difficulty: string };

export type ProgressionWorkoutContext = {
  exercise: string;
  painAfter: number;
  effort: string;
  workoutComplete: boolean;
  coachAction: CoachAction | null;
  // От новой записи к старой; history[0] — только что сохранённый результат.
  history: StrengthHistoryEntry[];
  targetMaxReps: number | null;
};

// Гантели — мелкий шаг; тренажёры и штанга — стандартный дискретный шаг стека/блинов.
export function weightStep(name: string, weight: number): number {
  if (weight <= 0) return 1;
  return /гантел/i.test(name) ? 1 : 2.5;
}

const noChange = (exercise: string, reasonCode: string, reason: string, from: ProgressionLoad): ProgressionProposal => ({
  exercise, action: "no-change", reasonCode, reason, usedSignals: [], limitedData: true, from, to: from,
});

const held = (exercise: string, reasonCode: string, reason: string, usedSignals: string[], from: ProgressionLoad): ProgressionProposal => ({
  exercise, action: "maintain", reasonCode, reason, usedSignals, limitedData: false, from, to: from,
});

// Единственная точка входа: детерминированно решает следующую нагрузку по одному упражнению.
export function buildExerciseProgression(ctx: ProgressionWorkoutContext): ProgressionProposal {
  const { exercise, history } = ctx;
  const current = history[0] ?? null;
  const from: ProgressionLoad = { weight: current?.weight ?? 0, reps: current?.reps ?? 0 };

  if (!current) return noChange(exercise, "no-history", "Нет сохранённой записи по этому упражнению — предложение не строится.", { weight: 0, reps: 0 });

  const severePain = ctx.painAfter >= 5 || current.difficulty === "Боль";
  if (severePain) {
    const signal = current.difficulty === "Боль" ? "сложность упражнения «Боль»" : `боль после тренировки ${ctx.painAfter}/10`;
    const lighter = from.weight > 0 ? Math.max(0, round1(from.weight * 0.875)) : 0;
    return {
      exercise, action: "deload", reasonCode: "pain-deload",
      reason: "Боль требует снижения нагрузки, а не увеличения.",
      usedSignals: [signal], limitedData: false, from, to: { weight: lighter, reps: from.reps },
    };
  }

  const moderatePain = ctx.painAfter >= 3;
  const blockedByCoach = !progressionAllowed(ctx.coachAction);
  const incomplete = !ctx.workoutComplete;

  if (moderatePain || blockedByCoach || incomplete) {
    const usedSignals: string[] = [];
    if (moderatePain) usedSignals.push(`боль после тренировки ${ctx.painAfter}/10`);
    if (blockedByCoach) usedSignals.push("щадящее решение RITMOVIS Coach");
    if (incomplete) usedSignals.push("тренировка не завершена полностью");
    return held(
      exercise,
      moderatePain ? "pain-hold" : blockedByCoach ? "coach-hold" : "incomplete-hold",
      "Сигналы не позволяют повышать нагрузку сегодня — сохраняем прежний вес и повторы.",
      usedSignals, from,
    );
  }

  const previous = history[1] ?? null;
  const twoEasy = current.difficulty === "Легко" && previous?.difficulty === "Легко";
  const twoHard = current.difficulty === "Тяжело" && previous?.difficulty === "Тяжело";
  const repsAtMax = ctx.targetMaxReps != null && current.reps >= ctx.targetMaxReps;

  if (twoEasy && (ctx.targetMaxReps == null || repsAtMax)) {
    const usedSignals = ["два подряд «Легко»"];
    if (ctx.targetMaxReps != null) usedSignals.push(`достигнут верх диапазона повторов (${ctx.targetMaxReps})`);
    const step = weightStep(exercise, from.weight);
    return {
      exercise, action: "increase", reasonCode: "two-easy-increase",
      reason: `Две тренировки подряд легко даются при текущем весе${ctx.targetMaxReps != null ? " и верх диапазона повторов достигнут" : ""} — можно немного увеличить нагрузку.`,
      usedSignals, limitedData: false, from, to: { weight: round1(from.weight + step), reps: from.reps },
    };
  }

  if (twoHard) {
    const step = weightStep(exercise, from.weight) * 0.5;
    return {
      exercise, action: "decrease", reasonCode: "two-hard-decrease",
      reason: "Две тренировки подряд даются тяжело без явной боли — стоит немного снизить нагрузку, чтобы вернуть чистую технику.",
      usedSignals: ["два подряд «Тяжело»"], limitedData: false, from, to: { weight: Math.max(0, round1(from.weight - step)), reps: from.reps },
    };
  }

  if (!previous) return noChange(exercise, "insufficient-history", "Недостаточно истории по упражнению для уверенного предложения — сохраняем текущую нагрузку.", from);

  return held(exercise, "steady-maintain", "Показатели стабильны — прежний вес и повторы остаются подходящими.", [], from);
}

const loadsEqual = (a: ProgressionLoad, b: ProgressionLoad) => a.weight === b.weight && a.reps === b.reps;

// CoachMemory: не повторяем то же самое отклонённое предложение, если новых данных не появилось.
export function shouldSuppressRepeat(
  previousDecision: { status: ProgressionStatus; action: ProgressionAction; reasonCode: string; from: ProgressionLoad; to: ProgressionLoad } | null,
  candidate: ProgressionProposal,
): boolean {
  if (!previousDecision || previousDecision.status !== "rejected") return false;
  return previousDecision.action === candidate.action
    && previousDecision.reasonCode === candidate.reasonCode
    && loadsEqual(previousDecision.from, candidate.from)
    && loadsEqual(previousDecision.to, candidate.to);
}

// Серверная повторная валидация перед применением: свежий пересчёт должен буквально
// совпасть с тем, что хранится как предложение. Несовпадение — либо данные успели
// измениться (новая тренировка того же упражнения), либо клиент подменил значения.
export function validateProgressionMatch(
  stored: { action: ProgressionAction; to: ProgressionLoad },
  recomputed: ProgressionProposal,
): boolean {
  return stored.action === recomputed.action && loadsEqual(stored.to, recomputed.to);
}

const TRANSITIONS: Record<ProgressionStatus, ProgressionStatus[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["cancelled"],
  rejected: [],
  cancelled: [],
};

// Защита от повторного применения: принять/отклонить можно только «свежее» предложение,
// отменить — только уже принятое, и ни один переход не выполняется дважды.
export function canTransitionStatus(current: ProgressionStatus, target: ProgressionStatus): boolean {
  return TRANSITIONS[current]?.includes(target) ?? false;
}
