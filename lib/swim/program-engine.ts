import { swimWorkoutPlanKey } from "@/lib/swim/workout-plan-key";
import type { SwimDay, SwimInterval, SwimIntervalType, SwimProgramDef, SwimProgramProgress, SwimWeekDef, SwimWorkoutActual, SwimWorkoutDef, SwimWorkoutProgress, SwimWorkoutProgressStatus } from "@/lib/swim/types";

type SetInput = [type: SwimIntervalType, exerciseId: string, distance: number, repeats: number, rest: number | null, description: string, restMax?: number | null];

const set = (workoutId: string, index: number, input: SetInput): SwimInterval => ({
  id: `${workoutId}-${index + 1}`,
  type: input[0], exerciseId: input[1], distanceMeters: input[2], repeats: input[3],
  restSeconds: input[4], description: input[5], restSecondsMax: input[6],
  targetPaceSecondsPer100: null, equipment: input[1] === "kick" ? ["доска — по желанию"] : [],
});

const workout = (id: string, title: string, goal: string, estimatedMinutes: number, sets: SetInput[]): SwimWorkoutDef => ({
  id, title, goal, estimatedMinutes, level: "beginner", intervals: sets.map((item, index) => set(id, index, item)),
});
const day = (dayIndex: number, value: SwimWorkoutDef | null): SwimDay => ({ dayIndex, workout: value });
const week = (weekIndex: number, title: string, plannedDistanceMeters: number, workouts: SwimWorkoutDef[]): SwimWeekDef => ({
  weekIndex, title, plannedDistanceMeters,
  days: [day(1, workouts[0]), day(2, null), day(3, workouts[1]), day(4, null), day(5, null), day(6, null), day(7, null)],
});

// VOLT Swim Foundation v2. Источник: Swim-Training-plan.md пользователя.
// Объёмы, порядок блоков, число повторов и отдых перенесены без продуктовых догадок.
const FOUNDATION_WEEKS: SwimWeekDef[] = [
  week(1, "Адаптация", 2000, [
    workout("w1d1", "Длинный гребок", "Спокойно скользить по воде, не торопиться и считать гребки", 38, [
      ["warmup", "backstroke", 50, 1, 15, "Кроль на спине, 2 длины"],
      ["warmup", "freestyle", 50, 1, 15, "Кроль на груди, 2 длины"],
      ["warmup", "backstroke", 50, 1, 15, "Повтор круга: кроль на спине"],
      ["warmup", "freestyle", 50, 1, 15, "Повтор круга: кроль на груди"],
      ["main_set", "freestyle", 50, 8, 20, "Длинный гребок, спокойное дыхание, считать гребки", 30],
      ["drill", "kick", 50, 6, 20, "Двухударная работа ног от бедра, не ускоряться"],
      ["cooldown", "backstroke", 100, 1, null, "Максимально расслабленно"],
    ]),
    workout("w1d3", "Аэробная база", "Сохранить ровное дыхание в каждом отрезке", 38, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно: спина или кроль"],
      ["main_set", "freestyle", 100, 4, 30, "Ровное дыхание", 40],
      ["recovery", "backstroke", 50, 4, 20, "Кроль на спине"],
      ["cooldown", "freestyle", 100, 1, null, "Очень спокойно"],
      ["cooldown", "backstroke", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week(2, "Улучшение скольжения", 2200, [
    workout("w2d1", "Меньше гребков", "Сделать на 1–2 гребка меньше, сохраняя спокойный темп", 38, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойное плавание"],
      ["main_set", "freestyle", 50, 10, 20, "На 1–2 гребка меньше, чем на прошлой неделе"],
      ["drill", "kick", 50, 4, 20, "Двухударная работа ног"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w2d3", "Естественный ритм", "Найти естественный ритм двухударного кроля", 42, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойное плавание"],
      ["main_set", "freestyle", 200, 3, 45, "Естественный ритм двухударного кроля"],
      ["recovery", "backstroke", 50, 4, 20, "Кроль на спине"],
      ["cooldown", "easy-swim", 200, 1, null, "Спокойно"],
    ]),
  ]),
  week(3, "Экономичность", 2500, [
    workout("w3d1", "Контроль SWOLF", "Сохранять экономичность; замедлиться при ухудшении последних интервалов", 40, [
      ["warmup", "backstroke", 100, 1, null, "Спокойно"],
      ["warmup", "freestyle", 100, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 6, 30, "Следить за SWOLF и не ускоряться"],
      ["drill", "kick", 50, 4, 20, "Двухударная работа ног"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w3d3", "Длинные отрезки", "Удерживать спокойную технику на 300-метровых отрезках", 48, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 300, 2, 45, "Ровная техника и дыхание", 60],
      ["recovery", "backstroke", 100, 4, 30, "Кроль на спине"],
      ["cooldown", "easy-swim", 200, 1, null, "Спокойно"],
    ]),
  ]),
  week(4, "Разгрузочная", 2000, [
    workout("w4d1", "Скольжение", "Вернуть лёгкость движений и сохранить технику", 38, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "drill", 50, 8, 20, "25 м упражнение на скольжение + 25 м полный кроль"],
      ["drill", "kick", 50, 4, 20, "На спине, руки вдоль тела"],
      ["cooldown", "easy-swim", 200, 1, null, "Расслабленно"],
    ]),
    workout("w4d3", "500 м без остановок", "Проплыть 20 длин непрерывно и максимально расслабленно", 40, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 500, 1, null, "Без остановок, открытые развороты"],
      ["cooldown", "easy-swim", 300, 1, null, "Чередовать кроль и спину"],
    ]),
  ]),
  week(5, "Рост объёма", 2900, [
    workout("w5d1", "Стабильные сотни", "Удерживать одинаковое время на каждой сотне", 45, [
      ["warmup", "easy-swim", 300, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 8, 30, "Одинаковое время и техника"],
      ["drill", "kick", 50, 2, 20, "Двухударная работа ног"],
      ["cooldown", "easy-swim", 100, 1, null, "Расслабленно"],
    ]),
    workout("w5d3", "Два по 400", "Сохранить технику на двух длинных заплывах", 55, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 400, 2, 60, "16 длин, ровное дыхание"],
      ["recovery", "backstroke", 100, 4, 30, "Кроль на спине"],
      ["cooldown", "easy-swim", 200, 1, null, "Расслабленно"],
    ]),
  ]),
  week(6, "Контрольный цикл", 3200, [
    workout("w6d1", "10 стабильных сотен", "Не сбивать дыхание и удерживать одинаковую технику", 50, [
      ["warmup", "easy-swim", 300, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 10, 20, "Не сбивать дыхание", 30],
      ["cooldown", "easy-swim", 100, 1, null, "Расслабленно"],
    ]),
    workout("w6d3", "Контрольные 1000 м", "Проплыть 40 длин без остановок и без ускорений", 60, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 1000, 1, null, "Не ставить рекорд: последние 200 м почти как первые"],
      ["recovery", "backstroke", 100, 4, 30, "Кроль на спине"],
      ["cooldown", "easy-swim", 200, 1, null, "Лёгкое расслабленное плавание"],
    ]),
  ]),
];

