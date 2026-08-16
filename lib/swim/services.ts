// Единственное место в lib/swim/, которое обращается к БД. program-engine.ts и
// workout-engine.ts остаются чистыми функциями — здесь они соединяются с
// реальными workout_drafts.
import { db } from "@/lib/db";
import { buildProgramWeek } from "@/app/personal-data";
import { changesByDateMap, localIso, resolvePlanForDate, sessionsForDay, weekRangeContaining } from "@/app/week-schedule-model";
import { listWeekScheduleChanges } from "@/lib/week-schedule-service";
import { computeProgramProgress, getProgram, listPrograms } from "@/lib/swim/program-engine";
import { assignSwimCalendar, isSwimSlot, type SwimScheduleWorkoutInput } from "@/lib/swim/schedule-sync";
import { PLAN_V2_EFFECTIVE_WEEK } from "@/lib/training-program/definitions";
import { programWeekForDate, programWeekMonday } from "@/lib/training-program/registry";
import type { ResolvedSwimSlot, SwimCalendarDay, SwimProgramProgress, SwimWorkoutActual, SwimWorkoutProgress } from "@/lib/swim/types";

type OpenDraftStatus = "active" | "awaiting_confirmation";

function completedPlanKeys(): Set<string> {
  const rows = db.prepare("SELECT DISTINCT plan_key planKey FROM workout_drafts WHERE status='completed'").all() as { planKey: string }[];
  return new Set(rows.map((row) => row.planKey));
}

function openDraftsByPlanKey(): Map<string, { id: number; status: OpenDraftStatus; date: string }> {
  const rows = db.prepare("SELECT id,plan_key planKey,status,date FROM workout_drafts WHERE status IN ('active','awaiting_confirmation')").all() as { id: number; planKey: string; status: OpenDraftStatus; date: string }[];
  return new Map(rows.map((row) => [row.planKey, { id: row.id, status: row.status, date: row.date }]));
}

// Для каждого plan_key берётся самое свежее завершённое подтверждение
// (ORDER BY wd.id DESC), на случай если один и тот же план был пройден
// повторно. workout_logs остаётся единственным источником фактических метрик
// и реальной даты выполнения (нужна для календарной синхронизации).
function completedActualsByPlanKey(): Map<string, SwimWorkoutActual> {
  const rows = db.prepare(
    `SELECT wd.plan_key planKey, wl.distance_meters distanceMeters, wl.duration_seconds durationSeconds, wl.calories calories, wl.date date
     FROM workout_drafts wd JOIN workout_logs wl ON wl.id = wd.workout_id
     WHERE wd.status='completed' AND wd.workout_id IS NOT NULL
     ORDER BY wd.id ASC`,
  ).all() as { planKey: string; distanceMeters: number; durationSeconds: number; calories: number; date: string }[];
  const map = new Map<string, SwimWorkoutActual>();
  for (const row of rows) {
    map.set(row.planKey, { distanceMeters: row.distanceMeters, durationSeconds: row.durationSeconds, calories: row.calories, date: row.date });
  }
  return map;
}

type ProfilePlanDates = { programStart?: string; swimPlanStartedAt?: string | null };

function getProfilePlanDates(): ProfilePlanDates {
  return (db.prepare("SELECT program_start programStart,swim_plan_started_at swimPlanStartedAt FROM profile WHERE id=1").get() as ProfilePlanDates | undefined) ?? {};
}

export function getSwimPlanStartedAt(): string | null {
  return getProfilePlanDates().swimPlanStartedAt ?? null;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && localIso(parsed) === value;
}

export type StartSwimPlanResult =
  | { ok: true; startedAt: string }
  | { ok: false; error: string; status: 400 | 404 | 409; startedAt?: string };

export function swimWeekIndexForDate(startedAt: string, dateIso: string, totalWeeks: number): number {
  const elapsedDays = Math.floor((Date.parse(`${dateIso}T00:00:00Z`) - Date.parse(`${startedAt}T00:00:00Z`)) / 86_400_000);
  if (elapsedDays < 0) return 1;
  return Math.min(Math.max(1, totalWeeks), Math.floor(elapsedDays / 7) + 1);
}

