// Sprint 6.13 — спокойная персональная обратная связь сразу после тренировки.
// Намеренно отдельно от lib/coach.ts: это только фраза-реакция на уже введённые
// пользователем факты (нагрузка, боль) и уже посчитанную серию дней — никакого
// нового алгоритма принятия решений, ничего не меняет в CoachDecision.

import { normalizeCoachPlanKind } from "./coach.ts";

export type PostWorkoutFeedbackInput = {
  effort: string;
  painAfter: number;
  streak: number;
  planType: string;
  planTitle: string;
};

const KIND_CLOSING: Record<string, string> = {
  rest: "День отдыха закрыт — восстановление тоже часть плана.",
  recovery: "Восстановительная сессия завершена — тело скажет спасибо.",
  cardio: "Кардио записано — сердце и лёгкие получили свою тренировку.",
  strength: "Силовая тренировка записана — прогресс складывается из таких дней.",
};

export function buildPostWorkoutFeedback(input: PostWorkoutFeedbackInput): string {
  if (input.painAfter >= 5) {
    return `Боль после тренировки ${input.painAfter}/10 — если повторится, стоит показаться врачу. Сегодняшняя тренировка всё равно засчитана.`;
  }
  if (input.effort === "Тяжело") {
    return "Тяжело — это нормально. Сегодня техника и терпение были важнее темпа, дай себе время восстановиться.";
  }
  if (input.effort === "Легко") {
    return "Легко — значит, есть запас на следующий раз.";
  }
  if (input.streak >= 3) {
    return `${input.streak}-й день подряд с активностью — ритм держится.`;
  }
  const kind = normalizeCoachPlanKind(input.planType, input.planTitle);
  return KIND_CLOSING[kind] || KIND_CLOSING.strength;
}
