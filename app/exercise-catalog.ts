// Верхняя граница диапазона повторов по названию упражнения — из статичного каталога
// программы (personal-data.ts). Используется прогрессией (Sprint 6.12), чтобы понять,
// достигнут ли верх диапазона повторов, а не для отображения самого плана.
import { home, week } from "./personal-data.ts";
import { targetReps } from "./exercise-progress.ts";

const catalog = new Map<string, number>();
for (const [name, , target] of home) if (!catalog.has(name)) catalog.set(name, targetReps(target)[1]);
for (const day of week) for (const [name, , target] of day.x) if (!catalog.has(name)) catalog.set(name, targetReps(target)[1]);

export function targetMaxRepsFor(exercise: string): number | null {
  return catalog.get(exercise) ?? null;
}

export const exerciseNames=Object.freeze([...catalog.keys()].sort((a,b)=>a.localeCompare(b,"ru")));
