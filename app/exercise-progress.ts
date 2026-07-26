export type ProgressDecision = {
  kind: "weight" | "reps" | "keep" | "deload" | "start";
  title: string;
  text: string;
};

type StrengthLog = {
  exercise: string;
  weight?: number;
  reps?: number;
  difficulty?: string;
};

// Формат цели: необязательное "N ×" (число подходов) перед диапазоном повторов,
// например "3 × 10–12" или "2 × 12 / нога". Подходы — не часть диапазона повторов,
// поэтому берём числа только после "×", если он есть.
export function targetReps(raw: string): [number, number] {
  const afterSets = raw.split("×")[1] ?? raw;
  const numbers = afterSets.match(/\d+/g)?.map(Number) || [];
  if (!numbers.length) return [1, 99];
  return numbers.length > 1 ? [numbers[0], numbers[1]] : [numbers[0], numbers[0]];
}

export function weightStep(name: string, weight: number) {
  if (weight <= 0) return 1;
  return /гантел/i.test(name) ? 1 : 2.5;
}

export function progressionDecision(
  name: string,
  target: string,
  logs: StrengthLog[],
  current?: { weight: number; reps: number; difficulty: string },
): ProgressDecision {
  const history = logs.filter((x) => x.exercise === name);
  const last = current || (history[0] ? {
    weight: Number(history[0].weight || 0),
    reps: Number(history[0].reps || 0),
    difficulty: history[0].difficulty || "Нормально",
  } : null);
  if (!last) return {kind:"start",title:"Подбери стартовую нагрузку",text:"Возьми вес, с которым остаются 2–3 чистых повтора в запасе."};

  const [, max] = targetReps(target);
  const hardTwice = !current && history.slice(0, 2).length === 2 && history.slice(0, 2).every((x) => x.difficulty === "Тяжело" || x.difficulty === "Боль");
  if (last.difficulty === "Боль" || hardTwice) {
    const lighter = last.weight > 0 ? Math.max(0, Math.round(last.weight * .875 * 2) / 2) : 0;
    return {kind:"deload",title:"Облегчённая неделя",text:last.weight > 0 ? `Снизь вес примерно до ${lighter} кг и оставь 3–4 повтора в запасе.` : "Сократи объём на один круг и работай только в безболезненной амплитуде."};
  }
  if (last.difficulty === "Легко" && last.reps >= max) {
    const next = Math.round((last.weight + weightStep(name,last.weight)) * 10) / 10;
    return {kind:"weight",title:"Увеличить вес",text:`Следующий ориентир — ${next} кг. Вернись к нижней границе повторов.`};
  }
  if ((last.difficulty === "Легко" || last.difficulty === "Нормально") && last.reps < max) {
    return {kind:"reps",title:"Добавить 1–2 повтора",text:`Сохрани ${last.weight || "текущий"}${last.weight ? " кг" : " вес"} и постепенно дойди до ${max} повторов.`};
  }
  return {kind:"keep",title:"Оставить нагрузку",text:"Повтори тот же вес и количество повторов, сохраняя чистую технику."};
}
