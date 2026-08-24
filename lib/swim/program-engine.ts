import { swimWorkoutPlanKey, swimWorkoutPlanKeyCandidates } from "@/lib/swim/workout-plan-key";
import { resolveTrainingWeek } from "@/lib/training-program/registry";
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
const week = (programId: string, programVersion: number, weekIndex: number, title: string, plannedDistanceMeters: number, workouts: SwimWorkoutDef[]): SwimWeekDef => ({
  weekIndex, title, plannedDistanceMeters,
  // Weeks 1–3 retain their historical Foundation layout. From effective
  // Week 4 onward day placement is read from the canonical VOLT program
  // references, so Swim cannot silently drift to another weekday.
  days: Array.from({ length: 7 }, (_, offset) => {
    const dayIndex = offset + 1;
    if (programId === "foundation" && weekIndex < 4) return day(dayIndex, dayIndex === 1 ? workouts[0] : dayIndex === 3 ? workouts[1] : null);
    const trainingWeek = resolveTrainingWeek(weekIndex).week;
    const workoutForDay = workouts.find((workout) => trainingWeek.sessions.some((session) =>
      session.day === dayIndex && session.workoutRef.kind === "swim" && session.workoutRef.programId === programId
      && session.workoutRef.programVersion === programVersion && session.workoutRef.workoutId === workout.id,
    )) ?? null;
    return day(dayIndex, workoutForDay);
  }),
});

