import assert from "node:assert/strict";
import test from "node:test";
import { computeProgramProgress, getProgram, listPrograms } from "../lib/swim/program-engine.ts";
import { swimWorkoutPlanKey } from "../lib/swim/workout-plan-key.ts";
import { totalDistanceMeters } from "../lib/swim/workout-engine.ts";

test("listPrograms содержит ровно одну доступную программу и остальные — coming_soon", () => {
  const programs = listPrograms();
  const available = programs.filter((p) => p.status === "available");
  assert.equal(available.length, 1);
  assert.equal(available[0].id, "foundation");
  assert.ok(programs.some((p) => p.status === "coming_soon"));
});

test("Foundation содержит 8 недель, недели 1–3 неизменны, с Week 4 — по 3 тренировки", () => {
  const foundation = getProgram("foundation")!;
  assert.equal(foundation.weeks.length, 8);
  assert.equal(foundation.weeks.flatMap((week) => week.days.filter((day) => day.workout)).length, 21);
  assert.deepEqual(foundation.weeks.map((week) => week.plannedDistanceMeters), [2000, 2200, 2500, 2400, 2950, 3150, 3300, 2950]);
  assert.deepEqual(foundation.weeks.map(week=>week.days.filter(day=>day.workout).map(day=>day.dayIndex)),[[1,3],[1,3],[1,3],[1,3,5],[1,3,5],[1,3,5],[1,3,5],[1,3,5]]);
  for (const week of foundation.weeks) {
    const actual = week.days.reduce((sum, day) => sum + (day.workout ? totalDistanceMeters(day.workout) : 0), 0);
    assert.equal(actual, week.plannedDistanceMeters, `объём недели ${week.weekIndex}`);
  }
});

test("Foundation Weeks 4–8 соблюдают 25 м pool / freestyle+backstroke / без SWOLF targets", () => {
 const foundation=getProgram("foundation")!;
 const transition=foundation.weeks.filter(week=>week.weekIndex>=4);
 for(const interval of transition.flatMap(week=>week.days.flatMap(day=>day.workout?.intervals??[]))){
  assert.equal(interval.distanceMeters%25,0);
  assert.ok(["freestyle","backstroke","easy-swim","catch-up","fingertip-drag"].includes(interval.exerciseId),interval.exerciseId);
  assert.equal(interval.targetPaceSecondsPer100,null);
  assert.doesNotMatch(interval.description,/SWOLF|брасс|баттерфляй|спринт/i);
 }
 const friday8=foundation.weeks[7].days.find(day=>day.dayIndex===5)?.workout;
 assert.ok(friday8);
 assert.equal(friday8.intervals.find(interval=>interval.type==="main_set")?.distanceMeters,1000);
 assert.match(friday8.goal,/не гонка|не тест максимальной скорости/i);
});

test("Foundation Weeks 1–3 сохраняют существующие version 2 plan keys", () => {
 const foundation=getProgram("foundation")!;
 assert.equal(foundation.version,2);
 const keys=Object.fromEntries(foundation.weeks.slice(0,3).flatMap(week=>week.days.flatMap(day=>day.workout?[[day.workout.id,swimWorkoutPlanKey(foundation,day.workout)!]]:[])));
 assert.deepEqual(keys,{
  w1d1:"8c34cd97683ca9c5207239f39aee1e93",w1d3:"502af42420524798dbb897f2def752b8",
  w2d1:"dce8809e08abe3e256eb2852543b5d09",w2d3:"2d8065c64ce573856584f3cf2696e57c",
  w3d1:"10b0282f18d9d6314649c394a5144ac6",w3d3:"23dc5d45eb18b9a29132fd58dd4d4daa",
 });
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
  const openDrafts = new Map([[key, { id: 42, status: "active" as const, date: "2026-07-21" }]]);
  const progress = computeProgramProgress(foundation, new Set(), openDrafts);
  const first = progress.workouts.find((w) => w.workout.id === firstWorkout.id);
  assert.equal(first?.status, "in_progress");
  assert.equal(first?.draftId, 42);
  assert.equal(first?.draftDate, "2026-07-21");
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
