import { db } from "@/lib/db";
import { isSwimActivity } from "@/lib/swim-classify";
import { formatPace100m } from "@/lib/swim-metrics";
import { getNextSwimWorkout } from "@/lib/swim/services";
import { totalDistanceMeters } from "@/lib/swim/workout-engine";
import { getSwimInsights } from "@/lib/swim/insight-service";
import type { SwimHomeData, SwimLastSwimView, SwimNextWorkoutView, SwimWeeklyActivityView, SwimMetricsView } from "@/app/swim/types";

type WorkoutLogRow = {
  id: number;
  date: string;
  type: string;
  title: string;
  durationSeconds: number;
  distanceMeters: number;
  avgHeartRate: number;
  calories: number;
  metricsSource: string;
  notes: string;
};

const selectLogs = `SELECT id,date,type,title,duration_seconds durationSeconds,distance_meters distanceMeters,avg_heart_rate avgHeartRate,calories,metrics_source metricsSource,notes FROM workout_logs ORDER BY date DESC,id DESC LIMIT 400`;

function mondayIso(date: Date): string {
  const day = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}
function sundayIso(date: Date): string {
  const day = date.getDay() || 7;
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + (7 - day));
  return sunday.toISOString().slice(0, 10);
}

function buildNextWorkoutView(): SwimNextWorkoutView {
  const next = getNextSwimWorkout();
  if (!next) return null;
  return {
    status: next.status === "completed" ? "not_started" : next.status,
    programId: "foundation",
    workoutId: next.workout.id,
    title: next.workout.title,
    goal: next.workout.goal,
    distanceMeters: totalDistanceMeters(next.workout),
    estimatedMinutes: next.workout.estimatedMinutes,
  };
}

export function getSwimHomeData(): SwimHomeData {
  const logs = (db.prepare(selectLogs).all() as WorkoutLogRow[]).filter((row) => isSwimActivity(row.type, row.title));

  const nextWorkout = buildNextWorkoutView();

  const lastLog = logs[0];
  const lastSwim: SwimLastSwimView = lastLog
    ? {
        date: lastLog.date,
        distanceMeters: lastLog.distanceMeters > 0 ? lastLog.distanceMeters : null,
        durationSeconds: lastLog.durationSeconds > 0 ? lastLog.durationSeconds : null,
        paceLabel: formatPace100m(lastLog.distanceMeters, lastLog.durationSeconds),
        poolLengthMeters: null,
        source: lastLog.metricsSource === "imported_metric" ? "imported_metric" : "manual",
        notes: lastLog.notes ? lastLog.notes : null,
      }
    : null;

  const now = new Date();
  const weekStart = mondayIso(now);
  const weekEnd = sundayIso(now);
  const weekLogs = logs.filter((row) => row.date >= weekStart && row.date <= weekEnd);
  const weeklyActivity: SwimWeeklyActivityView = {
    swimCount: weekLogs.length,
    totalDistanceMeters: weekLogs.reduce((sum, row) => sum + (row.distanceMeters > 0 ? row.distanceMeters : 0), 0),
    goalMeters: null,
  };

  const recentWithPace = logs.find((row) => formatPace100m(row.distanceMeters, row.durationSeconds) !== null);
  const recentWithHeartRate = logs.find((row) => row.avgHeartRate > 0);
  const recentWithCalories = logs.find((row) => row.calories > 0);
  const metrics: SwimMetricsView = {
    avgPaceLabel: recentWithPace ? formatPace100m(recentWithPace.distanceMeters, recentWithPace.durationSeconds) : null,
    swolf: null,
    avgHeartRate: recentWithHeartRate ? recentWithHeartRate.avgHeartRate : null,
    calories: recentWithCalories ? recentWithCalories.calories : null,
  };

  return { nextWorkout, lastSwim, weeklyActivity, metrics, hasAnySwimHistory: logs.length > 0, insights: getSwimInsights() };
}
