import type {
  TrainingDuration,
  TrainingProgramDefinition,
  TrainingSessionDefinition,
  TrainingSessionRole,
  TrainingWeekDefinition,
  TrainingWorkoutReference,
} from "@/lib/training-program/types";

export const VOLT_PROGRAM_ID = "volt-training";
export const LEGACY_PROGRAM_VERSION = 1;
export const PLAN_V2_PROGRAM_VERSION = 2;
export const PLAN_V2_EFFECTIVE_WEEK = 4;
export const PLAN_V3_PROGRAM_VERSION = 3;
export const PLAN_V3_EFFECTIVE_WEEK = 9;
export const PLAN_V3_LAST_DEFINED_WEEK = 16;
export const PLAN_V4_PROGRAM_VERSION = 4;
export const PLAN_V4_EFFECTIVE_WEEK = 17;
// Цикл Плана 4.0 — восемь недель, как и у прежних версий.
export const PLAN_V4_LAST_DEFINED_WEEK = 24;
export const ACTIVE_PROGRAM_VERSION = PLAN_V4_PROGRAM_VERSION;


const duration = (minMinutes: number, maxMinutes = minMinutes): TrainingDuration => ({ minMinutes, maxMinutes });
const catalog = (workoutId: string): TrainingWorkoutReference => ({ kind: "catalog", workoutId });
const swim = (weekIndex: number, role: "technique" | "aerobic" | "endurance"): TrainingWorkoutReference => ({
  kind: "swim",
  programId: "foundation",
  programVersion: 2,
  workoutId: weekIndex >= 4 && weekIndex <= 8
    ? `w${weekIndex}d${role === "technique" ? 1 : role === "aerobic" ? 3 : 5}`
    : null,
});
// Плавание Плана 4.0. Своей плавательной программы у него нет, поэтому
// переиспользуется Endurance: неделя 17 цикла соответствует её неделе 9.
// Без этого сдвига оба плавательных слота v4 получали workoutId=null и не
// разрешались вовсе.
const planV4Swim = (weekIndex: number, role: "technique" | "aerobic" | "endurance"): TrainingWorkoutReference =>
  enduranceSwim(weekIndex - (PLAN_V4_EFFECTIVE_WEEK - PLAN_V3_EFFECTIVE_WEEK), role);

const enduranceSwim = (weekIndex: number, role: "technique" | "aerobic" | "endurance"): TrainingWorkoutReference => ({
  kind: "swim",
  programId: "endurance",
  programVersion: 1,
  workoutId: weekIndex >= PLAN_V3_EFFECTIVE_WEEK && weekIndex <= PLAN_V3_LAST_DEFINED_WEEK
    ? `w${weekIndex}d${role === "technique" ? 1 : role === "aerobic" ? 3 : 5}`
    : null,
});

function session(params: {
  id: string;
  day: number;
  discipline: TrainingSessionDefinition["discipline"];
  role: TrainingSessionRole;
  required: boolean;
  title: string;
  duration: TrainingDuration | null;
  workoutRef: TrainingWorkoutReference;
}): TrainingSessionDefinition {
  return {
    id: params.id,
    day: params.day,
    discipline: params.discipline,
    role: params.role,
    required: params.required,
    title: params.title,
    estimatedDuration: params.duration,
    workoutRef: params.workoutRef,
  };
}

const legacyStrength = (day: number) => session({
  id: `legacy-strength-${day}`,
  day,
  discipline: "strength",
  role: "legacy-strength",
  required: true,
  title: "Гантели по кругу",
  duration: duration(30, 35),
  workoutRef: catalog("legacy-home-strength"),
});
const legacyCardio = (day: number, pool: boolean) => session({
  id: pool ? `legacy-pool-${day}` : `legacy-cardio-${day}`,
  day,
  discipline: pool ? "swim" : "cardio",
  role: "legacy-cardio",
  required: true,
  title: pool ? "Бассейн" : "Ходьба или велосипед",
  duration: pool ? duration(30) : duration(30, 60),
  workoutRef: catalog(pool ? "legacy-pool" : "legacy-walk-bike"),
});
const recovery = (day: number, id = `recovery-${day}`) => session({
  id,
  day,
  discipline: "recovery",
  role: "recovery",
  required: false,
  title: day === 4 ? "Прогулка и мобильность" : "Полный отдых",
  duration: day === 4 ? duration(20, 30) : null,
  workoutRef: catalog(day === 4 ? "legacy-recovery" : "recovery"),
});

