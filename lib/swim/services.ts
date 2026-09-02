// Единственное место в lib/swim/, которое обращается к БД. program-engine.ts и
// workout-engine.ts остаются чистыми функциями — здесь они соединяются с
// реальными workout_drafts.
import { db } from "@/lib/db";
import { buildHomeWeek, buildProgramDayForDate } from "@/app/personal-data";
import { changesByDateMap, localIso, resolvePlanForDate, sessionsForDay, weekRangeContaining } from "@/app/week-schedule-model";
import { listWeekScheduleChanges } from "@/lib/week-schedule-service";
import { computeProgramProgress, getProgram, listPrograms } from "@/lib/swim/program-engine";
import { assignSwimCalendar, isSwimSlot, type SwimScheduleWorkoutInput } from "@/lib/swim/schedule-sync";
import { activatedPlanPosition, programWeekForDate, programWeekMonday } from "@/lib/training-program/registry";
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

type ProfilePlanDates = { programStart?: string; swimPlanStartedAt?: string | null; trainingPlanV3StartedAt?: string | null; trainingPlanV3CycleId?:number|null; trainingPlanV3RestartedFromCycleId?:number|null };

function getProfilePlanDates(): ProfilePlanDates {
  return (db.prepare(`SELECT program_start programStart,swim_plan_started_at swimPlanStartedAt,training_plan_v3_started_at trainingPlanV3StartedAt,
   (SELECT id FROM training_plan_cycles WHERE program_id='volt-training' AND program_version=3 AND ended_at IS NULL ORDER BY id DESC LIMIT 1) trainingPlanV3CycleId,
   (SELECT restarted_from_cycle_id FROM training_plan_cycles WHERE program_id='volt-training' AND program_version=3 AND ended_at IS NULL ORDER BY id DESC LIMIT 1) trainingPlanV3RestartedFromCycleId
   FROM profile WHERE id=1`).get() as ProfilePlanDates | undefined) ?? {};
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
  const effectiveWeek = Math.max(4, generalWeek);
  void activatedAt;
  return Math.min(Math.max(1, totalWeeks), effectiveWeek);
}

