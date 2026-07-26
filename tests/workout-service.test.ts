import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-workout-service-"));
const { db } = await import("@/lib/db.ts");
const { saveWorkout, updateWorkout, deleteWorkout } = await import("@/lib/workout-service.ts");

const detail = (originalName: string, weight: number, value = 8) => ({ key: "k0", name: originalName, originalName, value, weight, difficulty: "Нормально", unit: "повт." });

function seedStaleProgression(workoutId: number, exercise: string) {
 const decisionId = db.prepare(`INSERT INTO progression_decisions
  (workout_id,exercise,action,reason_code,reason,used_signals,limited_data,from_weight,from_reps,to_weight,to_reps,pain_after,effort,workout_complete,coach_action,status)
  VALUES (?,?,'increase','test','test','[]',0,10,8,12,8,0,'Нормально',1,'proceed','pending')`).run(workoutId, exercise).lastInsertRowid as number;
 db.prepare("INSERT INTO exercise_load_overrides (exercise,weight,reps,source_decision_id) VALUES (?,?,?,?)").run(exercise, 12, 8, decisionId);
 return decisionId;
}

function makeWorkout(date: string, overrides: Record<string, any> = {}) {
 const body = {
  date, title: "Силовая тест", type: "Силовая", completed: ["0-0", "0-1"], durationSeconds: 600, restSeconds: 120,
  rounds: 1, effort: "Тяжело", painAfter: 5, details: [detail("Жим гантелей лёжа", 10)],
  ...overrides,
 };
 const result = saveWorkout(body);
 assert.equal(result.ok, true);
 return (db.prepare("SELECT id FROM workout_logs WHERE date=? ORDER BY id DESC LIMIT 1").get(date) as any).id as number;
}

test("updateWorkout: strength_logs пересобираются без дублей, старый progression и override удаляются", () => {
 const workoutId = makeWorkout("2026-02-01");
 const staleDecisionId = seedStaleProgression(workoutId, "Жим гантелей лёжа");

 const result = updateWorkout({
  id: workoutId, date: "2026-02-01", title: "Силовая тест", type: "Силовая", rounds: 1,
  durationSeconds: 600, restSeconds: 120, details: [detail("Жим гантелей лёжа", 15)],
 });
 assert.equal(result.ok, true);

 const strengthRows = db.prepare("SELECT weight FROM strength_logs WHERE workout_id=?").all(workoutId) as any[];
 assert.equal(strengthRows.length, 1);
 assert.equal(strengthRows[0].weight, 15);

 const staleDecision = db.prepare("SELECT 1 FROM progression_decisions WHERE id=?").get(staleDecisionId);
 assert.equal(staleDecision, undefined);
 const staleOverride = db.prepare("SELECT 1 FROM exercise_load_overrides WHERE source_decision_id=?").get(staleDecisionId);
 assert.equal(staleOverride, undefined);
});

test("updateWorkout: сохраняет completed/effort/painAfter, которые форма не редактирует", () => {
 const workoutId = makeWorkout("2026-02-02", { effort: "Боль", painAfter: 7, completed: ["0-0"] });
 updateWorkout({
  id: workoutId, date: "2026-02-02", title: "Силовая тест 2", type: "Силовая", rounds: 1,
  durationSeconds: 700, restSeconds: 90, details: [detail("Жим гантелей лёжа", 20)],
 });
 const row = db.prepare("SELECT completed,effort,pain_after painAfter FROM workout_logs WHERE id=?").get(workoutId) as any;
 assert.equal(row.effort, "Боль");
 assert.equal(row.painAfter, 7);
 assert.deepEqual(JSON.parse(row.completed), ["0-0"]);
});

test("updateWorkout: смена типа с Силовая на Кардио убирает strength_logs и не оставляет progression", () => {
 const workoutId = makeWorkout("2026-02-03");
 seedStaleProgression(workoutId, "Жим гантелей лёжа");
 updateWorkout({
  id: workoutId, date: "2026-02-03", title: "Кардио тест", type: "Кардио", rounds: 1,
  durationSeconds: 1200, restSeconds: 0, details: [],
 });
 assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE workout_id=?").get(workoutId) as any).n, 0);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM progression_decisions WHERE workout_id=?").get(workoutId) as any).n, 0);
});

test("updateWorkout: несуществующий id -> 404", () => {
 const result = updateWorkout({ id: 999999, date: "2026-02-04", title: "X", type: "Силовая", rounds: 1, durationSeconds: 0, restSeconds: 0, details: [] });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 404);
});

test("updateWorkout: некорректные данные -> 400", () => {
 const result = updateWorkout({ id: 1, date: "не-дата", title: "X", type: "Силовая", rounds: 1, durationSeconds: 0, restSeconds: 0, details: [] });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 400);
});

test("deleteWorkout: одной транзакцией удаляет overrides, decisions, strength_logs и саму тренировку", () => {
 const workoutId = makeWorkout("2026-02-05");
 const decisionId = seedStaleProgression(workoutId, "Жим гантелей лёжа");

 const result = deleteWorkout({ id: workoutId });
 assert.equal(result.ok, true);

 assert.equal(db.prepare("SELECT 1 FROM workout_logs WHERE id=?").get(workoutId), undefined);
 assert.equal(db.prepare("SELECT 1 FROM strength_logs WHERE workout_id=?").get(workoutId), undefined);
 assert.equal(db.prepare("SELECT 1 FROM progression_decisions WHERE id=?").get(decisionId), undefined);
 assert.equal(db.prepare("SELECT 1 FROM exercise_load_overrides WHERE source_decision_id=?").get(decisionId), undefined);
});

test("deleteWorkout: некорректный id -> 400", () => {
 const result = deleteWorkout({ id: "abc" });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 400);
});

test("deleteWorkout: несуществующий id -> 404", () => {
 const result = deleteWorkout({ id: 999999 });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 404);
});
