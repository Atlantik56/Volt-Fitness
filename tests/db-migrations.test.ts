import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-db-migrations-"));
const { db } = await import("@/lib/db.ts");
const { linkLegacyStrengthLogs } = await import("@/lib/strength-log-linking.ts");

function insertWorkout(date: string, details: any[]) {
 return db.prepare("INSERT INTO workout_logs (date,type,title,completed,rounds,details) VALUES (?,?,?,?,?,?)").run(date, "Силовая", "Тест", "[]", 1, JSON.stringify(details)).lastInsertRowid as number;
}
function insertOrphanStrengthLog(date: string, exercise: string) {
 return db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps,workout_id) VALUES (?,?,?,?,NULL)").run(date, exercise, 10, 8).lastInsertRowid as number;
}
const detail = (originalName: string) => ({ key: "k", name: originalName, originalName, value: 8, weight: 10, difficulty: "Нормально", unit: "повт." });

test("migration v9 записана в schema_migrations на свежей БД", () => {
 const row = db.prepare("SELECT 1 FROM schema_migrations WHERE version=9").get();
 assert.ok(row);
});

test("migration v22 создаёт idempotency store Coach",()=>{
 const migration=db.prepare("SELECT 1 FROM schema_migrations WHERE version=22").get();
 const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='coach_chat_requests'").get();
 assert.ok(migration);
 assert.ok(table);
});

test("migration v23 создаёт раздельное Strava OAuth-хранилище и provenance",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=23").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='strava_connections'").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='strava_oauth_tokens'").get());
 const columns=db.prepare("PRAGMA table_info(workout_logs)").all() as {name:string}[];
 assert.ok(columns.some(column=>column.name==="external_activity_source"));
 assert.ok(columns.some(column=>column.name==="external_activity_id"));
});

test("migration v24 создаёт webhook inbox, auth state и transient cache TTL",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=24").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='strava_webhook_events'").get());
 const connectionColumns=db.prepare("PRAGMA table_info(strava_connections)").all() as any[];
 const importColumns=db.prepare("PRAGMA table_info(workout_imports)").all() as any[];
 assert.ok(connectionColumns.some(column=>column.name==="status"));
 assert.ok(connectionColumns.some(column=>column.name==="last_webhook_at"));
 assert.ok(importColumns.some(column=>column.name==="cache_expires_at"));
 assert.ok(importColumns.some(column=>column.name==="review_status"));
});

test("migration v25 создаёт историю циклов общего тренировочного плана",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=25").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='training_plan_cycles'").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_training_plan_cycles_open'").get());
});

test("однозначное совпадение по дате и упражнению — связывается", () => {
 const workoutId = insertWorkout("2026-01-01", [detail("Жим гантелей лёжа")]);
 const logId = insertOrphanStrengthLog("2026-01-01", "Жим гантелей лёжа");
 const linked = linkLegacyStrengthLogs(db);
 assert.equal(linked, 1);
 const row = db.prepare("SELECT workout_id workoutId FROM strength_logs WHERE id=?").get(logId) as any;
 assert.equal(row.workoutId, workoutId);
});

test("совпадение по name, если originalName другой (замена упражнения)", () => {
 const workoutId = insertWorkout("2026-01-02", [{ ...detail("Отжимания"), name: "Приседания", originalName: "Отжимания" }]);
 const logId = insertOrphanStrengthLog("2026-01-02", "Приседания");
 const linked = linkLegacyStrengthLogs(db);
 assert.equal(linked, 1);
 const row = db.prepare("SELECT workout_id workoutId FROM strength_logs WHERE id=?").get(logId) as any;
 assert.equal(row.workoutId, workoutId);
});

test("две тренировки в один день с тем же упражнением — неоднозначно, не связывается", () => {
 insertWorkout("2026-01-03", [detail("Тяга гантели")]);
 insertWorkout("2026-01-03", [detail("Тяга гантели")]);
 const logId = insertOrphanStrengthLog("2026-01-03", "Тяга гантели");
 linkLegacyStrengthLogs(db);
 const row = db.prepare("SELECT workout_id workoutId FROM strength_logs WHERE id=?").get(logId) as any;
 assert.equal(row.workoutId, null);
});

test("нет подходящей тренировки в этот день — ручная запись остаётся не связанной", () => {
 const logId = insertOrphanStrengthLog("2026-01-04", "Упражнение без тренировки");
 linkLegacyStrengthLogs(db);
 const row = db.prepare("SELECT workout_id workoutId FROM strength_logs WHERE id=?").get(logId) as any;
 assert.equal(row.workoutId, null);
});

test("уже связанные записи повторно не трогаются", () => {
 const linkedBefore = linkLegacyStrengthLogs(db);
 assert.equal(linkedBefore, 0);
});
