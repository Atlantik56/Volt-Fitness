// Верхняя граница диапазона повторов по названию упражнения — из статичного каталога
// программы (personal-data.ts). Используется прогрессией (Sprint 6.12), чтобы понять,
// достигнут ли верх диапазона повторов, а не для отображения самого плана.
import { home, week } from "./personal-data.ts";
import { targetReps } from "./exercise-progress.ts";

const catalog = new Map<string, number>();
for (const [name, , target] of home) if (!catalog.has(name)) catalog.set(name, targetReps(target)[1]);
for (const day of week) for (const [name, , target] of day.x) if (!catalog.has(name)) catalog.set(name, targetReps(target)[1]);

// home содержит только наследие первых недель (включая гантели) и нужен для
// старых snapshot/медиа. Новые назначения и AI берут названия только из week.
const activeCatalog = new Set<string>();
for (const day of week) for (const [name] of day.x) activeCatalog.add(name);

export function targetMaxRepsFor(exercise: string): number | null {
  return catalog.get(exercise) ?? null;
}

export const exerciseNames=Object.freeze([...activeCatalog].sort((a,b)=>a.localeCompare(b,"ru")));

// Техника (описание) и изображение по названию упражнения — из того же
// статичного каталога программы, что и targetMaxRepsFor выше. Не создаёт
// новых упражнений и не хранится в snapshot тренировки: карточка активной
// тренировки (app/active-workout.tsx) подтягивает медиа по имени в момент
// отображения, поэтому работает одинаково и для старых snapshot (только
// name/target), и для новых — единый адаптер, а не миграция данных.
export type ExerciseMedia = { description: string; image: string };
const mediaCatalog = new Map<string, ExerciseMedia>();
for (const [name, description, , image] of home) if (!mediaCatalog.has(name)) mediaCatalog.set(name, { description, image: image || "" });
for (const day of week) for (const [name, description, , image] of day.x) if (!mediaCatalog.has(name)) mediaCatalog.set(name, { description, image: image || "" });

export function exerciseMediaFor(exercise: string): ExerciseMedia | null {
  return mediaCatalog.get(exercise) ?? null;
}
