import assert from "node:assert/strict";
import test from "node:test";
import { activeWorkoutStatusLabel, isActiveWorkoutView } from "../lib/workout-status.ts";

test("статус «выполнено» показывается только при буквальном completed", () => {
  assert.equal(activeWorkoutStatusLabel("completed"), "ТРЕНИРОВКА ВЫПОЛНЕНА");
  assert.equal(activeWorkoutStatusLabel("active"), "ТРЕНИРОВКА ИДЁТ");
  assert.equal(activeWorkoutStatusLabel("awaiting_confirmation"), "ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ");
});

test("непредвиденный/транзиентный статус (например 'planned') не считается выполненным", () => {
  assert.equal(activeWorkoutStatusLabel("planned"), "ТРЕНИРОВКА ИДЁТ");
  assert.equal(activeWorkoutStatusLabel("cancelled"), "ТРЕНИРОВКА ИДЁТ");
  assert.equal(activeWorkoutStatusLabel(""), "ТРЕНИРОВКА ИДЁТ");
});

test("активный вид тренировки показывается для active и любого статуса кроме awaiting_confirmation/completed", () => {
  assert.equal(isActiveWorkoutView("active"), true);
  assert.equal(isActiveWorkoutView("planned"), true);
  assert.equal(isActiveWorkoutView("unknown-future-status"), true);
  assert.equal(isActiveWorkoutView("awaiting_confirmation"), false);
  assert.equal(isActiveWorkoutView("completed"), false);
});

test("completed и awaiting_confirmation взаимоисключающи с активным видом (нет статуса, дающего два экрана сразу)", () => {
  for (const status of ["active", "awaiting_confirmation", "completed", "planned", "cancelled"]) {
    const active = isActiveWorkoutView(status);
    const completed = status === "completed";
    const awaiting = status === "awaiting_confirmation";
    assert.equal([active, completed, awaiting].filter(Boolean).length, 1, `статус "${status}" должен давать ровно один экран`);
  }
});
