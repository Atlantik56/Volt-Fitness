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

export const TRAINING_PROGRAMS: readonly TrainingProgramDefinition[] = [
  LEGACY_TRAINING_PROGRAM,
  PLAN_V2_TRAINING_PROGRAM,
];
