// Мост между доменной моделью VOLT Swim и уже существующим движком черновиков
// тренировок (lib/active-workout-service.ts). Не создаёт параллельную систему
// хранения/подтверждения: каждый интервал упаковывается в WorkoutSnapshot того
// же формата, что использует силовая тренировка, и идёт через тот же
// start/finish/confirm draft flow (AI-7/AI-9). Дистанция интервала сохраняется
// в поле `reps` набора при подтверждении — общая схема workout_logs.details не
// умеет метры, а заводить отдельную swim-таблицу без доказанной необходимости
// запрещено сценарием Sprint 2.
//
// Этот файл импортируется и клиентскими компонентами (для сборки snapshot/
// exercises перед отправкой в /api/fitness), и сервером — поэтому он берёт
// normalizeSnapshot из lib/workout-snapshot.ts (без node built-ins), а не из
// lib/active-workout-service.ts (тянет lib/db.ts/better-sqlite3, что ломает
// клиентскую сборку). planKey (node:crypto, только сервер) — в
// lib/swim/workout-plan-key.ts, не здесь.
import { normalizeSnapshot, type WorkoutSnapshot } from "@/lib/workout-snapshot";
import { exerciseLabelRu, getExerciseById } from "@/lib/swim/exercise-catalog";
import { trainingProgramRegistry } from "@/lib/training-program/registry";
import type { SwimInterval, SwimProgramDef, SwimWorkoutDef } from "@/lib/swim/types";

export const SWIM_WORKOUT_TYPE_PREFIX = "Плавание";

export function intervalTotalMeters(interval: SwimInterval): number {
  return Math.max(0, interval.distanceMeters) * Math.max(1, interval.repeats);
}

export function totalDistanceMeters(workout: SwimWorkoutDef): number {
  return workout.intervals.reduce((sum, interval) => sum + intervalTotalMeters(interval), 0);
}

const INTERVAL_TYPE_LABEL_RU: Record<SwimInterval["type"], string> = {
  warmup: "Разминка",
  main_set: "Основная часть",
  cooldown: "Заминка",
  drill: "Техника",
  recovery: "Восстановление",
  sprint: "Спринт",
  easy: "Лёгкий темп",
  technique: "Техника",
};

export function intervalTypeLabel(type: SwimInterval["type"]): string {
  return INTERVAL_TYPE_LABEL_RU[type];
}

function intervalTargetText(interval: SwimInterval): string {
  const distance = Math.max(1, Math.round(interval.distanceMeters));
  return interval.repeats > 1 ? `${interval.repeats}×${distance} м` : `${distance} м`;
}

function intervalExerciseLabel(interval: SwimInterval, index: number): string {
  const exercise = getExerciseById(interval.exerciseId);
  const exerciseName = exercise?.name ?? interval.exerciseId;
  return `${index + 1}. ${intervalTypeLabel(interval.type)} · ${exerciseName}`;
}

// snapshot.type кодирует версию программы, чтобы правка программы (version++)
// не переписывала planKey уже пройденных тренировок пользователя.
export function swimWorkoutType(program: Pick<SwimProgramDef, "version">): string {
  return `${SWIM_WORKOUT_TYPE_PREFIX} v${program.version}`;
}

export function buildSwimSnapshot(program: SwimProgramDef, workout: SwimWorkoutDef, cycleId?:number|null): WorkoutSnapshot | null {
  const baseIdentity = trainingProgramRegistry.identityForSwimWorkout(program.id, program.version, workout.id) ?? undefined;
  const programIdentity=baseIdentity?{...baseIdentity,...(cycleId?{cycleId}:{})}:undefined;
  const raw = {
    title: `${program.name} · ${workout.title}`,
    type: swimWorkoutType(program),
    rounds: 1,
    programIdentity,
    exercises: workout.intervals.map((interval, index) => ({
      name: intervalExerciseLabel(interval, index),
      target: intervalTargetText(interval),
      recommendedWeight: 0,
    })),
  };
  return normalizeSnapshot(raw);
}

export type SwimIntervalStepView = {
  index: number;
  total: number;
  interval: SwimInterval;
  exerciseName: string;
  totalMeters: number;
  repeatIndex: number;
  repeatTotal: number;
  key: string;
};

// Разворачивает каждый повтор интервала в отдельный шаг — используется для
// подсчёта плановых метров и сопоставления с FIT-лапами (см. lib/swim/fit-match.ts),
// НЕ для управления активной тренировкой (там пользователь работает с
// целыми интервалами плана, см. app/swim/workouts/[programId]/[workoutId]/page.tsx).
export function buildIntervalSteps(workout: SwimWorkoutDef): SwimIntervalStepView[] {
  const flat = workout.intervals.flatMap((interval) => Array.from({ length: Math.max(1, interval.repeats) }, (_, repeatIndex) => ({ interval, repeatIndex })));
  return flat.map(({ interval, repeatIndex }, index) => ({
    index, total: flat.length, interval,
    exerciseName: exerciseLabelRu(interval.exerciseId),
    totalMeters: interval.distanceMeters,
    repeatIndex, repeatTotal: Math.max(1, interval.repeats), key: `${interval.id}:${repeatIndex}`,
  }));
}

// Подходы, которые уйдут в confirmWorkoutDraft: `reps` каждого сета — это
// пройденная дистанция интервала в метрах (см. комментарий в шапке файла), не
// количество повторений.
export function buildConfirmationExercises(workout: SwimWorkoutDef) {
  return workout.intervals.map((interval, index) => ({
    name: intervalExerciseLabel(interval, index),
    sets: [{ weight: 0, reps: intervalTotalMeters(interval) }],
    skipped: false,
    added: false,
    source: "confirmed_as_planned" as const,
  }));
}