// VOLT Swim Foundation v2. Источник: Swim-Training-plan.md пользователя.
// Объёмы, порядок блоков, число повторов и отдых перенесены без продуктовых догадок.
const FOUNDATION_WEEKS: SwimWeekDef[] = [
  week("foundation", 2, 1, "Адаптация", 2000, [
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
  week("foundation", 2, 2, "Улучшение скольжения", 2200, [
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
  week("foundation", 2, 3, "Экономичность", 2500, [
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
  week("foundation", 2, 4, "Переход и разгрузка", 2400, [
    workout("w4d1", "Скольжение", "Вернуть лёгкость движений и сохранить технику", 38, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "catch-up", 50, 4, 20, "Длинный гребок, ноги работают минимально"],
      ["main_set", "freestyle", 50, 4, 20, "Лёгкий кроль, техника важнее скорости"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно на спине"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
    workout("w4d3", "Аэробный переход", "Удерживать ровное дыхание на спокойных сотнях", 40, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 4, 30, "Ровный разговорный темп, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно на спине"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
    workout("w4d5", "500 м без остановок", "Проплыть основной блок непрерывно и максимально расслабленно", 42, [
      ["warmup", "easy-swim", 100, 1, null, "Спокойно"],
      ["main_set", "freestyle", 500, 1, null, "Без остановок, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно на спине"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("foundation", 2, 5, "Рост объёма", 2950, [
    workout("w5d1", "Техника на объёме", "Сохранить длинный спокойный гребок", 42, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "fingertip-drag", 50, 6, 20, "Мягкий пронос, ноги работают минимально"],
      ["main_set", "freestyle", 100, 3, 30, "Ровная техника"],
      ["cooldown", "easy-swim", 100, 1, null, "Расслабленно"],
    ]),
    workout("w5d3", "Стабильные сотни", "Удерживать одинаковый спокойный ритм на каждой сотне", 48, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 6, 30, "Одинаковая техника без ускорений"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно на спине"],
      ["cooldown", "easy-swim", 100, 1, null, "Расслабленно"],
    ]),
    workout("w5d5", "Два по 400", "Сохранить технику на двух длинных заплывах", 55, [
      ["warmup", "easy-swim", 150, 1, null, "Спокойно"],
      ["main_set", "freestyle", 400, 2, 60, "16 длин, ровное дыхание"],
      ["cooldown", "easy-swim", 100, 1, null, "Расслабленно"],
    ]),
  ]),
  week("foundation", 2, 6, "Построение объёма", 3150, [
    workout("w6d1", "Техника и ритм", "Сохранить экономичный гребок при плавном росте объёма", 44, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "catch-up", 50, 6, 20, "Длинный гребок без агрессивной работы ног"],
      ["main_set", "freestyle", 100, 4, 30, "Ровная техника"],
      ["cooldown", "backstroke", 50, 1, null, "Расслабленно"],
    ]),
    workout("w6d3", "Семь стабильных сотен", "Удерживать одинаковое дыхание и технику", 50, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 7, 30, "Стабильно, без ускорений"],
      ["recovery", "backstroke", 50, 1, null, "Расслабленно на спине"],
      ["cooldown", "easy-swim", 100, 1, null, "Лёгкое плавание"],
    ]),
    workout("w6d5", "Длинные четвёрки", "Удерживать спокойную технику на длинных интервалах", 58, [
      ["warmup", "easy-swim", 150, 1, null, "Спокойно"],
      ["main_set", "freestyle", 400, 2, 60, "Ровное дыхание, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно на спине"],
      ["cooldown", "easy-swim", 100, 1, null, "Лёгкое плавание"],
    ]),
  ]),
  week("foundation", 2, 7, "Рост выносливости", 3300, [
    workout("w7d1", "Техника под нагрузкой", "Сохранить спокойный длинный гребок", 46, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "fingertip-drag", 50, 6, 20, "Мягкий пронос без спешки"],
      ["main_set", "freestyle", 100, 4, 30, "Ровная техника"],
      ["cooldown", "easy-swim", 100, 1, null, "Расслабленно"],
    ]),
    workout("w7d3", "Восемь аэробных сотен", "Сохранить ровный разговорный темп", 54, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 8, 30, "Одинаковое усилие, техника важнее скорости"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w7d5", "Длинная аэробная работа", "Уверенно удерживать технику на длинных отрезках", 62, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 400, 2, 60, "Ровное дыхание, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно на спине"],
      ["cooldown", "easy-swim", 100, 1, null, "Лёгкое плавание"],
    ]),
  ]),
  week("foundation", 2, 8, "Разгрузка и контроль", 2950, [
    workout("w8d1", "Лёгкая техника", "Вернуть лёгкость и чистоту гребка", 40, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "catch-up", 50, 5, 20, "Длинный гребок, минимальная работа ног"],
      ["main_set", "freestyle", 100, 3, 30, "Ровная техника"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w8d3", "Спокойные сотни", "Сохранить аэробный ритм без накопления усталости", 44, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 6, 30, "Комфортно, без ускорений"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w8d5", "Контрольные 1000 м", "Проплыть непрерывно с ровной техникой — это не гонка и не тест максимальной скорости", 60, [
      ["warmup", "easy-swim", 100, 1, null, "Очень спокойно"],
      ["main_set", "freestyle", 1000, 1, null, "Контролируемое усилие: последние 200 м почти как первые, открытые развороты"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
  ]),
];

// VOLT Swim Endurance v1 продолжает Foundation после контрольной Week 8.
// Только кроль/спина, открытые развороты и спокойная работа ног; объём растёт
// ступенчато с разгрузочными Weeks 12 и 16.
const ENDURANCE_WEEKS: SwimWeekDef[] = [
  week("endurance", 1, 9, "Перестройка", 3000, [
    workout("w9d1", "Техника после Foundation", "Закрепить длинный спокойный гребок без лишней работы ног", 45, [
      ["warmup", "easy-swim", 200, 1, null, "Кроль и спина очень спокойно"],
      ["technique", "catch-up", 50, 4, 20, "Длинный гребок, открытые развороты"],
      ["main_set", "freestyle", 100, 4, 30, "Ровная техника без ускорений"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w9d3", "Шесть ровных сотен", "Вернуться к устойчивому аэробному ритму", 50, [
      ["warmup", "easy-swim", 200, 1, null, "Очень спокойно"],
      ["main_set", "freestyle", 100, 6, 30, "Одинаковое усилие на каждом отрезке"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Лёгкое плавание"],
    ]),
    workout("w9d5", "Два по 350", "Сохранить технику на длинных отрезках", 58, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 350, 2, 60, "Ровное дыхание, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("endurance", 1, 10, "Аэробная база", 3200, [
    workout("w10d1", "Техника и положение корпуса", "Сохранять ровное положение тела и мягкий пронос", 46, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "fingertip-drag", 50, 5, 20, "Мягкий пронос без спешки"],
      ["main_set", "freestyle", 100, 4, 30, "Техника важнее скорости"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w10d3", "Семь аэробных сотен", "Удерживать разговорное усилие", 52, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 7, 30, "Стабильный ритм"],
      ["recovery", "backstroke", 50, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Легко"],
    ]),
    workout("w10d5", "Два по 400", "Сохранить одинаковую технику на двух длинных блоках", 60, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 400, 2, 60, "Открытые развороты, без ускорения"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("endurance", 1, 11, "Рост объёма", 3400, [
    workout("w11d1", "Техника на тысячу", "Сохранить чистый гребок при росте объёма", 48, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "catch-up", 50, 6, 20, "Длинный гребок, минимальная работа ног"],
      ["main_set", "freestyle", 100, 4, 30, "Ровная техника"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w11d3", "Восемь ровных сотен", "Не менять усилие от первой сотни к последней", 56, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 8, 30, "Одинаковое дыхание и техника"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w11d5", "Два по 450", "Спокойно удерживать длинный аэробный отрезок", 64, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 450, 2, 60, "Без ускорений, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("endurance", 1, 12, "Разгрузка", 2900, [
    workout("w12d1", "Лёгкая техника", "Снизить утомление и вернуть лёгкость гребка", 42, [
      ["warmup", "easy-swim", 200, 1, null, "Очень спокойно"],
      ["technique", "fingertip-drag", 50, 4, 20, "Мягкий пронос"],
      ["main_set", "freestyle", 100, 3, 30, "Комфортно"],
      ["cooldown", "backstroke", 150, 1, null, "Расслабленно"],
    ]),
    workout("w12d3", "Спокойные сотни", "Сохранить ритм без накопления усталости", 46, [
      ["warmup", "easy-swim", 200, 1, null, "Очень спокойно"],
      ["main_set", "freestyle", 100, 6, 35, "Без ускорений"],
      ["cooldown", "backstroke", 150, 1, null, "Расслабленно"],
    ]),
    workout("w12d5", "Ровные 700", "Проплыть непрерывный блок спокойно, не проверяя максимум", 55, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 700, 1, null, "Контролируемое усилие, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("endurance", 1, 13, "Выносливость", 3500, [
    workout("w13d1", "Техника и пятёрки", "Удерживать экономичный гребок", 48, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "catch-up", 50, 4, 20, "Длинный гребок"],
      ["main_set", "freestyle", 100, 5, 30, "Ровная техника"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w13d3", "Восемь аэробных сотен", "Удерживать спокойное разговорное усилие", 58, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 8, 30, "Одинаковый ритм"],
      ["recovery", "backstroke", 50, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Легко"],
    ]),
    workout("w13d5", "Спокойные 1000", "Закрепить непрерывные 1000 м без гонки", 65, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 1000, 1, null, "Контролируемое усилие, открытые развороты"],
      ["recovery", "backstroke", 50, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("endurance", 1, 14, "Построение", 3700, [
    workout("w14d1", "Техника под объёмом", "Сохранить длинный гребок и спокойное дыхание", 50, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "fingertip-drag", 50, 5, 20, "Мягкий пронос"],
      ["main_set", "freestyle", 100, 5, 30, "Техника важнее скорости"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w14d3", "Девять стабильных сотен", "Сохранить одинаковое усилие", 60, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 9, 30, "Без ускорения последних отрезков"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w14d5", "Три по 350", "Работать длинными блоками с полным восстановлением", 68, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 350, 3, 60, "Ровно, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("endurance", 1, 15, "Устойчивый объём", 3900, [
    workout("w15d1", "Техника и ритм", "Сохранить экономичность при максимальном объёме цикла", 52, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["technique", "catch-up", 50, 6, 20, "Длинный гребок"],
      ["main_set", "freestyle", 100, 5, 30, "Ровная техника"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w15d3", "Десять аэробных сотен", "Не выходить из спокойного аэробного усилия", 64, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 100, 10, 30, "Одинаковая техника"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w15d5", "Два по 550", "Удерживать технику на длинных отрезках", 72, [
      ["warmup", "easy-swim", 200, 1, null, "Спокойно"],
      ["main_set", "freestyle", 550, 2, 75, "Без ускорений, открытые развороты"],
      ["recovery", "backstroke", 100, 1, null, "Расслабленно"],
      ["cooldown", "easy-swim", 100, 1, null, "Очень спокойно"],
    ]),
  ]),
  week("endurance", 1, 16, "Разгрузка и контроль", 3200, [
    workout("w16d1", "Чистая техника", "Вернуть лёгкость после объёмной недели", 44, [
      ["warmup", "easy-swim", 200, 1, null, "Очень спокойно"],
      ["technique", "fingertip-drag", 50, 4, 20, "Мягкий пронос"],
      ["main_set", "freestyle", 100, 4, 30, "Комфортно"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w16d3", "Семь спокойных сотен", "Сохранить аэробный ритм без утомления", 50, [
      ["warmup", "easy-swim", 200, 1, null, "Очень спокойно"],
      ["main_set", "freestyle", 100, 7, 35, "Ровно, без ускорений"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
    workout("w16d5", "Контролируемые 1100", "Проплыть непрерывно ровно; это не гонка и не тест максимальной скорости", 70, [
      ["warmup", "easy-swim", 100, 1, null, "Очень спокойно"],
      ["main_set", "freestyle", 1100, 1, null, "Последние 200 м не быстрее первых, открытые развороты"],
      ["cooldown", "backstroke", 100, 1, null, "Расслабленно"],
    ]),
  ]),
];

const PROGRAMS: readonly SwimProgramDef[] = [
  { id: "foundation", name: "Foundation", description: "8 недель: техника, спокойная аэробная работа и плавный рост непрерывной дистанции до 1000 м.", level: "beginner", status: "available", version: 2, weeks: FOUNDATION_WEEKS },
  { id: "endurance", name: "Выносливость", description: "Недели 9–16: три спокойные тренировки в неделю, рост аэробного объёма и контролируемые 1100 м.", level: "intermediate", status: "available", version: 1, weeks: ENDURANCE_WEEKS },
];

export const listPrograms = (): readonly SwimProgramDef[] => PROGRAMS;
export const getProgram = (id: string): SwimProgramDef | null => PROGRAMS.find((program) => program.id === id) ?? null;
export function getWorkout(program: SwimProgramDef, weekIndex: number, workoutId: string) { const week = program.weeks.find((w) => w.weekIndex === weekIndex); const found = week?.days.find((d) => d.workout?.id === workoutId); return week && found ? { day: found, week } : null; }
export function findWorkoutById(program: SwimProgramDef, workoutId: string) { for (const w of program.weeks) for (const d of w.days) if (d.workout?.id === workoutId) return { workout: d.workout, weekIndex: w.weekIndex, dayIndex: d.dayIndex }; return null; }
function ordered(program: SwimProgramDef) { return program.weeks.flatMap((week) => week.days.flatMap((day) => day.workout ? [{ workout: day.workout, weekIndex: week.weekIndex, dayIndex: day.dayIndex }] : [])); }
export function computeProgramProgress(program: SwimProgramDef, completedPlanKeys: ReadonlySet<string>, openDraftsByPlanKey: ReadonlyMap<string, { id: number; status: "active" | "awaiting_confirmation"; date: string }>, actualsByPlanKey: ReadonlyMap<string, SwimWorkoutActual> = new Map()): SwimProgramProgress {
  const workouts: SwimWorkoutProgress[] = ordered(program).map(({ workout, weekIndex, dayIndex }) => {
    const candidates = swimWorkoutPlanKeyCandidates(program, workout);
    const key = candidates.find((candidate) => completedPlanKeys.has(candidate) || openDraftsByPlanKey.has(candidate) || actualsByPlanKey.has(candidate)) ?? swimWorkoutPlanKey(program, workout) ?? "";
    const open = openDraftsByPlanKey.get(key);
    const status: SwimWorkoutProgressStatus = completedPlanKeys.has(key) ? "completed" : open?.status === "awaiting_confirmation" ? "awaiting_confirmation" : open?.status === "active" ? "in_progress" : "not_started";
    return { workout, weekIndex, dayIndex, status, planKey: key, draftId: open?.id ?? null, draftDate: open?.date ?? null, actual: actualsByPlanKey.get(key) ?? null, calendar: null };
  });
  const completedCount = workouts.filter((w) => w.status === "completed").length;
  const nextWorkout = workouts.find((w) => w.status === "in_progress" || w.status === "awaiting_confirmation") ?? workouts.find((w) => w.status === "not_started") ?? null;
  return { program, startedAt: null, completedCount, totalCount: workouts.length, currentWeekIndex: nextWorkout?.weekIndex ?? (workouts.at(-1)?.weekIndex ?? null), nextWorkout, workouts, calendarDays: [] };
}
