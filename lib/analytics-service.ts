import { db } from "./db.ts";
import { buildProgramDayForDate } from "@/app/personal-data.ts";
import { changesByDateMap, datesOfWeek, resolvePlanForDate, sessionsForDay, weekRangeContaining, type WeekScheduleChange } from "@/app/week-schedule-model.ts";
import {
  ANALYTICS_RANGES, addIsoDays, buildAnalyticsOverview, classifyAnalyticsSport, normalizeAnalyticsWorkouts,
  normalizeStrengthSets, resolveAnalyticsPeriod, type AnalyticsBundle, type AnalyticsPlannedSlot, type RawAnalyticsWorkout, type RawStrengthSet,
} from "./analytics-core.ts";

const localIso = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

type ProfileRow = { programStart?: string; trainingPlanV3StartedAt?: string | null };
type ScheduleOverride = { originalDate: string; scheduledDate: string; planTitle: string; replacementTitle: string | null };
type TrainingPlanCycleRow={id:number;startedAt:string;endedAt:string|null};

function buildPlannedSlots(input: {
  profile: ProfileRow;
  from: string;
  to: string;
  weekChanges: WeekScheduleChange[];
  scheduleOverrides: ScheduleOverride[];
  planCycles:TrainingPlanCycleRow[];
}): AnalyticsPlannedSlot[] {
  const slots: AnalyticsPlannedSlot[] = [];
  const changes = changesByDateMap(input.weekChanges);
  const movedFrom = new Map(input.scheduleOverrides.map((row) => [row.originalDate, row]));
  const movedTo = new Map(input.scheduleOverrides.map((row) => [row.scheduledDate, row]));
  const weekCache = new Map<string, ReturnType<typeof buildProgramDayForDate>[]>();
  const cycleForDate=(date:string)=>input.planCycles.find(cycle=>cycle.startedAt<=date&&(!cycle.endedAt||cycle.endedAt>=date))??null;
  for (let date = input.from; date <= input.to; date = addIsoDays(date, 1)) {
    const oldMoveFrom = movedFrom.get(date), oldMoveTo = movedTo.get(date), currentChange = changes.get(date);
    if (!currentChange && oldMoveFrom && oldMoveFrom.scheduledDate !== date) continue;
    if (!currentChange && oldMoveTo) {
      const title = oldMoveTo.replacementTitle || oldMoveTo.planTitle;
      slots.push({ date, sport: classifyAnalyticsSport({ title }), title, required: true });
      continue;
    }
    const weekKey = weekRangeContaining(date).mondayIso;
    let homeWeek = weekCache.get(weekKey);
    if (!homeWeek) {
      homeWeek=datesOfWeek(weekKey).map(calendarDate=>{
        const cycle=cycleForDate(calendarDate);
        return buildProgramDayForDate(input.profile.programStart,cycle?.startedAt??null,calendarDate,cycle?.id??null);
      });
      weekCache.set(weekKey,homeWeek);
    }
    const resolved = resolvePlanForDate(date, homeWeek, changes);
    for (const session of sessionsForDay(resolved.scheduled)) {
      const sport = classifyAnalyticsSport(session);
      if (sport === "recovery" || String(session.type).toLocaleLowerCase("ru-RU") === "отдых") continue;
      slots.push({ date, sport, title: session.title, required: session.required !== false && session.optional !== true });
    }
  }
  return slots;
}

export function buildAnalyticsBundle(todayIso = localIso(new Date())): AnalyticsBundle {
  const periods = Object.fromEntries(ANALYTICS_RANGES.map((key) => [key, resolveAnalyticsPeriod(key, todayIso)])) as Record<(typeof ANALYTICS_RANGES)[number], ReturnType<typeof resolveAnalyticsPeriod>>;
  const earliest = ANALYTICS_RANGES.reduce((value, key) => periods[key].previousFrom < value ? periods[key].previousFrom : value, todayIso);
  const profile = (db.prepare("SELECT program_start programStart,training_plan_v3_started_at trainingPlanV3StartedAt FROM profile WHERE id=1").get() ?? {}) as ProfileRow;
  const workoutRows = db.prepare(`SELECT id,date,type,title,duration_seconds durationSeconds,distance_meters distanceMeters,calories,
    avg_heart_rate avgHeartRate,max_heart_rate maxHeartRate,avg_speed avgSpeed,metrics_source metricsSource,
    external_activity_source externalActivitySource FROM workout_logs WHERE date BETWEEN ? AND ? ORDER BY date ASC,id ASC`).all(earliest, todayIso) as RawAnalyticsWorkout[];
  const strengthRows = db.prepare(`SELECT s.workout_id workoutId,s.date,s.exercise,s.weight,s.reps
    FROM strength_logs s JOIN workout_logs w ON w.id=s.workout_id
    WHERE s.date BETWEEN ? AND ? AND COALESCE(w.external_activity_source,'')!='strava'
    ORDER BY s.date ASC,s.id ASC`).all(earliest, todayIso) as RawStrengthSet[];
  const weekChanges = db.prepare(`SELECT id,date,action,assigned_source_day assignedSourceDay,swap_with_date swapWithDate,
    reason_code reasonCode,created_at createdAt,updated_at updatedAt FROM week_schedule_changes WHERE date BETWEEN ? AND ? ORDER BY date ASC,id ASC`).all(earliest, todayIso) as WeekScheduleChange[];
  const scheduleOverrides = db.prepare(`SELECT original_date originalDate,scheduled_date scheduledDate,plan_title planTitle,replacement_title replacementTitle
    FROM schedule_overrides WHERE original_date BETWEEN ? AND ? OR scheduled_date BETWEEN ? AND ? ORDER BY scheduled_date ASC,id ASC`).all(earliest, todayIso, earliest, todayIso) as ScheduleOverride[];
  const planCycles=db.prepare(`SELECT id,started_at startedAt,ended_at endedAt FROM training_plan_cycles
    WHERE program_id='volt-training' AND program_version=3 AND started_at<=? AND (ended_at IS NULL OR ended_at>=?) ORDER BY started_at ASC,id ASC`).all(todayIso,earliest) as TrainingPlanCycleRow[];
  const normalized = normalizeAnalyticsWorkouts(workoutRows);
  const strengthSets = normalizeStrengthSets(strengthRows, new Set(normalized.included.map((workout) => workout.id)));
  const plans = buildPlannedSlots({ profile, from: earliest, to: todayIso, weekChanges, scheduleOverrides,planCycles });
  const ranges = Object.fromEntries(ANALYTICS_RANGES.map((key) => {
    const period = periods[key];
    const excludedStravaWorkouts = workoutRows.filter((row) => String(row.externalActivitySource ?? "").toLowerCase() === "strava" && String(row.date) >= period.from && String(row.date) <= period.to).length;
    return [key, buildAnalyticsOverview({ period, workouts: normalized.included, strengthSets, plans, excludedStravaWorkouts })];
  })) as AnalyticsBundle["ranges"];
  return { generatedAt: new Date().toISOString(), defaultRange: "4_weeks", ranges };
}
