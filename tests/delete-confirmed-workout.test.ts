import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-02T20:00:00") });
test.after(() => mock.timers.reset());

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-delete-confirmed-"));
const { db } = await import("@/lib/db.ts");
const { autoConfirmImport } = await import("@/lib/import-auto-confirm.ts");
const { deleteWorkout } = await import("@/lib/workout-service.ts");

db.prepare("UPDATE profile SET program_start=?,swim_plan_started_at=? WHERE id=1").run("2026-07-21", "2026-08-10");

function addSwimImport(date: string) {
  return Number(db.prepare(`INSERT INTO workout_imports
    (source,external_id,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,metadata)
    VALUES ('garmin_fit','ext-del',?,?,2500,'swim',140,?)`)
    .run("d".repeat(64), `${date}T15:20:00.000Z`, JSON.stringify({ localDate: date, distanceMeters: 1200, laps: [] }))
    .lastInsertRowid);
}

const importId = addSwimImport("2026-09-02");
const confirmed = autoConfirmImport(importId) as any;
const workoutId = () => (db.prepare("SELECT id FROM workout_logs ORDER BY id DESC LIMIT 1").get() as any)?.id;

test("the import is confirmed and produces a workout", () => {
  assert.equal(confirmed.confirmed, true, confirmed.reason);
  assert.ok(workoutId());
});

test("a workout confirmed through a draft can be deleted", () => {
  // Регрессия: workout_drafts.workout_id ссылается на workout_logs, внешние
  // ключи включены, поэтому DELETE падал с SQLITE_CONSTRAINT_FOREIGNKEY и
  // удалить нельзя было ни одну подтверждённую тренировку.
  const id = workoutId();
  const result = deleteWorkout({ id }) as any;
  assert.equal(result.ok, true, result.error);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM workout_logs WHERE id=?").get(id) as any).c, 0);
});

test("the draft goes with it, so the programme stops counting it as done", () => {
  assert.equal((db.prepare("SELECT COUNT(*) c FROM workout_drafts WHERE status='completed'").get() as any).c, 0);
});

test("the import survives as raw evidence but is marked dismissed", () => {
  const row = db.prepare("SELECT draft_id draftId,review_status reviewStatus FROM workout_imports WHERE id=?").get(importId) as any;
  assert.equal(row.draftId, null);
  assert.equal(row.reviewStatus, "dismissed", "импорт не удаляем — это данные с часов");
});

test("a dismissed import is never re-confirmed, so the deletion sticks", () => {
  const again = autoConfirmImport(importId) as any;
  assert.equal(again.confirmed, false);
  assert.match(again.reason, /отклонён/);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM workout_logs WHERE date='2026-09-02'").get() as any).c, 0, "удалённая тренировка не должна вернуться");
});
