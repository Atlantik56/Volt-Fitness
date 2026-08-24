import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildProgramWeek } from "../app/personal-data.ts";
import { sessionsForDay } from "../app/week-schedule-model.ts";
import { planKey } from "../lib/plan-key.ts";
import { PLAN_V3_EFFECTIVE_WEEK } from "../lib/training-program/definitions.ts";
import { trainingProgramRegistry } from "../lib/training-program/registry.ts";
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

test("Plan v3 начинается с Week 9 и не меняет исторические identity Plan v2", () => {
  const historicalIdentity = sessionsForDay(buildProgramWeek(8)[0])[0].programIdentity!;
  assert.equal(PLAN_V3_EFFECTIVE_WEEK, 9);
  assert.equal(trainingProgramRegistry.resolveWeek(8).program.version, 2);
  assert.equal(trainingProgramRegistry.resolveWeek(9).program.version, 3);
  assert.equal(trainingProgramRegistry.resolveIdentity(historicalIdentity)?.session.title, "Strength A");
});

test("Plan v3 сохраняет ритм 3 Swim + 2 Strength + optional Bike и ссылается на Endurance", () => {
  const week = buildProgramWeek(9);
  const sessions = week.flatMap(sessionsForDay);
  assert.deepEqual(sessionsForDay(week[0]).map((session) => session.id), ["strength-v3-a", "swim-v3-technique"]);
  assert.equal(sessions.filter((session) => session.discipline === "swim" && session.required).length, 3);
  assert.equal(sessions.filter((session) => session.discipline === "strength" && session.required).length, 2);
  assert.equal(sessions.find((session) => session.discipline === "bike")?.optional, true);
  assert.deepEqual(sessions.filter((session) => session.discipline === "swim").map((session) => session.workoutRef), [
    { kind: "swim", programId: "endurance", programVersion: 1, workoutId: "w9d1" },
    { kind: "swim", programId: "endurance", programVersion: 1, workoutId: "w9d3" },
    { kind: "swim", programId: "endurance", programVersion: 1, workoutId: "w9d5" },
  ]);
  assert.deepEqual(trainingProgramRegistry.identityForSwimWorkout("endurance", 1, "w9d3"), {
    programId: "volt-training", programVersion: 3, weekIndex: 9, sessionId: "swim-v3-aerobic",
  });
});

test("Plan v3 не содержит домашних гантелей и тяжёлых упражнений на ноги", () => {
  const strength = buildProgramWeek(9).flatMap(sessionsForDay).filter((session) => session.discipline === "strength");
  assert.deepEqual(strength.map((session) => session.workoutRef), [
    { kind: "catalog", workoutId: "strength-v3-a" },
    { kind: "catalog", workoutId: "strength-v3-b" },
  ]);
  const names = strength.flatMap((session) => session.exercises.map((exercise) => exercise[0]));
  assert.ok(names.some((name) => /нижнем блоке.*опорой/i.test(name)));
  assert.ok(names.some((name) => /донки-кик/i.test(name)));
  assert.ok(!names.some((name) => /гантел|dumbbell|squat|lunge|leg press|присед|выпад|жим ногами/i.test(name)));
});
