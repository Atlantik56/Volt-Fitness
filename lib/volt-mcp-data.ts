import type Database from "better-sqlite3";
import { buildHomeWeek } from "@/app/personal-data.ts";
import { buildWeekSchedule, sessionsForDay, weekRangeContaining, type WeekScheduleChange } from "@/app/week-schedule-model.ts";
import { buildAnalyticsBundleFromDb } from "./analytics-service.ts";
import { loadAiCoachContextData } from "./ai-context-data.ts";
import type { TrainingPlanCycle } from "./training-program/types.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function assertIsoDate(date: string): string {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date) throw new Error("Дата должна быть в формате YYYY-MM-DD");
  return date;
}

function planInputs(db: Database.Database, date: string) {
  const profile = (db.prepare("SELECT program_start programStart FROM profile WHERE id=1").get() ?? {}) as { programStart?: string };
  const cycles = db.prepare(`SELECT id,program_id programId,program_version programVersion,started_at startedAt,ended_at endedAt,
    restarted_from_cycle_id restartedFromCycleId FROM training_plan_cycles WHERE program_id='volt-training'
    ORDER BY started_at ASC,id ASC`).all() as TrainingPlanCycle[];
  const range = weekRangeContaining(date);
  const changes = db.prepare(`SELECT id,date,action,assigned_source_day assignedSourceDay,swap_with_date swapWithDate,
    alternative_session_id alternativeSessionId,reason_code reasonCode,created_at createdAt,updated_at updatedAt
    FROM week_schedule_changes WHERE date BETWEEN ? AND ? ORDER BY date ASC,id ASC`)
    .all(range.mondayIso, range.sundayIso) as WeekScheduleChange[];
  return { profile, cycles, range, changes };
}

const simplifySession = (session: ReturnType<typeof sessionsForDay>[number]) => ({
  id: session.id ?? null,
  title: session.title,
  type: session.type,
  time: session.time,
  discipline: session.discipline ?? null,
  role: session.role ?? null,
  required: session.required !== false && session.optional !== true,
});

export function getWeekPlan(db: Database.Database, anchorDate: string) {
  const date = assertIsoDate(anchorDate), { profile, cycles, range, changes } = planInputs(db, date);
  const canonical = buildHomeWeek(profile.programStart, cycles, date);
  return {
    week: range,
    days: buildWeekSchedule(canonical, changes, range.mondayIso).map((day) => ({
      date: day.date,
      weekday: day.scheduled.d,
      changed: day.changed,
      changeReason: day.reasonCode || null,
      sessions: sessionsForDay(day.scheduled).map(simplifySession),
    })),
  };
}

export function getTodaySummary(db: Database.Database, dateInput: string) {
  const date = assertIsoDate(dateInput);
  const context = loadAiCoachContextData(db, { date, historyDays: 7, workoutsLimit: 5, personalRecordsLimit: 5 });
  const todayPlan = getWeekPlan(db, date).days.find((day) => day.date === date) ?? null;
  return {
    date,
    profile: context.profile ? {
      name: context.profile.name,
      heightCm: context.profile.height,
      startWeightKg: context.profile.startWeight,
      targetWeightKg: context.profile.targetWeight,
    } : null,
    plan: todayPlan,
    latestMeasurement: context.measurements?.[0] ?? null,
    todayFood: context.foodLogs?.filter((row) => row.date === date) ?? [],
    todayActivity: context.activity?.find((row) => row.date === date) ?? null,
    todayWellness: context.wellnessLogs?.find((row) => row.date === date) ?? null,
    todayMood: context.moodLogs?.find((row) => row.date === date) ?? null,
    latestWorkouts: context.workouts ?? [],
    dataPolicy: "Confirmed VOLT records only; Strava-origin workouts are excluded from AI tools.",
  };
}

export function getRecentWorkouts(db: Database.Database, dateInput: string, limitInput = 10) {
  const date = assertIsoDate(dateInput), limit = Math.max(1, Math.min(30, Math.trunc(limitInput)));
  return {
    date,
    workouts: db.prepare(`SELECT date,type,title,duration_seconds durationSeconds,rest_seconds restSeconds,
      effort,pain_after painAfter,distance_meters distanceMeters,avg_heart_rate avgHeartRate,max_heart_rate maxHeartRate,
      calories,metrics_source metricsSource FROM workout_logs WHERE date<=?
      AND COALESCE(external_activity_source,'')!='strava' ORDER BY date DESC,id DESC LIMIT ?`).all(date, limit),
    excludedSources: ["strava"],
  };
}

export function getTrainingLoad(db: Database.Database, dateInput: string, range: "current_week"|"4_weeks"|"8_weeks"|"12_weeks" = "4_weeks") {
  const date = assertIsoDate(dateInput), overview = buildAnalyticsBundleFromDb(db, date).ranges[range];
  return {
    generatedAt: new Date().toISOString(),
    range: overview.period,
    overview: overview.overview,
    consistency: overview.consistency,
    plan: overview.plan,
    dataCoverage: overview.dataCoverage,
  };
}

export function getProgressSummary(db: Database.Database, dateInput: string) {
  const date = assertIsoDate(dateInput), context = loadAiCoachContextData(db, { date, historyDays: 84, workoutsLimit: 30, personalRecordsLimit: 20 });
  const measurements = context.measurements ?? [];
  const newest = measurements[0] ?? null, oldest = measurements.at(-1) ?? null;
  const analytics = buildAnalyticsBundleFromDb(db, date).ranges["12_weeks"];
  return {
    date,
    weight: {
      current: newest?.weight ?? null,
      currentDate: newest?.date ?? null,
      startOfWindow: oldest?.weight ?? null,
      startOfWindowDate: oldest?.date ?? null,
      changeKg: newest?.weight != null && oldest?.weight != null ? Math.round((newest.weight - oldest.weight) * 10) / 10 : null,
      targetKg: context.profile?.targetWeight ?? null,
    },
    training: analytics.overview,
    strength: analytics.strength,
    milestones: context.milestones ?? [],
    dataCoverage: analytics.dataCoverage,
  };
}

export function getRecords(db: Database.Database, dateInput: string, limitInput = 20) {
  const date = assertIsoDate(dateInput), limit = Math.max(1, Math.min(50, Math.trunc(limitInput)));
  const context = loadAiCoachContextData(db, { date, historyDays: 0, workoutsLimit: 0, personalRecordsLimit: limit });
  return { date, records: context.personalRecords ?? [], milestones: context.milestones ?? [] };
}
