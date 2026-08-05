import { db } from "@/lib/db";
import { isSwimActivity } from "@/lib/swim-classify";
import { formatPace100m } from "@/lib/swim-metrics";
import { getProgramProgress } from "@/lib/swim/services";
import { totalDistanceMeters } from "@/lib/swim/workout-engine";
import { getSwimInsights } from "@/lib/swim/insight-service";
import type { SwimHomeData, SwimLastSwimView, SwimNextWorkoutView, SwimWeeklyActivityView, SwimMetricsView, SwimRecentSessionView, SwimEffortDistribution } from "@/app/swim/types";

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
  effort: string;
};

const selectLogs = `SELECT id,date,type,title,duration_seconds durationSeconds,distance_meters distanceMeters,avg_heart_rate avgHeartRate,calories,metrics_source metricsSource,notes,effort FROM workout_logs ORDER BY date DESC,id DESC LIMIT 400`;

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
  const progress = getProgramProgress("foundation");
  const next = progress?.nextWorkout;
  if (!next) return null;
  return {
    status: next.status === "completed" ? "not_started" : next.status,
    programId: "foundation",
    workoutId: next.workout.id,
    title: next.workout.title,
    goal: next.workout.goal,
    distanceMeters: totalDistanceMeters(next.workout),
    estimatedMinutes: next.workout.estimatedMinutes,
    weekIndex: next.weekIndex,
    progressPercent: progress?.totalCount ? Math.round((progress.completedCount / progress.totalCount) * 100) : 0,
    calendarDate: next.calendar?.date ?? null,
    weekday: next.calendar?.weekday ?? null,
    isToday: next.calendar?.isToday ?? false,
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
  const weekDates = Array.from({ length: 7 }, (_, index) => { const value = new Date(`${weekStart}T12:00:00`); value.setDate(value.getDate() + index); return value.toISOString().slice(0, 10); });
  const weekHeartRates = weekLogs.map((row) => row.avgHeartRate).filter((value) => value > 0);
  const weeklyActivity: SwimWeeklyActivityView = {
    swimCount: weekLogs.length,
    totalDistanceMeters: weekLogs.reduce((sum, row) => sum + (row.distanceMeters > 0 ? row.distanceMeters : 0), 0),
    goalMeters: null,
    totalDurationSeconds: weekLogs.reduce((sum, row) => sum + Math.max(0, row.durationSeconds), 0),
    totalCalories: weekLogs.reduce((sum, row) => sum + Math.max(0, row.calories), 0),
    avgHeartRate: weekHeartRates.length ? Math.round(weekHeartRates.reduce((sum, value) => sum + value, 0) / weekHeartRates.length) : null,
    dailyMeters: weekDates.map((date) => weekLogs.filter((row) => row.date === date).reduce((sum, row) => sum + Math.max(0, row.distanceMeters), 0)),
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

  const toRecent = (row: WorkoutLogRow): SwimRecentSessionView => ({ id: row.id, date: row.date, title: row.title, distanceMeters: row.distanceMeters > 0 ? row.distanceMeters : null, durationSeconds: row.durationSeconds > 0 ? row.durationSeconds : null, paceLabel: formatPace100m(row.distanceMeters, row.durationSeconds), avgHeartRate: row.avgHeartRate > 0 ? row.avgHeartRate : null, effort: row.effort || null });
  const recentSwims = logs.slice(0, 3).map(toRecent);
  const monthPrefix = now.toISOString().slice(0, 7);
  const monthBest = logs.filter((row) => row.date.startsWith(monthPrefix) && row.distanceMeters > 0).sort((a, b) => b.distanceMeters - a.distanceMeters)[0];
  const effortDistribution = logs.slice(0, 12).reduce<SwimEffortDistribution>((result, row) => { const effort = row.effort.toLowerCase(); if (effort.includes("лег")) result.easy += 1; else if (effort.includes("тяж") || effort.includes("боль")) result.hard += 1; else result.aerobic += 1; return result; }, { easy: 0, aerobic: 0, hard: 0 });
  return { nextWorkout, lastSwim, weeklyActivity, metrics, hasAnySwimHistory: logs.length > 0, insights: getSwimInsights(), recentSwims, monthRecord: monthBest ? toRecent(monthBest) : null, effortDistribution };
}