function legacyWeek(index: number): TrainingWeekDefinition {
  const hasPool = index > 1;
  return {
    index,
    title: index === 1 ? "Домашняя адаптация" : index === 2 ? "Домашний ритм" : "Домашняя база",
    phase: "legacy-home-base",
    sessions: [
      legacyStrength(1),
      legacyCardio(2, hasPool),
      legacyStrength(3),
      hasPool ? legacyCardio(4, true) : recovery(4),
      legacyStrength(5),
      legacyCardio(6, false),
      recovery(7),
    ],
  };
}

function planV2Sessions(weekIndex: number): readonly TrainingSessionDefinition[] {
  const bikeDuration = weekIndex <= 4 ? duration(25, 30) : weekIndex === 5 ? duration(30) : duration(30, 35);
  return [
    session({ id: "strength-a", day: 1, discipline: "strength", role: "strength-a", required: true, title: "Strength A", duration: duration(45, 50), workoutRef: catalog("strength-a") }),
    session({ id: "swim-technique", day: 1, discipline: "swim", role: "technique", required: true, title: "Swim — Technique", duration: duration(35, 45), workoutRef: swim(weekIndex, "technique") }),
    session({ id: "bike-zone-2", day: 2, discipline: "bike", role: "zone-2", required: false, title: "Bike / Indoor Cycling", duration: bikeDuration, workoutRef: catalog("bike-zone-2") }),
    session({ id: "swim-aerobic", day: 3, discipline: "swim", role: "aerobic", required: true, title: "Swim — Main aerobic session", duration: duration(40, 55), workoutRef: swim(weekIndex, "aerobic") }),
    session({ id: "strength-b", day: 4, discipline: "strength", role: "strength-b", required: true, title: "Strength B", duration: duration(45, 50), workoutRef: catalog("strength-b") }),
    session({ id: "swim-endurance", day: 5, discipline: "swim", role: "endurance", required: true, title: "Swim — Endurance", duration: duration(45, 65), workoutRef: swim(weekIndex, "endurance") }),
    recovery(6, "rest-saturday"),
    recovery(7, "rest-sunday"),
  ];
}

const PLAN_V2_WEEK_META: Readonly<Record<number, { title: string; phase: string }>> = {
  4: { title: "Переход и разгрузка", phase: "transition-deload" },
  5: { title: "Рост объёма", phase: "volume" },
  6: { title: "Построение объёма", phase: "build" },
  7: { title: "Рост выносливости", phase: "endurance-build" },
  8: { title: "Разгрузка и контроль", phase: "deload-control" },
};

const planV2Week = (index: number): TrainingWeekDefinition => ({
  index,
  title: PLAN_V2_WEEK_META[index]?.title ?? "Устойчивый ритм",
  phase: PLAN_V2_WEEK_META[index]?.phase ?? "continuation",
  sessions: planV2Sessions(index),
});

const PLAN_V3_WEEK_META: Readonly<Record<number, { title: string; phase: string; bikeMinutes: number }>> = {
  9: { title: "Перестройка", phase: "v3-rebuild", bikeMinutes: 30 },
  10: { title: "Аэробная база", phase: "v3-aerobic-base", bikeMinutes: 35 },
  11: { title: "Рост объёма", phase: "v3-volume", bikeMinutes: 40 },
  12: { title: "Разгрузка", phase: "v3-deload", bikeMinutes: 30 },
  13: { title: "Выносливость", phase: "v3-endurance", bikeMinutes: 40 },
  14: { title: "Построение", phase: "v3-build", bikeMinutes: 45 },
  15: { title: "Устойчивый объём", phase: "v3-stable-volume", bikeMinutes: 50 },
  16: { title: "Разгрузка и контроль", phase: "v3-control", bikeMinutes: 35 },
};

