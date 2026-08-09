import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Среда Week 4: в текущей неделе остаются редактируемые Ср/Чт/Пт/Сб/Вс.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-05T12:00:00") });
test.after(() => mock.timers.reset());

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-resolve-"));
const { db } = await import("@/lib/db.ts");
const { resolveScheduledSwimWorkout, getProgramProgress } = await import("@/lib/swim/services.ts");
const { getSwimHomeData } = await import("@/lib/swim-data.ts");
const { applyReplace, applyRest, applySwap } = await import("@/lib/week-schedule-service.ts");
const { weekRangeContaining, localIso } = await import("@/app/week-schedule-model.ts");
const { startWorkoutDraft, finishWorkoutDraft, cancelWorkoutDraft, confirmWorkoutDraft } = await import("@/lib/active-workout-service.ts");
const { swimWorkoutPlanKey } = await import("@/lib/swim/workout-plan-key.ts");
const { getProgram } = await import("@/lib/swim/program-engine.ts");
const { buildSwimSnapshot, buildConfirmationExercises, totalDistanceMeters } = await import("@/lib/swim/workout-engine.ts");

// program_start Tuesday 14 July makes 3–9 August canonical Week 4.
db.prepare("UPDATE profile SET program_start=?,swim_plan_started_at=? WHERE id=1").run("2026-07-14", "2026-08-05");

const today = "2026-08-05";
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localIso(d);
}
function dateForWeekday(weekday: number): string {
  const { mondayIso } = weekRangeContaining(today);
  return addDays(mondayIso, weekday - 1);
}

const thisWeekWednesday = dateForWeekday(3);
const thisWeekThursday = dateForWeekday(4);
const thisWeekFriday = dateForWeekday(5);
const thisWeekSaturday = dateForWeekday(6);
const nextWeekWednesday = addDays(thisWeekWednesday, 7);

test("базовый Plan v2 Swim-слот среды открывает Foundation, Thursday Strength — нет", () => {
  assert.equal(resolveScheduledSwimWorkout(thisWeekWednesday)?.kind, "workout");
  assert.equal(resolveScheduledSwimWorkout(thisWeekThursday), null);
});

test("Главная VOLT, общий Plan и VOLT Swim определяют одну тренировку для даты", () => {
  const slot = resolveScheduledSwimWorkout(thisWeekWednesday);
  assert.equal(slot?.kind, "workout");
  const progress = getProgramProgress("foundation")!;
  const match = progress.workouts.find((workout) => workout.calendar?.date === thisWeekWednesday);
  assert.equal(match?.workout.id, (slot as any).workoutId);
  assert.deepEqual((slot as any).workout.intervals, match?.workout.intervals);
  const home = getSwimHomeData();
  assert.equal(home.nextWorkout?.workoutId, progress.nextWorkout?.workout.id);
  assert.equal(home.nextWorkout?.calendarDate, progress.nextWorkout?.calendar?.date ?? null);
});

test("resolver ведёт в существующий workout flow VOLT Swim", () => {
  const slot = resolveScheduledSwimWorkout(thisWeekWednesday);
  assert.equal(slot?.kind, "workout");
  assert.match((slot as any).route, /^\/swim\/workouts\/foundation\/w\d/);
});

test("обмен Thursday Strength B ↔ Friday Swim учитывается единым resolver", () => {
  const result = applySwap({ dateA: thisWeekThursday, dateB: thisWeekFriday, todayIso: today });
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(thisWeekThursday)?.kind, "workout");
  assert.equal(resolveScheduledSwimWorkout(thisWeekFriday), null);
});

test("дублирование Wednesday на Saturday не создаёт вторую identity той же Swim-сессии", () => {
  const result = applyReplace({ date: thisWeekSaturday, assignedSourceDay: 3, todayIso: today });
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(thisWeekSaturday)?.kind, "unresolved");
});

test("замена перенесённого Swim на Strength B удаляет Swim-слот", () => {
  const result = applyReplace({ date: thisWeekThursday, assignedSourceDay: 4, todayIso: today });
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(thisWeekThursday), null);
});

test("отдых вместо Swim не запускает плавание", () => {
  const result = applyRest({ date: thisWeekSaturday, todayIso: today });
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(thisWeekSaturday), null);
});