export function effectiveSwimWeekIndex(programStart: string, activatedAt: string, dateIso: string, totalWeeks: number): number {
  const generalWeek = programWeekForDate(programStart, dateIso);
  // activatedAt is an activation boundary, not an independent Week 1 anchor.
  // Before the boundary the UI previews the effective week; after it the same
  // general VOLT week continues, never restarting Foundation from Week 1.
  const effectiveWeek = Math.max(PLAN_V2_EFFECTIVE_WEEK, generalWeek);
  void activatedAt;
  return Math.min(Math.max(1, totalWeeks), effectiveWeek);
}

// Единственная операция записи старта Swim. Условный UPDATE делает её
// атомарной и одноразовой даже при двух одновременных запросах.
export function startSwimPlan(startedAt: string): StartSwimPlanResult {
  if (!isValidIsoDate(startedAt)) return { ok: false, error: "Некорректная дата старта", status: 400 };
  const changed = db.prepare("UPDATE profile SET swim_plan_started_at=? WHERE id=1 AND swim_plan_started_at IS NULL").run(startedAt).changes;
  if (changed === 1) return { ok: true, startedAt };
  const existing = getSwimPlanStartedAt();
  if (existing) return { ok: false, error: "План плавания уже начат", status: 409, startedAt: existing };
  return { ok: false, error: "Профиль не найден", status: 404 };
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Единственное место, где VOLT Swim подключается к общему расписанию VOLT
// (app/week-schedule-model.ts + week_schedule_changes текущей недели) —
// вместо собственной нумерации дней программы. Дописывает calendar на каждую
// тренировку и calendarDays на весь горизонт программы (8 недель от
// отдельного старта Swim), не трогая расчёт статусов/прогресса.
function attachCalendar(progress: SwimProgramProgress): SwimProgramProgress {
  const { programStart, swimPlanStartedAt } = getProfilePlanDates();
  if (!programStart || !swimPlanStartedAt) return { ...progress, startedAt: swimPlanStartedAt ?? null };
  const todayIso = localIso(new Date());
  const scheduleStartIso = programWeekMonday(programStart, 1);
  const scheduleEndDate = new Date(`${scheduleStartIso}T00:00:00`);
  scheduleEndDate.setDate(scheduleEndDate.getDate() + progress.program.weeks.length * 7 - 1);
  const scheduleEndIso = localIso(scheduleEndDate);
  const changes = listWeekScheduleChanges(scheduleStartIso, scheduleEndIso);
  const changesByDate = changesByDateMap(changes);
  const resolveWeekForDate = (dateIso: string) => buildProgramWeek(programWeekForDate(programStart, dateIso));

  const scheduleInputs: SwimScheduleWorkoutInput[] = progress.workouts.map((w) => ({
    workoutId: w.workout.id,
    status: w.status,
    pinnedDate: w.actual?.date ?? w.draftDate ?? null,
  }));
  const calendarByWorkoutId = assignSwimCalendar({ workouts: scheduleInputs, changesByDate, todayIso, scheduleStartIso, resolveWeekForDate, horizonDays: progress.program.weeks.length * 7 });

  const workouts = progress.workouts.map((w) => ({ ...w, calendar: calendarByWorkoutId.get(w.workout.id) ?? null }));
  const openWorkout = workouts.find((w) => w.status === "in_progress" || w.status === "awaiting_confirmation") ?? null;
  const nextScheduled = workouts
    .filter((w) => w.status === "not_started" && w.calendar?.date && w.calendar.date >= todayIso)
    .sort((a, b) => a.calendar!.date.localeCompare(b.calendar!.date))[0] ?? null;
  const nextWorkout = openWorkout ?? nextScheduled ?? workouts.find((w) => w.status === "not_started") ?? null;

  const totalDays = progress.program.weeks.length * 7;
  const calendarDays: SwimCalendarDay[] = Array.from({ length: totalDays }, (_, index) => {
    const date = addDaysIso(scheduleStartIso, index);
    const homeWeek = resolveWeekForDate(date);
    const resolved = resolvePlanForDate(date, homeWeek, changesByDate);
    return {
      date,
      weekday: resolved.weekday,
      isToday: date === todayIso,
      isSwimSlot: isSwimSlot(resolved.scheduled),
      activityType: resolved.scheduled.type,
      activityTitle: resolved.scheduled.title,
      scheduleChangeId: resolved.changeId,
    };
  });

  // swim_plan_started_at остаётся activation/transition key. Plan v2 starts
  // with Foundation Week 4; Weeks 1–3 remain immutable historical definitions.
  const currentWeekIndex = effectiveSwimWeekIndex(programStart, swimPlanStartedAt, todayIso, progress.program.weeks.length);
  return { ...progress, startedAt: swimPlanStartedAt, workouts, nextWorkout, currentWeekIndex, calendarDays };
}

export function getProgramProgress(programId: string): SwimProgramProgress | null {
  const program = getProgram(programId);
  if (!program || program.status !== "available") return null;
  const progress = computeProgramProgress(program, completedPlanKeys(), openDraftsByPlanKey(), completedActualsByPlanKey());
  return attachCalendar(progress);
}

export function listProgramsWithProgress(): SwimProgramProgress[] {
  const completed = completedPlanKeys();
  const open = openDraftsByPlanKey();
  const actuals = completedActualsByPlanKey();
  return listPrograms().map((program) =>
    program.status === "available"
      ? attachCalendar(computeProgramProgress(program, completed, open, actuals))
      : { program, startedAt: getSwimPlanStartedAt(), completedCount: 0, totalCount: 0, currentWeekIndex: null, nextWorkout: null, workouts: [], calendarDays: [] },
  );
}

// Источник ближайшей тренировки для главной /swim: первая незавершённая
// тренировка доступной программы либо null для честного empty state.
export function getNextSwimWorkout(): SwimWorkoutProgress | null {
  const program = listPrograms().find((p) => p.status === "available");
  if (!program) return null;
  return getProgramProgress(program.id)?.nextWorkout ?? null;
}

// Единственный общий resolver "какая тренировка Swim назначена этой
// календарной дате" — используется и глобальной Главной VOLT, и /swim,
// и /swim/workouts. Не пересчитывает расписание заново: полностью опирается
// на attachCalendar() (тот же resolvePlanForDate/isSwimSlot, что и основной
// план VOLT) и на уже вычисленный progress.workouts[].calendar.
export function resolveScheduledSwimWorkout(calendarDate: string): ResolvedSwimSlot | null {
  const { programStart, swimPlanStartedAt } = getProfilePlanDates();
  if (!programStart) return null;
  const homeWeek = buildProgramWeek(programWeekForDate(programStart, calendarDate));
  const todayIso = localIso(new Date());
  const { mondayIso, sundayIso } = weekRangeContaining(calendarDate);
  const changes = listWeekScheduleChanges(mondayIso, sundayIso);
  const changesByDate = changesByDateMap(changes);
  const resolved = resolvePlanForDate(calendarDate, homeWeek, changesByDate);
  if (!isSwimSlot(resolved.scheduled)) return null;

  const isToday = calendarDate === todayIso;
  const base = { calendarDate, weekday: resolved.weekday, isToday, scheduleChangeId: resolved.changeId };

  const swimRef = sessionsForDay(resolved.scheduled).map((session) => session.workoutRef).find((ref) => ref?.kind === "swim") ?? null;
  const program = swimRef?.kind === "swim" ? getProgram(swimRef.programId) : null;
  const progress = program && swimPlanStartedAt ? getProgramProgress(program.id) : null;
  const match = swimRef?.kind === "swim" && swimRef.workoutId
    ? progress?.workouts.find((w) => w.workout.id === swimRef.workoutId && w.calendar?.date === calendarDate) ?? null
    : null;
  if (!program || !progress || !match || !match.calendar) return { kind: "unresolved", ...base };

  return {
    kind: "workout",
    ...base,
    programId: program.id,
    workoutId: match.workout.id,
    workout: match.workout,
    status: match.status,
    draftId: match.draftId,
    origin: match.calendar.origin,
    route: `/swim/workouts/${program.id}/${match.workout.id}`,
  };
}
