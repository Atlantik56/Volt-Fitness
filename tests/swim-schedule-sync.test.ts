import assert from "node:assert/strict";
import test from "node:test";
import { buildProgramWeek } from "../app/personal-data.ts";
import { changesByDateMap, type WeekScheduleChange } from "../app/week-schedule-model.ts";
import { assignSwimCalendar, isSwimSlot, type SwimScheduleWorkoutInput } from "../lib/swim/schedule-sync.ts";
import { programWeekForDate, programWeekMonday } from "../lib/training-program/registry.ts";

const PROGRAM_START = "2026-07-21";
const TODAY = "2026-08-09";
const noChanges = () => new Map<string, WeekScheduleChange>();
const pending = (...workoutIds: string[]): SwimScheduleWorkoutInput[] => workoutIds.map((workoutId) => ({ workoutId, status: "not_started", pinnedDate: null }));
const change = (partial: Partial<WeekScheduleChange> & Pick<WeekScheduleChange, "date" | "action">): WeekScheduleChange => ({
  id: 1, assignedSourceDay: null, swapWithDate: null, reasonCode: "", createdAt: "", updatedAt: "", ...partial,
});

function assign(workouts: SwimScheduleWorkoutInput[], changesByDate = noChanges()) {
  return assignSwimCalendar({
    workouts,
    changesByDate,
    todayIso: TODAY,
    scheduleStartIso: programWeekMonday(PROGRAM_START, 1),
    horizonDays: 56,
    resolveWeekForDate: (dateIso) => buildProgramWeek(programWeekForDate(PROGRAM_START, dateIso)),
  });
}

test("isSwimSlot recognises canonical discipline and legacy pool compatibility", () => {
  assert.equal(isSwimSlot(buildProgramWeek(4)[0]), true);
  assert.equal(isSwimSlot({ type: "Кардио", title: "Бассейн" }), true);
  assert.equal(isSwimSlot({ type: "Кардио", title: "Bike / Indoor Cycling" }), false);
});

test("Plan v2 uses explicit Foundation references on Monday/Wednesday/Friday", () => {
  const result = assign(pending("w4d1", "w4d3", "w4d5"));
  assert.deepEqual(
    [result.get("w4d1")?.date, result.get("w4d3")?.date, result.get("w4d5")?.date],
    ["2026-08-10", "2026-08-12", "2026-08-14"],
  );
  assert.deepEqual(
    [result.get("w4d1")?.weekday, result.get("w4d3")?.weekday, result.get("w4d5")?.weekday],
    [1, 3, 5],
  );
});

test("pending Foundation Weeks 1–3 are not re-projected into Plan v2 slots", () => {
  const result = assign(pending("w1d1", "w1d3", "w4d1"));
  assert.equal(result.has("w1d1"), false);
  assert.equal(result.has("w1d3"), false);
  assert.equal(result.get("w4d1")?.date, "2026-08-10");
});

test("week schedule change moves the same referenced Swim session", () => {
  const changes = changesByDateMap([
    change({ id: 10, date: "2026-08-10", action: "swap", assignedSourceDay: 2, swapWithDate: "2026-08-11" }),
    change({ id: 11, date: "2026-08-11", action: "swap", assignedSourceDay: 1, swapWithDate: "2026-08-10" }),
  ]);
  const result = assign(pending("w4d1", "w4d3", "w4d5"), changes);
  assert.equal(result.get("w4d1")?.date, "2026-08-11");
  assert.equal(result.get("w4d1")?.scheduleChangeId, 11);
  assert.equal(result.get("w4d3")?.date, "2026-08-12");
});

test("completed and open legacy workouts keep their recorded dates and keys", () => {
  const result = assign([
    { workoutId: "w1d1", status: "awaiting_confirmation", pinnedDate: "2026-08-05" },
    { workoutId: "w1d3", status: "completed", pinnedDate: "2026-07-30" },
    { workoutId: "w4d1", status: "not_started", pinnedDate: null },
  ]);
  assert.equal(result.get("w1d1")?.date, "2026-08-05");
  assert.equal(result.get("w1d1")?.origin, "active");
  assert.equal(result.get("w1d3")?.date, "2026-07-30");
  assert.equal(result.get("w1d3")?.origin, "completed");
  assert.equal(result.get("w4d1")?.date, "2026-08-10");
});
