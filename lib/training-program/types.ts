export type TrainingDiscipline = "strength" | "swim" | "bike" | "recovery" | "cardio";

export type TrainingSessionRole =
  | "legacy-strength"
  | "legacy-cardio"
  | "strength-a"
  | "strength-b"
  | "technique"
  | "aerobic"
  | "endurance"
  | "zone-2"
  // План 4.0: интервальная работа на станке, выполняется сидя.
  | "intervals"
  | "recovery";

export type TrainingDuration = {
  minMinutes: number;
  maxMinutes: number;
};

export type TrainingProgramIdentity = {
  programId: string;
  programVersion: number;
  weekIndex: number;
  sessionId: string;
  // Present for restartable programs. It prevents a completed workout from a
  // previous cycle from completing the same slot in a newly started cycle.
  cycleId?: number;
};

/**
 * Immutable activation boundary for one version of the shared VOLT program.
 * Open (`endedAt === null`) means the current/future cycle selected by the
 * application; historical dates are still resolved through closed cycles.
 */
export type TrainingPlanCycle = {
  id: number;
  programId: string;
  programVersion: number;
  startedAt: string;
  endedAt: string | null;
  restartedFromCycleId: number | null;
};

export type TrainingWorkoutReference =
  | { kind: "catalog"; workoutId: string }
  | { kind: "swim"; programId: string; programVersion: number; workoutId: string | null };

// Альтернатива гибкого слота: чем можно заменить сессию, не трогая
// каноническую программу. Выбор пользователя живёт в week_schedule_changes.
export type TrainingSessionAlternative = {
  id: string;
  discipline: TrainingDiscipline;
  role: TrainingSessionRole;
  title: string;
  estimatedDuration: TrainingDuration | null;
  workoutRef: TrainingWorkoutReference;
};

export type TrainingSessionDefinition = {
  id: string;
  day: number;
  discipline: TrainingDiscipline;
  role: TrainingSessionRole;
  required: boolean;
  title: string;
  estimatedDuration: TrainingDuration | null;
  workoutRef: TrainingWorkoutReference;
  // Непустой список делает слот гибким: пользователь может выбрать одну из
  // альтернатив на конкретную дату.
  alternatives?: readonly TrainingSessionAlternative[];
};

export type TrainingWeekDefinition = {
  index: number;
  title: string;
  phase: string;
  sessions: readonly TrainingSessionDefinition[];
};

export type TrainingProgramDefinition = {
  id: string;
  version: number;
  name: string;
  description: string;
  effectiveFromWeek: number;
  weeks: readonly TrainingWeekDefinition[];
  continuationWeek?: Omit<TrainingWeekDefinition, "index">;
};

export type TrainingExerciseDefinition = readonly [
  name: string,
  description: string,
  target: string,
  image?: string,
];

export type TrainingWorkoutDefinition = {
  id: string;
  type: string;
  title: string;
  rounds: number;
  image: string;
  exercises: readonly TrainingExerciseDefinition[];
  warmup?: readonly TrainingExerciseDefinition[];
  availability?: "planned";
};

export type ResolvedTrainingWeek = {
  program: TrainingProgramDefinition;
  week: TrainingWeekDefinition;
};