let activeDraftId: number;
let activeWorkoutId: string;
test("active draft восстанавливается тем же resolver", () => {
  const program = getProgram("foundation")!;
  const before = resolveScheduledSwimWorkout(nextWeekWednesday);
  assert.equal(before?.kind, "workout");
  activeWorkoutId = (before as any).workoutId;
  const workout = program.weeks.flatMap((week) => week.days).find((day) => day.workout?.id === activeWorkoutId)!.workout!;
  const started = startWorkoutDraft({ date: nextWeekWednesday, snapshot: buildSwimSnapshot(program, workout)! });
  assert.equal(started.ok, true);
  activeDraftId = started.draft!.id;
  const after = resolveScheduledSwimWorkout(nextWeekWednesday);
  assert.equal(after?.kind, "workout");
  assert.equal((after as any).status, "in_progress");
  assert.equal((after as any).draftId, activeDraftId);
});

test("повторный запуск того же plan key не создаёт draft-дубль", () => {
  const program = getProgram("foundation")!;
  const workout = program.weeks.flatMap((week) => week.days).find((day) => day.workout?.id === activeWorkoutId)!.workout!;
  const again = startWorkoutDraft({ date: nextWeekWednesday, snapshot: buildSwimSnapshot(program, workout)! });
  assert.equal(again.draft!.id, activeDraftId);
  const count = (db.prepare("SELECT COUNT(*) n FROM workout_drafts WHERE date=? AND plan_key=?").get(nextWeekWednesday, again.draft!.planKey) as any).n;
  assert.equal(count, 1);
});

test("cancel возвращает плановую Swim-тренировку в not_started и разрешает нормальный перезапуск", () => {
  const date = addDays(thisWeekFriday, 7);
  const before = resolveScheduledSwimWorkout(date);
  assert.equal(before?.kind, "workout");
  assert.equal((before as any).status, "not_started");
  const program = getProgram("foundation")!;
  const workoutId = (before as any).workoutId;
  const workout = program.weeks.flatMap((week) => week.days).find((day) => day.workout?.id === workoutId)!.workout!;
  const started = startWorkoutDraft({ date, snapshot: buildSwimSnapshot(program, workout)! });
  assert.equal(started.ok, true);
  const finished = finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  assert.equal(finished.ok, true);
  const cancelled = cancelWorkoutDraft({ id: started.draft!.id, expectedStatus: "awaiting_confirmation" });
  assert.equal(cancelled.ok, true);
  assert.equal((resolveScheduledSwimWorkout(date) as any)?.status, "not_started");
  const restarted = startWorkoutDraft({ date, snapshot: buildSwimSnapshot(program, workout)! });
  assert.equal(restarted.ok, true);
  assert.notEqual(restarted.draft!.id, started.draft!.id);
  assert.equal(cancelWorkoutDraft({ id: restarted.draft!.id, expectedStatus: "active" }).ok, true);
});

test("awaiting_confirmation и completed сохраняют дату/результат", () => {
  const finished = finishWorkoutDraft({ id: activeDraftId, expectedStatus: "active" });
  assert.equal(finished.ok, true);
  assert.equal((resolveScheduledSwimWorkout(nextWeekWednesday) as any)?.status, "awaiting_confirmation");

  const program = getProgram("foundation")!;
  const workout = program.weeks.flatMap((week) => week.days).find((day) => day.workout?.id === activeWorkoutId)!.workout!;
  const confirmed = confirmWorkoutDraft({
    id: activeDraftId, expectedStatus: "awaiting_confirmation", durationSeconds: 1500,
    distanceMeters: totalDistanceMeters(workout), effort: "Нормально", painAfter: 0,
    exercises: buildConfirmationExercises(workout),
  });
  assert.equal(confirmed.ok, true);
  const completed = resolveScheduledSwimWorkout(nextWeekWednesday);
  assert.equal(completed?.kind, "workout");
  assert.equal((completed as any).status, "completed");
  assert.equal((completed as any).origin, "completed");
  assert.equal((completed as any).workoutId, activeWorkoutId);
});

test("после завершения всех 21 тренировок будущий Swim-слот честно unresolved", () => {
  const program = getProgram("foundation")!;
  const all = program.weeks.flatMap((week) => week.days.flatMap((day) => day.workout ? [day.workout] : []));
  for (let i = 0; i < all.length; i++) {
    const key = swimWorkoutPlanKey(program, all[i])!;
    const date = `2019-01-${String(i + 1).padStart(2, "0")}`;
    const logId = db.prepare("INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds,calories) VALUES (?,?,?,?,?,?)").run(date, "Плавание", all[i].title, 1000, 1200, 300).lastInsertRowid;
    db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot,workout_id) VALUES (?,?,'completed','{}',?)").run(date, key, logId);
  }
  const slot = resolveScheduledSwimWorkout(addDays(nextWeekWednesday, 70));
  assert.equal(slot?.kind, "unresolved");
});