const PROGRAMS: readonly SwimProgramDef[] = [
  { id: "foundation", name: "Foundation", description: "6 недель: техника, двухударный кроль и спокойный рост непрерывной дистанции до 1000 м.", level: "beginner", status: "available", version: 2, weeks: FOUNDATION_WEEKS },
  { id: "endurance", name: "Выносливость", description: "Следующий этап развития объёма.", level: "intermediate", status: "coming_soon", version: 1, weeks: [] },
];

export const listPrograms = (): readonly SwimProgramDef[] => PROGRAMS;
export const getProgram = (id: string): SwimProgramDef | null => PROGRAMS.find((program) => program.id === id) ?? null;
export function getWorkout(program: SwimProgramDef, weekIndex: number, workoutId: string) { const week = program.weeks.find((w) => w.weekIndex === weekIndex); const found = week?.days.find((d) => d.workout?.id === workoutId); return week && found ? { day: found, week } : null; }
export function findWorkoutById(program: SwimProgramDef, workoutId: string) { for (const w of program.weeks) for (const d of w.days) if (d.workout?.id === workoutId) return { workout: d.workout, weekIndex: w.weekIndex, dayIndex: d.dayIndex }; return null; }
function ordered(program: SwimProgramDef) { return program.weeks.flatMap((week) => week.days.flatMap((day) => day.workout ? [{ workout: day.workout, weekIndex: week.weekIndex, dayIndex: day.dayIndex }] : [])); }
export function computeProgramProgress(program: SwimProgramDef, completedPlanKeys: ReadonlySet<string>, openDraftsByPlanKey: ReadonlyMap<string, { id: number; status: "active" | "awaiting_confirmation"; date: string }>, actualsByPlanKey: ReadonlyMap<string, SwimWorkoutActual> = new Map()): SwimProgramProgress {
  const workouts: SwimWorkoutProgress[] = ordered(program).map(({ workout, weekIndex, dayIndex }) => { const key = swimWorkoutPlanKey(program, workout) ?? ""; const open = openDraftsByPlanKey.get(key); const status: SwimWorkoutProgressStatus = completedPlanKeys.has(key) ? "completed" : open?.status === "awaiting_confirmation" ? "awaiting_confirmation" : open?.status === "active" ? "in_progress" : "not_started"; return { workout, weekIndex, dayIndex, status, planKey: key, draftId: open?.id ?? null, draftDate: open?.date ?? null, actual: actualsByPlanKey.get(key) ?? null, calendar: null }; });
  const completedCount = workouts.filter((w) => w.status === "completed").length;
  const nextWorkout = workouts.find((w) => w.status === "in_progress" || w.status === "awaiting_confirmation") ?? workouts.find((w) => w.status === "not_started") ?? null;
  return { program, completedCount, totalCount: workouts.length, currentWeekIndex: nextWorkout?.weekIndex ?? (workouts.at(-1)?.weekIndex ?? null), nextWorkout, workouts, calendarDays: [] };
}
