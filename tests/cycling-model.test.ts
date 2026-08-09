import assert from "node:assert/strict";
import test from "node:test";
import { buildProgramWeek } from "@/app/personal-data.ts";
import { cyclingHomeSummary, cyclingSnapshotFor, resolveCyclingAssignment } from "@/app/cycling-model.ts";
import { isCyclingSlot } from "@/lib/cycling.ts";

const TODAY = "2026-08-05";
const PROGRAM_START = "2026-07-13";

test("единый Cycling classifier распознаёт канонический slot и утверждённые названия", () => {
  for (const candidate of [
    { id: "bike-zone-2" },
    { title: "Bike" },
    { title: "Indoor Cycling" },
    { type: "Cycling" },
    { title: "Спокойная тренировка на велосипеде" },
  ]) assert.equal(isCyclingSlot(candidate), true);
  assert.equal(isCyclingSlot({ title: "Strength B", type: "Силовая" }), false);
});

test("resolver находит optional bike-zone-2 в исходном расписании текущей недели", () => {
  const result = resolveCyclingAssignment({ programStart: PROGRAM_START, today: TODAY, selectedDate: "2026-08-04" });
  assert.ok(result);
  assert.equal(result.date, "2026-08-04");
  assert.equal(result.session.id, "bike-zone-2");
  assert.equal(result.optional, true);
  assert.equal(result.changed, false);
  assert.equal(result.status, "planned");
});

test("resolver использует перенесённый общий Plan, а не собственный календарь", () => {
  const changes = [
    { id: 7, date: "2026-08-04", action: "rest", assignedSourceDay: null, swapWithDate: null, reasonCode: "schedule", createdAt: "", updatedAt: "" },
    { id: 8, date: "2026-08-06", action: "replace", assignedSourceDay: 2, swapWithDate: null, reasonCode: "schedule", createdAt: "", updatedAt: "" },
  ] as const;
  const result = resolveCyclingAssignment({ programStart: PROGRAM_START, today: TODAY, selectedDate: "2026-08-06", weekScheduleChanges: [...changes] });
  assert.ok(result);
  assert.equal(result.date, "2026-08-06");
  assert.equal(result.session.id, "bike-zone-2");
  assert.equal(result.origin, "scheduled");
  assert.equal(result.scheduleChangeId, 8);
});

test("resolver открывает выбранный будущий Bike-slot через canonical program week", () => {
  const result = resolveCyclingAssignment({ programStart: PROGRAM_START, today: TODAY, selectedDate: "2026-08-11" });
  assert.ok(result);
  assert.equal(result.date, "2026-08-11");
  assert.equal(result.programWeek, 5);
  assert.deepEqual(result.session.programIdentity, {
    programId: "volt-training",
    programVersion: 2,
    weekIndex: 5,
    sessionId: "bike-zone-2",
  });
  assert.deepEqual(cyclingSnapshotFor(result).programIdentity, result.session.programIdentity);
});

test("resolver различает active, awaiting_confirmation и completed", () => {
  const active = resolveCyclingAssignment({ programStart: PROGRAM_START, today: TODAY, selectedDate: "2026-08-04", workoutDrafts: [{ id: 1, date: "2026-08-04", status: "active", snapshot: { title: "Bike / Indoor Cycling" } }] });
  assert.equal(active?.status, "active");
  const awaiting = resolveCyclingAssignment({ programStart: PROGRAM_START, today: TODAY, selectedDate: "2026-08-04", workoutDrafts: [{ id: 2, date: "2026-08-04", status: "awaiting_confirmation", snapshot: { type: "Cycling" } }] });
  assert.equal(awaiting?.status, "awaiting_confirmation");
  const completed = resolveCyclingAssignment({ programStart: PROGRAM_START, today: TODAY, selectedDate: "2026-08-04", workouts: [{ id: 3, date: "2026-08-04", title: "Indoor Cycling" }] });
  assert.equal(completed?.status, "completed");
});

test("weekly summary не превращает отсутствующие метрики в нули", () => {
  const summary = cyclingHomeSummary([
    { id: 1, date: "2026-08-04", title: "Bike", durationSeconds: 1800, avgHeartRate: 120, distanceMeters: 10_000, loadFeedback: "calm" },
    { id: 2, date: "2026-08-05", title: "Cycling", durationSeconds: 900, avgHeartRate: 0, distanceMeters: 0, avgSpeed: 24 },
    { id: 3, date: "2026-08-05", title: "Strength A", durationSeconds: 5000, avgHeartRate: 180, avgSpeed: 99 },
  ], "2026-08-03", "2026-08-09");
  assert.equal(summary.rides, 2);
  assert.equal(summary.durationSeconds, 2700);
  assert.equal(summary.averageHeartRate, 120);
  assert.equal(summary.averageSpeed, 22);
  assert.equal(summary.latestLoadFeedback, "calm");
  const empty = cyclingHomeSummary([{ id: 4, date: "2026-08-04", title: "Bike", durationSeconds: 0 }], "2026-08-03", "2026-08-09");
  assert.equal(empty.averageHeartRate, null);
  assert.equal(empty.averageSpeed, null);
});

test("Plan v2 сохраняет единственный optional Cycling slot", () => {
  const cycling = buildProgramWeek(4).flatMap((day) => day.sessions ?? [day]).filter(isCyclingSlot);
  assert.equal(cycling.length, 1);
  assert.equal(cycling[0].optional, true);
});