export function effectiveSwimProgramWeekIndex(programStart: string, dateIso: string, weekIndexes: readonly number[]): number | null {
  if (!weekIndexes.length) return null;
  const firstWeek = Math.min(...weekIndexes);
  const lastWeek = Math.max(...weekIndexes);
  return Math.min(lastWeek, Math.max(firstWeek, programWeekForDate(programStart, dateIso)));
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
// диапазона недель конкретной Swim-программы), не трогая расчёт статусов/прогресса.
function attachCalendar(progress: SwimProgramProgress): SwimProgramProgress {
  const { programStart, swimPlanStartedAt, trainingPlanV3StartedAt,trainingPlanV3CycleId } = getProfilePlanDates();
  const activationAt = progress.program.id === "endurance" ? trainingPlanV3StartedAt : swimPlanStartedAt;
  if (!programStart || !activationAt) return { ...progress, startedAt: activationAt ?? null };
  const todayIso = localIso(new Date());
  const weekIndexes = progress.program.weeks.map((week) => week.weekIndex);
  if (!weekIndexes.length) return { ...progress, startedAt: activationAt };
  const firstWeek = Math.min(...weekIndexes);
  const lastWeek = Math.max(...weekIndexes);
  const scheduleStartIso = progress.program.id === "endurance" ? activationAt : programWeekMonday(programStart, firstWeek);
  const scheduleEndIso = progress.program.id === "endurance"
    ? addDaysIso(programWeekMonday(activationAt,lastWeek-firstWeek+1),6)
    : addDaysIso(scheduleStartIso,(lastWeek-firstWeek+1)*7-1);
  const totalDays=Math.floor((Date.parse(`${scheduleEndIso}T00:00:00Z`)-Date.parse(`${scheduleStartIso}T00:00:00Z`))/86_400_000)+1;
  const changes = listWeekScheduleChanges(scheduleStartIso, scheduleEndIso);
  const changesByDate = changesByDateMap(changes);
  const resolveWeekForDate = (dateIso: string) => buildHomeWeek(programStart,trainingPlanV3StartedAt,dateIso,trainingPlanV3CycleId);

  const scheduleInputs: SwimScheduleWorkoutInput[] = progress.workouts.map((w) => ({
    workoutId: w.workout.id,
    status: w.status,
    pinnedDate: w.actual?.date ?? w.draftDate ?? null,
  }));
  const calendarByWorkoutId = assignSwimCalendar({ workouts: scheduleInputs, changesByDate, todayIso, scheduleStartIso, resolveWeekForDate, horizonDays: totalDays });

  const workouts = progress.workouts.map((w) => ({ ...w, calendar: calendarByWorkoutId.get(w.workout.id) ?? null }));
  const openWorkout = workouts.find((w) => w.status === "in_progress" || w.status === "awaiting_confirmation") ?? null;
  const nextScheduled = workouts
    .filter((w) => w.status === "not_started" && w.calendar?.date && w.calendar.date >= todayIso)
    .sort((a, b) => a.calendar!.date.localeCompare(b.calendar!.date))[0] ?? null;
  const nextWorkout = openWorkout ?? nextScheduled ?? workouts.find((w) => w.status === "not_started") ?? null;

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

  // swim_plan_started_at остаётся activation key. Индекс берётся из общего
  // VOLT week и ограничивается реальным диапазоном выбранной Swim-программы.
  // Foundation сохраняет введённую Plan v2 границу Week 4: его Weeks 1–3 —
  // исторические определения, а не повод визуально откатывать активный план.
  // Следующие программы используют собственный реальный диапазон недель.
  const currentWeekIndex = progress.program.id === "foundation"
    ? effectiveSwimWeekIndex(programStart, activationAt, todayIso, lastWeek)
    : Math.min(lastWeek,Math.max(firstWeek,activatedPlanPosition(trainingPlanV3StartedAt,todayIso)?.definitionWeekIndex ?? firstWeek));
  return { ...progress, startedAt: activationAt, workouts, nextWorkout, currentWeekIndex, calendarDays };
}

export function getProgramProgress(programId: string): SwimProgramProgress | null {
  const program = getProgram(programId);
  if (!program || program.status !== "available") return null;
  const profile=getProfilePlanDates();
  const cycleId=program.id==="endurance"?(profile.trainingPlanV3CycleId??null):null;
  const includeUnscoped=program.id!=="endurance"||!profile.trainingPlanV3RestartedFromCycleId;
  const progress = computeProgramProgress(program, completedPlanKeys(), openDraftsByPlanKey(), completedActualsByPlanKey(),cycleId,includeUnscoped);
  return attachCalendar(progress);
}

export function listProgramsWithProgress(): SwimProgramProgress[] {
  const completed = completedPlanKeys();
  const open = openDraftsByPlanKey();
  const actuals = completedActualsByPlanKey();
  const profile=getProfilePlanDates();
  return listPrograms().map((program) =>
    program.status === "available"
      ? attachCalendar(computeProgramProgress(program, completed, open, actuals,program.id==="endurance"?(profile.trainingPlanV3CycleId??null):null,program.id!=="endurance"||!profile.trainingPlanV3RestartedFromCycleId))
      : { program, startedAt: getSwimPlanStartedAt(),planCycleId:null, completedCount: 0, totalCount: 0, currentWeekIndex: null, nextWorkout: null, workouts: [], calendarDays: [] },
  );
}

// Источник для SwimHero (главная страница /swim) — ближайшая незавершённая
// тренировка единственной доступной программы, либо null для честного empty
// state. Программ несколько станет в Sprint 3+ — тогда здесь появится выбор
// "активной" программы пользователя, а не первой доступной.
export function getActiveSwimProgramProgress():SwimProgramProgress|null{
  const { programStart,trainingPlanV3StartedAt,trainingPlanV3CycleId } = getProfilePlanDates();
  if (!programStart) return null;
  const todayIso = localIso(new Date());
  const todayPlan = buildProgramDayForDate(programStart,trainingPlanV3StartedAt,todayIso,trainingPlanV3CycleId);
  const activeProgramId = activatedPlanPosition(trainingPlanV3StartedAt,todayIso)
    ? "endurance"
    : sessionsForDay(todayPlan).map((session) => session.workoutRef).find((ref) => ref?.kind === "swim")?.programId;
  const program = activeProgramId ? getProgram(activeProgramId) : listPrograms().find((candidate) => candidate.status === "available");
  return program?.status === "available" ? getProgramProgress(program.id) : null;
}

export function getNextSwimWorkout(): SwimWorkoutProgress | null {
  return getActiveSwimProgramProgress()?.nextWorkout??null;
}

// Единственный общий resolver "какая тренировка Swim назначена этой
// календарной дате" — используется и глобальной Главной VOLT, и /swim,
// и /swim/workouts. Не пересчитывает расписание заново: полностью опирается
// на attachCalendar() (тот же resolvePlanForDate/isSwimSlot, что и основной
// план VOLT) и на уже вычисленный progress.workouts[].calendar.
export function resolveScheduledSwimWorkout(calendarDate: string): ResolvedSwimSlot | null {
  const { programStart, swimPlanStartedAt,trainingPlanV3StartedAt,trainingPlanV3CycleId } = getProfilePlanDates();
  if (!programStart) return null;
  const homeWeek = buildHomeWeek(programStart,trainingPlanV3StartedAt,calendarDate,trainingPlanV3CycleId);
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
  const activationAt=program?.id==="endurance"?trainingPlanV3StartedAt:swimPlanStartedAt;
  const progress = program && activationAt ? getProgramProgress(program.id) : null;
  // Источник истины по дате — календарь программы: assignSwimCalendar учитывает
  // выполненные тренировки, закреплённые даты и изменения недели, поэтому
  // фактическое назначение уезжает от статичного workoutId в определении плана
  // VOLT. Сначала берём то, что программа назначила на эту дату, и лишь среди
  // назначенного предпочитаем тренировку, названную в слоте плана.
  const scheduledForDate = progress?.workouts.filter((w) => w.calendar?.date === calendarDate) ?? [];
  const preferred = swimRef?.kind === "swim" && swimRef.workoutId
    ? scheduledForDate.find((w) => w.workout.id === swimRef.workoutId) ?? null
    : null;
  // План VOLT говорит «сегодня бассейн», а программа на этот день ничего не
  // назначила — так бывает, когда выполненные тренировки сдвинули её календарь.
  // Дать пустую карточку с неработающей кнопкой хуже, чем предложить ближайшую
  // невыполненную тренировку и честно пометить это переносом.
  // Тренировка, названная в слоте плана, может стоять в календаре программы на
  // другой день. Если она ещё не выполнена — это дублирование дня (например,
  // среда продублирована на субботу), и подставлять замену нельзя: иначе одна
  // сессия покажется в неделе дважды. Замена уместна только когда названная
  // тренировка уже позади и день остался бы пустым.
  const referenced = swimRef?.kind === "swim" && swimRef.workoutId
    ? progress?.workouts.find((w) => w.workout.id === swimRef.workoutId) ?? null
    : null;
  const referencedStillAhead = !!referenced && referenced.status !== "completed" && !!referenced.calendar;
  // Берём штатный nextWorkout программы, а не первую невыполненную: в истории
  // остаются пропущенные тренировки многонедельной давности, и предлагать
  // сегодня августовскую сессию бессмысленно.
  const fallback = scheduledForDate.length === 0 && !referencedStillAhead
    ? progress?.nextWorkout ?? null
    : null;
  const match = preferred ?? scheduledForDate[0] ?? fallback;
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
    scheduledFor: match.calendar.date === calendarDate ? null : match.calendar.date,
    route: `/swim/workouts/${program.id}/${match.workout.id}`,
  };
}
