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

export type TrainingWorkoutReference =
  | { kind: "catalog"; workoutId: string }
  | { kind: "swim"; programId: string; programVersion: number; workoutId: string | null };

export type TrainingSessionDefinition = {
  id: string;
  day: number;
  discipline: TrainingDiscipline;
  role: TrainingSessionRole;
  required: boolean;
  title: string;
  estimatedDuration: TrainingDuration | null;
  workoutRef: TrainingWorkoutReference;
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