function planV3Sessions(weekIndex: number): readonly TrainingSessionDefinition[] {
  const bikeMinutes = PLAN_V3_WEEK_META[weekIndex]?.bikeMinutes ?? 35;
  return [
    session({ id: "strength-v3-a", day: 1, discipline: "strength", role: "strength-a", required: true, title: "Силовая тренировка А — тренажёры", duration: duration(50, 60), workoutRef: catalog("strength-v3-a") }),
    session({ id: "swim-v3-technique", day: 1, discipline: "swim", role: "technique", required: true, title: "Плавание — техника", duration: duration(40, 50), workoutRef: enduranceSwim(weekIndex, "technique") }),
    session({ id: "bike-v3-zone-2", day: 2, discipline: "bike", role: "zone-2", required: false, title: "Велотренировка в зоне 2", duration: duration(bikeMinutes), workoutRef: catalog("bike-zone-2-v3") }),
    session({ id: "swim-v3-aerobic", day: 3, discipline: "swim", role: "aerobic", required: true, title: "Плавание — аэробная тренировка", duration: duration(45, 60), workoutRef: enduranceSwim(weekIndex, "aerobic") }),
    session({ id: "strength-v3-b", day: 4, discipline: "strength", role: "strength-b", required: true, title: "Силовая тренировка Б — тренажёры", duration: duration(50, 60), workoutRef: catalog("strength-v3-b") }),
    session({ id: "swim-v3-endurance", day: 5, discipline: "swim", role: "endurance", required: true, title: "Плавание — выносливость", duration: duration(50, 70), workoutRef: enduranceSwim(weekIndex, "endurance") }),
    recovery(6, "rest-v3-saturday"),
    recovery(7, "rest-v3-sunday"),
  ];
}

const planV3Week = (index: number): TrainingWeekDefinition => ({
  index,
  title: PLAN_V3_WEEK_META[index]?.title ?? "Устойчивый ритм",
  phase: PLAN_V3_WEEK_META[index]?.phase ?? "v3-continuation",
  sessions: planV3Sessions(index),
});

export const LEGACY_TRAINING_PROGRAM: TrainingProgramDefinition = {
  id: VOLT_PROGRAM_ID,
  version: LEGACY_PROGRAM_VERSION,
  name: "VOLT Original",
  description: "Исходная домашняя программа. Версия заморожена для Weeks 1–3 и истории.",
  effectiveFromWeek: 1,
  weeks: [legacyWeek(1), legacyWeek(2), legacyWeek(3)],
};

export const PLAN_V2_TRAINING_PROGRAM: TrainingProgramDefinition = {
  id: VOLT_PROGRAM_ID,
  version: PLAN_V2_PROGRAM_VERSION,
  name: "VOLT Plan v2",
  description: "Две силовые, три Swim и optional Bike в едином недельном календаре.",
  effectiveFromWeek: PLAN_V2_EFFECTIVE_WEEK,
  weeks: [4, 5, 6, 7, 8].map(planV2Week),
  continuationWeek: {
    title: "Устойчивый ритм",
    phase: "continuation",
    sessions: planV2Sessions(9),
  },
};

export const PLAN_V3_TRAINING_PROGRAM: TrainingProgramDefinition = {
  id: VOLT_PROGRAM_ID,
  version: PLAN_V3_PROGRAM_VERSION,
  name: "VOLT Plan v3",
  description: "Зал на тренажёрах и блоках, три плавания, спокойный велосипед и щадящая работа для тазобедренных суставов без домашних гантелей.",
  effectiveFromWeek: PLAN_V3_EFFECTIVE_WEEK,
  weeks: Array.from({ length: PLAN_V3_LAST_DEFINED_WEEK - PLAN_V3_EFFECTIVE_WEEK + 1 }, (_, index) => planV3Week(PLAN_V3_EFFECTIVE_WEEK + index)),
  continuationWeek: {
    title: "Устойчивый ритм",
    phase: "v3-continuation",
    sessions: planV3Sessions(PLAN_V3_LAST_DEFINED_WEEK + 1),
  },
};

// ---------- План 4.0 (docs/PLAN_V4.md) ----------
// Неделя стабильна: 2 плавания + 2 вело + 2 силовые. Пятничный Swim
// остаётся обязательным, пока владелец явно не выберет объявленную Bike-альтернативу;
// каноническая сессия не может тихо исчезнуть из-за самочувствия.
const PLAN_V4_WEEK_META: Record<number, { title: string; phase: string; longBikeMinutes: number }> = {
  17: { title: "Адаптация", phase: "v4-adaptation", longBikeMinutes: 30 },
  18: { title: "Адаптация", phase: "v4-adaptation", longBikeMinutes: 35 },
  19: { title: "Адаптация", phase: "v4-adaptation", longBikeMinutes: 40 },
  20: { title: "Развитие", phase: "v4-development", longBikeMinutes: 45 },
  21: { title: "Развитие", phase: "v4-development", longBikeMinutes: 45 },
  22: { title: "Развитие", phase: "v4-development", longBikeMinutes: 50 },
  23: { title: "Удержание", phase: "v4-peak", longBikeMinutes: 60 },
  24: { title: "Разгрузка и тест FTP", phase: "v4-control", longBikeMinutes: 40 },
};

