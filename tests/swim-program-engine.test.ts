import assert from "node:assert/strict";
import test from "node:test";
import { computeProgramProgress, getProgram, listPrograms } from "../lib/swim/program-engine.ts";
import { swimWorkoutPlanKey } from "../lib/swim/workout-plan-key.ts";

test("listPrograms содержит ровно одну доступную программу и остальные — coming_soon", () => {
  const programs = listPrograms();
  const available = programs.filter((p) => p.status === "available");
  assert.equal(available.length, 1);
  assert.equal(available[0].id, "foundation");
  assert.ok(programs.some((p) => p.status === "coming_soon"));
});

test("computeProgramProgress: без завершённых тренировок все not_started, nextWorkout — первая по порядку", () => {
  const foundation = getProgram("foundation")!;
  const progress = computeProgramProgress(foundation, new Set(), new Map());
  assert.equal(progress.completedCount, 0);
  assert.ok(progress.totalCount > 0);
  assert.ok(progress.workouts.every((w) => w.status === "not_started"));
  assert.equal(progress.nextWorkout?.workout.id, progress.workouts[0].workout.id);
});

test("computeProgramProgress: завершённая тренировка помечается completed и не предлагается как следующая", () => {
  const foundation = getProgram("foundation")!;
  const firstWorkout = foundation.weeks[0].days.find((d) => d.workout)!.workout!;
  const key = swimWorkoutPlanKey(foundation, firstWorkout)!;
  const progress = computeProgramProgress(foundation, new Set([key]), new Map());
  assert.equal(progress.completedCount, 1);
  const first = progress.workouts.find((w) => w.workout.id === firstWorkout.id);
  assert.equal(first?.status, "completed");
  assert.notEqual(progress.nextWorkout?.workout.id, firstWorkout.id);
});

test("computeProgramProgress: открытый черновик даёт in_progress/awaiting_confirmation вместо not_started", () => {
  const foundation = getProgram("foundation")!;
  const firstWorkout = foundation.weeks[0].days.find((d) => d.workout)!.workout!;
  const key = swimWorkoutPlanKey(foundation, firstWorkout)!;
  const openDrafts = new Map([[key, { id: 42, status: "active" as const }]]);
  const progress = computeProgramProgress(foundation, new Set(), openDrafts);
  const first = progress.workouts.find((w) => w.workout.id === firstWorkout.id);
  assert.equal(first?.status, "in_progress");
  assert.equal(first?.draftId, 42);
  assert.equal(progress.nextWorkout?.workout.id, firstWorkout.id);
});

test("computeProgramProgress: все тренировки завершены — nextWorkout null", () => {
  const foundation = getProgram("foundation")!;
  const allWorkouts = foundation.weeks.flatMap((w) => w.days.filter((d) => d.workout).map((d) => d.workout!));
  const keys = new Set(allWorkouts.map((w) => swimWorkoutPlanKey(foundation, w)!));
  const progress = computeProgramProgress(foundation, keys, new Map());
  assert.equal(progress.completedCount, progress.totalCount);
  assert.equal(progress.nextWorkout, null);
});
