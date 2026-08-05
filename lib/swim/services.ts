// Единственное место в lib/swim/, которое обращается к БД. program-engine.ts и
// workout-engine.ts остаются чистыми функциями — здесь они соединяются с
// реальными workout_drafts.
import { db } from "@/lib/db";
import { buildHomeWeek } from "@/app/personal-data";
import { changesByDateMap, localIso, resolvePlanForDate, weekRangeContaining } from "@/app/week-schedule-model";
import { listWeekScheduleChanges } from "@/lib/week-schedule-service";
import { computeProgramProgress, getProgram, listPrograms } from "@/lib/swim/program-engine";
import { assignSwimCalendar, isSwimSlot, type SwimScheduleWorkoutInput } from "@/lib/swim/schedule-sync";
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

function getProfileProgramStart(): string | undefined {
  const row = db.prepare("SELECT program_start programStart FROM profile WHERE id=1").get() as { programStart?: string } | undefined;
  return row?.programStart;
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Единственное место, где VOLT Swim подключается к общему расписанию VOLT
// (app/week-schedule-model.ts + week_schedule_changes текущей недели) —
// вместо собственной нумерации дней программы. Дописывает calendar на каждую
// тренировку и calendarDays на весь горизонт программы (6 недель от
// понедельника недели старта профиля), не трогая расчёт статусов/прогресса.
function attachCalendar(progress: SwimProgramProgress): SwimProgramProgress {
  const programStart = getProfileProgramStart();
  if (!programStart) return progress;
  const todayIso = localIso(new Date());
  const homeWeek = buildHomeWeek(programStart);
  const { mondayIso: currentMonday, sundayIso: currentSunday } = weekRangeContaining(todayIso);
  const changes = listWeekScheduleChanges(currentMonday, currentSunday);
  const changesByDate = changesByDateMap(changes);

  const scheduleInputs: SwimScheduleWorkoutInput[] = progress.workouts.map((w) => ({
    workoutId: w.workout.id,
    status: w.status,
    pinnedDate: w.actual?.date ?? w.draftDate ?? null,
  }));
  const calendarByWorkoutId = assignSwimCalendar({ workouts: scheduleInputs, homeWeek, changesByDate, todayIso });

  const workouts = progress.workouts.map((w) => ({ ...w, calendar: calendarByWorkoutId.get(w.workout.id) ?? null }));
  const nextWorkout = progress.nextWorkout ? workouts.find((w) => w.workout.id === progress.nextWorkout!.workout.id) ?? null : null;

  const programMonday = weekRangeContaining(programStart).mondayIso;
  const totalDays = progress.program.weeks.length * 7;
  const calendarDays: SwimCalendarDay[] = Array.from({ length: totalDays }, (_, index) => {
    const date = addDaysIso(programMonday, index);
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

  return { ...progress, workouts, nextWorkout, calendarDays };
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
      : { program, completedCount: 0, totalCount: 0, currentWeekIndex: null, nextWorkout: null, workouts: [], calendarDays: [] },
  );
}

// Источник для SwimHero (главная страница /swim) — ближайшая незавершённая
// тренировка единственной доступной программы, либо null для честного empty
// state. Программ несколько станет в Sprint 3+ — тогда здесь появится выбор
// "активной" программы пользователя, а не первой доступной.
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
  const programStart = getProfileProgramStart();
  if (!programStart) return null;
  const homeWeek = buildHomeWeek(programStart);
  const todayIso = localIso(new Date());
  const { mondayIso: currentMonday, sundayIso: currentSunday } = weekRangeContaining(todayIso);
  const changes = listWeekScheduleChanges(currentMonday, currentSunday);
  const changesByDate = changesByDateMap(changes);
  const resolved = resolvePlanForDate(calendarDate, homeWeek, changesByDate);
  if (!isSwimSlot(resolved.scheduled)) return null;

  const isToday = calendarDate === todayIso;
  const base = { calendarDate, weekday: resolved.weekday, isToday, scheduleChangeId: resolved.changeId };

  const program = listPrograms().find((p) => p.status === "available");
  const progress = program ? getProgramProgress(program.id) : null;
  const match = progress?.workouts.find((w) => w.calendar?.date === calendarDate) ?? null;
  if (!program || !progress || !match || !match.calendar) return { kind: "unresolved", ...base };

  return {
    kind: "workout",
    ...base,
    programId: program.id,
    workoutId: match.workout.id,
    status: match.status,
    draftId: match.draftId,
    origin: match.calendar.origin,
    route: `/swim/workouts/${program.id}/${match.workout.id}`,
  };
}
