// Сопоставление факта из Garmin/FIT со спланированными интервалами —
// экран подтверждения (см. app/swim/components/garmin-match-panel.tsx), а не
// активная тренировка: реальные длины/темп/паузы подтверждаются постфактум,
// не ручным чек-ином во время заплыва.
import type { FitLap } from "@/lib/fit-import-service";
import { exerciseLabelRu } from "@/lib/swim/exercise-catalog";
import { intervalTotalMeters } from "@/lib/swim/workout-engine";
import type { SwimInterval, SwimWorkoutDef } from "@/lib/swim/types";

export type IntervalFitMatch = {
  interval: SwimInterval;
  exerciseName: string;
  plannedMeters: number;
  actualMeters: number | null;
  actualSeconds: number | null;
  lapCount: number;
};

export type FitMatchResult = {
  // По интервалу — только когда число FIT-лапов совпадает с суммой repeats
  // всех интервалов плана. Иначе достоверно разбить лапы по интервалам
  // нельзя — показываем только агрегат.
  perInterval: IntervalFitMatch[] | null;
  totalActualMeters: number;
  totalActualSeconds: number;
};

export function matchLapsToIntervals(workout: SwimWorkoutDef, laps: FitLap[]): FitMatchResult {
  const totalActualMeters = Math.round(laps.reduce((sum, lap) => sum + lap.distanceMeters, 0));
  const totalActualSeconds = Math.round(laps.reduce((sum, lap) => sum + lap.durationSeconds, 0));

  const plannedRepeats = workout.intervals.reduce((sum, interval) => sum + Math.max(1, interval.repeats), 0);
  if (!laps.length || plannedRepeats !== laps.length) {
    return { perInterval: null, totalActualMeters, totalActualSeconds };
  }

  let cursor = 0;
  const perInterval: IntervalFitMatch[] = workout.intervals.map((interval) => {
    const count = Math.max(1, interval.repeats);
    const slice = laps.slice(cursor, cursor + count);
    cursor += count;
    return {
      interval,
      exerciseName: exerciseLabelRu(interval.exerciseId),
      plannedMeters: intervalTotalMeters(interval),
      actualMeters: slice.length ? Math.round(slice.reduce((sum, lap) => sum + lap.distanceMeters, 0)) : null,
      actualSeconds: slice.length ? Math.round(slice.reduce((sum, lap) => sum + lap.durationSeconds, 0)) : null,
      lapCount: slice.length,
    };
  });

  return { perInterval, totalActualMeters, totalActualSeconds };
}
