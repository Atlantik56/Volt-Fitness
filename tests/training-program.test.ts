import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildProgramWeek } from "../app/personal-data.ts";
import { sessionsForDay } from "../app/week-schedule-model.ts";
import { planKey } from "../lib/plan-key.ts";
import { VOLT_PROGRAM_ID } from "../lib/training-program/definitions.ts";
import { TrainingProgramRegistry, trainingProgramRegistry } from "../lib/training-program/registry.ts";
import type { TrainingProgramDefinition } from "../lib/training-program/types.ts";
import { normalizeSnapshot } from "../lib/workout-snapshot.ts";

test("legacy Weeks 1–3 stay on program v1 and Week 4 switches to Plan v2", () => {
  for (const weekIndex of [1, 2, 3]) assert.equal(trainingProgramRegistry.resolveWeek(weekIndex).program.version, 1);
  assert.equal(trainingProgramRegistry.resolveWeek(4).program.version, 2);
  assert.equal(buildProgramWeek(3)[0].title, "Гантели по кругу");
});

test("Plan v2 canonical week has two independent Monday sessions, 3 Swim, 2 Strength and optional Bike", () => {
  const week = buildProgramWeek(4);
  const sessions = week.flatMap(sessionsForDay);
  assert.deepEqual(sessionsForDay(week[0]).map((session) => session.id), ["strength-a", "swim-technique"]);
  assert.equal(sessions.filter((session) => session.discipline === "swim" && session.required).length, 3);
  assert.equal(sessions.filter((session) => session.discipline === "strength" && session.required).length, 2);
  assert.equal(sessions.find((session) => session.discipline === "bike")?.optional, true);
  assert.deepEqual(week.slice(5).map((day) => day.discipline), ["recovery", "recovery"]);
  assert.notDeepEqual(sessions[0].programIdentity, sessions[1].programIdentity);
});

test("Strength A/B are reusable catalog references and contain no heavy leg work", () => {
  const sessions = buildProgramWeek(6).flatMap(sessionsForDay).filter((session) => session.discipline === "strength");
  assert.deepEqual(sessions.map((session) => session.workoutRef), [
    { kind: "catalog", workoutId: "strength-a" },
    { kind: "catalog", workoutId: "strength-b" },
  ]);
  const names = sessions.flatMap((session) => session.exercises.map((exercise) => exercise[0]));
  assert.ok(!names.some((name) => /squat|lunge|leg press|leg extension|leg curl|присед|выпад|разгибание ног|сгибание ног/i.test(name)));
});

test("Plan v2 calendar sessions reference the exact Foundation workout ids", () => {
  const swimRefs = buildProgramWeek(5).flatMap(sessionsForDay)
    .filter((session) => session.discipline === "swim")
    .map((session) => session.workoutRef);
  assert.deepEqual(swimRefs, [
    { kind: "swim", programId: "foundation", programVersion: 2, workoutId: "w5d1" },
    { kind: "swim", programId: "foundation", programVersion: 2, workoutId: "w5d3" },
    { kind: "swim", programId: "foundation", programVersion: 2, workoutId: "w5d5" },
  ]);
});

test("legacy plan keys keep the exact old hash payload; versioned sessions get distinct keys", () => {
  const raw = { title: "Гантели по кругу", type: "Силовая", rounds: 2, exercises: [{ name: "Жим", target: "3 × 10", recommendedWeight: 10 }] };
  const legacy = normalizeSnapshot(raw)!;
  const expectedLegacy = createHash("sha256").update(JSON.stringify({ title: legacy.title, type: legacy.type, exercises: legacy.exercises.map((exercise) => exercise.name) })).digest("hex").slice(0, 32);
  assert.equal(planKey(legacy), expectedLegacy);

  const identity = sessionsForDay(buildProgramWeek(4)[0])[0].programIdentity!;
  const versioned = normalizeSnapshot({ ...raw, title: "Strength A", programIdentity: identity })!;
  assert.notEqual(planKey(versioned), planKey(normalizeSnapshot({ ...raw, title: "Strength A" })!));
  assert.equal(trainingProgramRegistry.resolveIdentity(identity)?.session.title, "Strength A");
});

test("a future Plan v3 fixture can be registered without changing UI or historical v2 resolution", () => {
  const historicalIdentity = sessionsForDay(buildProgramWeek(4)[0])[0].programIdentity!;
  const v3: TrainingProgramDefinition = {
    id: VOLT_PROGRAM_ID,
    version: 3,
    name: "Plan v3 fixture",
    description: "Test-only future cycle",
    effectiveFromWeek: 9,
    weeks: [{
      index: 9,
      title: "Fixture week",
      phase: "fixture",
      sessions: [{ id: "fixture-recovery", day: 1, discipline: "recovery", role: "recovery", required: false, title: "Fixture recovery", estimatedDuration: null, workoutRef: { kind: "catalog", workoutId: "recovery" } }],
    }],
  };
  const registry = new TrainingProgramRegistry([...trainingProgramRegistry.programs, v3]);
  assert.equal(registry.resolveWeek(9).program.version, 3);
  assert.equal(registry.resolveWeek(4).program.version, 2);
  assert.equal(registry.resolveIdentity(historicalIdentity)?.session.title, "Strength A");
  assert.equal(trainingProgramRegistry.resolveWeek(9).program.version, 2, "fixture is not active in production registry");
});
