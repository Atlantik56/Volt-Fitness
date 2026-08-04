// Движок программ VOLT Swim: Program -> Week -> Workout -> Interval -> Step.
// Программы — авторские данные (как app/personal-data.ts homeWeek), а не
// пользовательские факты; прогресс по ним всегда вычисляется из реальных
// workout_drafts/workout_logs (lib/swim/services.ts), а не хранится отдельно.
import { swimWorkoutPlanKey } from "@/lib/swim/workout-plan-key";
import type {
  SwimDay,
  SwimProgramDef,
  SwimProgramProgress,
  SwimWeekDef,
  SwimWorkoutDef,
  SwimWorkoutProgress,
  SwimWorkoutProgressStatus,
} from "@/lib/swim/types";

const FOUNDATION_WEEK_1: SwimWeekDef = {
  weekIndex: 1,
  days: [
    {
      dayIndex: 1,
      workout: {
        id: "w1d1",
        title: "Техника и объём",
        goal: "Освоить ровный вольный стиль на коротких отрезках",
        level: "beginner",
        estimatedMinutes: 35,
        intervals: [
          { id: "w1d1-1", type: "warmup", exerciseId: "easy-swim", distanceMeters: 200, repeats: 1, description: "Свободно, без ускорений", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w1d1-2", type: "drill", exerciseId: "catch-up", distanceMeters: 50, repeats: 4, description: "Пауза руки впереди, длинный гребок", restSeconds: 20, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w1d1-3", type: "main_set", exerciseId: "freestyle", distanceMeters: 100, repeats: 4, description: "Ровный темп, свободное дыхание", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w1d1-4", type: "cooldown", exerciseId: "easy-swim", distanceMeters: 100, repeats: 1, description: "Спокойно, восстановить дыхание", restSeconds: null, targetPaceSecondsPer100: null, equipment: [] },
        ],
      },
    },
    { dayIndex: 2, workout: null },
    {
      dayIndex: 3,
      workout: {
        id: "w1d3",
        title: "Работа ног и баланс",
        goal: "Укрепить работу ног, отработать баланс тела",
        level: "beginner",
        estimatedMinutes: 30,
        intervals: [
          { id: "w1d3-1", type: "warmup", exerciseId: "easy-swim", distanceMeters: 150, repeats: 1, description: "Свободно", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w1d3-2", type: "drill", exerciseId: "kick", distanceMeters: 50, repeats: 4, description: "С доской, равномерный удар", restSeconds: 20, targetPaceSecondsPer100: null, equipment: ["доска"] },
          { id: "w1d3-3", type: "drill", exerciseId: "6-1-6", distanceMeters: 50, repeats: 4, description: "6 ударов на боку — гребок — 6 ударов", restSeconds: 20, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w1d3-4", type: "cooldown", exerciseId: "easy-swim", distanceMeters: 100, repeats: 1, description: "Спокойно", restSeconds: null, targetPaceSecondsPer100: null, equipment: [] },
        ],
      },
    },
    { dayIndex: 4, workout: null },
    { dayIndex: 5, workout: null },
    { dayIndex: 6, workout: null },
    { dayIndex: 7, workout: null },
  ],
};

const FOUNDATION_WEEK_2: SwimWeekDef = {
  weekIndex: 2,
  days: [
    {
      dayIndex: 1,
      workout: {
        id: "w2d1",
        title: "Длинный гребок",
        goal: "Удлинить гребок, снизить количество гребков на бассейн",
        level: "beginner",
        estimatedMinutes: 35,
        intervals: [
          { id: "w2d1-1", type: "warmup", exerciseId: "easy-swim", distanceMeters: 200, repeats: 1, description: "Свободно", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d1-2", type: "drill", exerciseId: "fingertip-drag", distanceMeters: 50, repeats: 4, description: "Пальцы скользят по поверхности при проносе руки", restSeconds: 20, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d1-3", type: "drill", exerciseId: "single-arm", distanceMeters: 50, repeats: 4, description: "По очереди каждой рукой", restSeconds: 20, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d1-4", type: "main_set", exerciseId: "freestyle", distanceMeters: 100, repeats: 4, description: "Считать гребки, стараться уменьшить их число", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d1-5", type: "cooldown", exerciseId: "easy-swim", distanceMeters: 100, repeats: 1, description: "Спокойно", restSeconds: null, targetPaceSecondsPer100: null, equipment: [] },
        ],
      },
    },
    { dayIndex: 2, workout: null },
    {
      dayIndex: 3,
      workout: {
        id: "w2d3",
        title: "Смешанный объём",
        goal: "Собрать технику и выносливость в одной тренировке",
        level: "beginner",
        estimatedMinutes: 40,
        intervals: [
          { id: "w2d3-1", type: "warmup", exerciseId: "easy-swim", distanceMeters: 200, repeats: 1, description: "Свободно", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d3-2", type: "drill", exerciseId: "sculling", distanceMeters: 25, repeats: 4, description: "Мелкие движения кистями у поверхности", restSeconds: 20, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d3-3", type: "main_set", exerciseId: "freestyle", distanceMeters: 100, repeats: 6, description: "Ровный темп", restSeconds: 25, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d3-4", type: "recovery", exerciseId: "backstroke", distanceMeters: 100, repeats: 1, description: "На спине, спокойно", restSeconds: 30, targetPaceSecondsPer100: null, equipment: [] },
          { id: "w2d3-5", type: "cooldown", exerciseId: "easy-swim", distanceMeters: 100, repeats: 1, description: "Спокойно", restSeconds: null, targetPaceSecondsPer100: null, equipment: [] },
        ],
      },
    },
    { dayIndex: 4, workout: null },
    { dayIndex: 5, workout: null },
    { dayIndex: 6, workout: null },
    { dayIndex: 7, workout: null },
  ],
};

const PROGRAMS: readonly SwimProgramDef[] = [
  {
    id: "foundation",
    name: "Основы техники",
    description: "Первая программа VOLT Swim: техника вольного стиля, работа ног и базовая выносливость.",
    level: "beginner",
    status: "available",
    version: 1,
    weeks: [FOUNDATION_WEEK_1, FOUNDATION_WEEK_2],
  },
  { id: "endurance", name: "Выносливость", description: "Программа для увеличения непрерывного объёма плавания.", level: "intermediate", status: "coming_soon", version: 1, weeks: [] },
  { id: "intervals", name: "Интервалы", description: "Интервальные серии с контролем темпа и отдыха.", level: "intermediate", status: "coming_soon", version: 1, weeks: [] },
  { id: "speed", name: "Скорость", description: "Спринтерская работа и техника стартов/поворотов.", level: "advanced", status: "coming_soon", version: 1, weeks: [] },
];

export function listPrograms(): readonly SwimProgramDef[] {
  return PROGRAMS;
}

export function getProgram(id: string): SwimProgramDef | null {
  return PROGRAMS.find((program) => program.id === id) ?? null;
}

export function getWorkout(program: SwimProgramDef, weekIndex: number, workoutId: string): { day: SwimDay; week: SwimWeekDef } | null {
  const week = program.weeks.find((w) => w.weekIndex === weekIndex);
  if (!week) return null;
  const day = week.days.find((d) => d.workout?.id === workoutId);
  return day ? { day, week } : null;
}

export function findWorkoutById(program: SwimProgramDef, workoutId: string): { workout: SwimWorkoutDef; weekIndex: number; dayIndex: number } | null {
  for (const week of program.weeks) {
    for (const day of week.days) {
      if (day.workout?.id === workoutId) return { workout: day.workout, weekIndex: week.weekIndex, dayIndex: day.dayIndex };
    }
  }
  return null;
}

function allWorkoutsInOrder(program: SwimProgramDef): { workout: SwimWorkoutDef; weekIndex: number; dayIndex: number }[] {
  const result: { workout: SwimWorkoutDef; weekIndex: number; dayIndex: number }[] = [];
  for (const week of program.weeks) {
    for (const day of week.days) {
      if (day.workout) result.push({ workout: day.workout, weekIndex: week.weekIndex, dayIndex: day.dayIndex });
    }
  }
  return result;
}

// completedPlanKeys — все plan_key завершённых черновиков (любой активности,
// не только swim); openDraftsByPlanKey — активные/ожидающие подтверждения
// черновики, тоже по всем активностям. Пересечение с ключами программы
// вычисляется здесь, а не в lib/swim/services.ts — та часть остаётся чистой
// доменной логикой без обращения к БД.
export function computeProgramProgress(
  program: SwimProgramDef,
  completedPlanKeys: ReadonlySet<string>,
  openDraftsByPlanKey: ReadonlyMap<string, { id: number; status: "active" | "awaiting_confirmation" }>,
): SwimProgramProgress {
  const ordered = allWorkoutsInOrder(program);
  const workouts: SwimWorkoutProgress[] = ordered.map(({ workout, weekIndex, dayIndex }) => {
    const key = swimWorkoutPlanKey(program, workout);
    const open = key ? openDraftsByPlanKey.get(key) : undefined;
    const status: SwimWorkoutProgressStatus = !key
      ? "not_started"
      : completedPlanKeys.has(key)
        ? "completed"
        : open?.status === "awaiting_confirmation"
          ? "awaiting_confirmation"
          : open?.status === "active"
            ? "in_progress"
            : "not_started";
    return { workout, weekIndex, dayIndex, status, planKey: key ?? "", draftId: open?.id ?? null };
  });

  const completedCount = workouts.filter((w) => w.status === "completed").length;
  const nextWorkout = workouts.find((w) => w.status === "in_progress" || w.status === "awaiting_confirmation") ?? workouts.find((w) => w.status === "not_started") ?? null;
  const currentWeekIndex = nextWorkout?.weekIndex ?? (workouts.length ? workouts[workouts.length - 1].weekIndex : null);

  return { program, completedCount, totalCount: workouts.length, currentWeekIndex, nextWorkout, workouts };
}
