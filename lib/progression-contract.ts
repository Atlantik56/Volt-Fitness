// AI-14 — контракт прогрессии, независимый от дисциплины.
//
// Движок зала (lib/progression-engine.ts) решает «вес и повторы по упражнению».
// Плаванию и вело эти единицы не подходят: там дистанция с темпом и мощность с
// длительностью. Общее у всех трёх — форма решения: действие, код причины,
// использованные сигналы и признак нехватки данных.
//
// Поведение зала здесь не меняется: его правила остаются в progression-engine,
// а этот модуль лишь приводит их результат к общей форме и накладывает единый
// ограничитель восстановления.
//
// Считает код, объясняет ИИ (docs/AI_PRINCIPLES.md): здесь только чистые
// функции без обращения к БД и без вызовов моделей.
import type { ProgressionAction, ProgressionProposal } from "./progression-engine.ts";
import type { RecoveryLimiter } from "./recovery-baseline.ts";

export type ProgressionDiscipline = "strength" | "swim" | "bike";

export type DisciplineProposal = {
  discipline: ProgressionDiscipline;
  /** Что именно прогрессирует: упражнение, дистанция заплыва, заезд. */
  subject: string;
  action: ProgressionAction;
  reasonCode: string;
  reason: string;
  usedSignals: string[];
  limitedData: boolean;
  /** Человекочитаемые текущее и предлагаемое значения в единицах дисциплины. */
  from: string;
  to: string;
};

const GROWTH: readonly ProgressionAction[] = ["increase"];
export const isGrowth = (action: ProgressionAction) => GROWTH.includes(action);

/** Приводит решение движка зала к общей форме, ничего в нём не меняя. */
export function fromStrengthProposal(proposal: ProgressionProposal): DisciplineProposal {
  const load = (value: { weight: number; reps: number }) =>
    value.weight > 0 ? `${value.weight} кг × ${value.reps}` : `${value.reps} повт. (вес тела)`;
  return {
    discipline: "strength",
    subject: proposal.exercise,
    action: proposal.action,
    reasonCode: proposal.reasonCode,
    reason: proposal.reason,
    usedSignals: proposal.usedSignals,
    limitedData: proposal.limitedData,
    from: load(proposal.from),
    to: load(proposal.to),
  };
}

/**
 * Единый ограничитель поверх всех дисциплин: плохое восстановление запрещает
 * рост, но НЕ снижает нагрузку — снижение остаётся за готовностью и за болью.
 *
 * Одно правило на три дисциплины, а не три копии. Предложения, которые и так
 * не растут (удержание, снижение, разгрузка), проходят нетронутыми: запрет
 * роста не должен превращаться в дополнительное урезание.
 */
export function applyRecoveryLimiter(proposal: DisciplineProposal, limiter: RecoveryLimiter | null): DisciplineProposal {
  if (!limiter || limiter.allowGrowth || !isGrowth(proposal.action)) return proposal;
  return {
    ...proposal,
    action: "maintain",
    reasonCode: "recovery-blocks-growth",
    reason: `${limiter.reason} Прежняя нагрузка сохраняется: ${proposal.from}.`,
    usedSignals: [...proposal.usedSignals, ...limiter.usedSignals],
    limitedData: proposal.limitedData || limiter.limitedData,
    to: proposal.from,
  };
}
