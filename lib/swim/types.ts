// VOLT Swim — доменные типы программ, упражнений и AI Coach контракта.
// Единственный источник структуры программ/упражнений для Sprint 2+; компоненты
// не должны определять собственные формы этих данных.

export type SwimStroke = "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "kick" | "drill" | "mixed";
export type ExerciseCategory = "stroke" | "drill" | "kick" | "pull" | "technique";
export type ExerciseDifficulty = "beginner" | "intermediate" | "advanced";

export type SwimExercise = {
  id: string;
  name: string;
  description: string;
  category: ExerciseCategory;
  stroke: SwimStroke;
  equipment: string[];
  difficulty: ExerciseDifficulty;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  tags: string[];
  futureVideoId: string | null;
};

export type SwimIntervalType = "warmup" | "main_set" | "cooldown" | "drill" | "recovery" | "sprint" | "easy" | "technique";

export type SwimInterval = {
  id: string;
  type: SwimIntervalType;
  exerciseId: string;
  // Дистанция одного повтора; итоговый объём = distanceMeters * repeats.
  distanceMeters: number;
  repeats: number;
  description: string;
  restSeconds: number | null;
  targetPaceSecondsPer100: number | null;
  equipment: string[];
};

export type SwimWorkoutLevel = "beginner" | "intermediate" | "advanced";

export type SwimWorkoutDef = {
  id: string;
  title: string;
  goal: string;
  level: SwimWorkoutLevel;
  // Авторская оценка длительности (та же роль, что `time:"~30–35 мин"` в
  // app/personal-data.ts) — не вычисляемая "точная" цифра, честная ~оценка.
  estimatedMinutes: number;
  intervals: SwimInterval[];
};

export type SwimDay = {
  dayIndex: number; // 1..7, как homeWeek в app/personal-data.ts
  workout: SwimWorkoutDef | null; // null — день отдыха
};

export type SwimWeekDef = {
  weekIndex: number; // 1-based
  days: SwimDay[];
};

export type SwimProgramStatus = "available" | "coming_soon";

export type SwimProgramDef = {
  id: string;
  name: string;
  description: string;
  level: SwimWorkoutLevel;
  status: SwimProgramStatus;
  // Версия попадает в snapshot.type (см. lib/swim/workout-engine.ts) — правка
  // программы не должна переписывать planKey уже пройденных тренировок.
  version: number;
  weeks: SwimWeekDef[];
};

// --- AI Coach контракт (архитектура, Sprint 2 сервис возвращает []) ---
export type SwimInsightPriority = "low" | "medium" | "high";
export type SwimInsightSource = "pace" | "volume" | "consistency" | "recovery" | "program";

export type SwimInsight = {
  id: string;
  title: string;
  description: string;
  priority: SwimInsightPriority;
  source: SwimInsightSource;
  createdAt: string;
};

// --- Прогресс программы (вычисляется, не хранится) ---
export type SwimWorkoutProgressStatus = "not_started" | "in_progress" | "awaiting_confirmation" | "completed";

export type SwimWorkoutProgress = {
  workout: SwimWorkoutDef;
  weekIndex: number;
  dayIndex: number;
  status: SwimWorkoutProgressStatus;
  planKey: string;
  draftId: number | null;
};

export type SwimProgramProgress = {
  program: SwimProgramDef;
  completedCount: number;
  totalCount: number;
  currentWeekIndex: number | null;
  nextWorkout: SwimWorkoutProgress | null;
  workouts: SwimWorkoutProgress[];
};