function planV4Sessions(weekIndex: number): readonly TrainingSessionDefinition[] {
  const longBikeMinutes = PLAN_V4_WEEK_META[weekIndex]?.longBikeMinutes ?? 50;
  // Неделя разгрузки заканчивается тестом FTP: без него зоны остаются словом
  // без числа, а прогрессию вело не с чем сравнивать.
  const isTestWeek = PLAN_V4_WEEK_META[weekIndex]?.phase === "v4-control";
  const cycleWeek = weekIndex - PLAN_V4_EFFECTIVE_WEEK + 1;
  const fridayRole = cycleWeek % 2 === 1 ? "aerobic" : "endurance";
  return [
    session({ id: "swim-v4-technique", day: 1, discipline: "swim", role: "technique", required: true, title: "Плавание — техника", duration: duration(40, 50), workoutRef: planV4Swim(weekIndex, "technique") }),
    session({ id: "strength-v4-a", day: 2, discipline: "strength", role: "strength-a", required: true, title: "Силовая тренировка А — тренажёры", duration: duration(50, 60), workoutRef: catalog("strength-v3-a") }),
    session({ id: "bike-v4-quality", day: 3, discipline: "bike", role: "intervals", required: true, title: isTestWeek ? "Вело — тест FTP, 20 минут" : "Вело — качество", duration: isTestWeek ? duration(20) : duration(35, 45), workoutRef: catalog(isTestWeek ? "bike-v4-ftp-test" : "bike-v4-quality") }),
    session({ id: "strength-v4-b", day: 4, discipline: "strength", role: "strength-b", required: true, title: "Силовая тренировка Б — тренажёры", duration: duration(50, 60), workoutRef: catalog("strength-v3-b") }),
    // Гибкий слот: базовая обязательная сессия — Swim. Дисциплина меняется
    // только явным выбором альтернативы; слот нельзя тихо потерять как
    // необязательный. Роль чередуется по неделям цикла.
    {
      ...session({ id: "swim-v4-friday", day: 5, discipline: "swim", role: fridayRole, required: true, title: fridayRole === "aerobic" ? "Плавание — аэробная тренировка" : "Плавание — выносливость", duration: duration(45, 60), workoutRef: planV4Swim(weekIndex, fridayRole) }),
      alternatives: [{
        id: "bike-v4-extra", discipline: "bike", role: "zone-2",
        title: "Вело — третий заезд", estimatedDuration: duration(30, 45),
        workoutRef: catalog("bike-v4-extra"),
      }],
    },
    session({ id: "bike-v4-long", day: 6, discipline: "bike", role: "zone-2", required: true, title: "Вело — длинная база", duration: duration(longBikeMinutes), workoutRef: catalog("bike-v4-long") }),
    recovery(7, "rest-v4-sunday"),
  ];
}

const planV4Week = (index: number): TrainingWeekDefinition => ({
  index,
  title: PLAN_V4_WEEK_META[index]?.title ?? "Устойчивый ритм",
  phase: PLAN_V4_WEEK_META[index]?.phase ?? "v4-continuation",
  sessions: planV4Sessions(index),
});

export const PLAN_V4_TRAINING_PROGRAM: TrainingProgramDefinition = {
  id: VOLT_PROGRAM_ID,
  version: PLAN_V4_PROGRAM_VERSION,
  name: "VOLT Plan v4",
  description: "Стабильная неделя: два плавания, два заезда и две силовые. Суббота — обязательная длинная база, среда — интервалы сидя. Прогрессия в каждой дисциплине.",
  effectiveFromWeek: PLAN_V4_EFFECTIVE_WEEK,
  weeks: Array.from({ length: PLAN_V4_LAST_DEFINED_WEEK - PLAN_V4_EFFECTIVE_WEEK + 1 }, (_, index) => planV4Week(PLAN_V4_EFFECTIVE_WEEK + index)),
  continuationWeek: {
    title: "Устойчивый ритм",
    phase: "v4-continuation",
    sessions: planV4Sessions(PLAN_V4_LAST_DEFINED_WEEK + 1),
  },
};

export const TRAINING_PROGRAMS: readonly TrainingProgramDefinition[] = [
  LEGACY_TRAINING_PROGRAM,
  PLAN_V2_TRAINING_PROGRAM,
  PLAN_V3_TRAINING_PROGRAM,
  PLAN_V4_TRAINING_PROGRAM,
];
