import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-02T20:00:00") });
test.after(() => mock.timers.reset());

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-auto-confirm-"));
const { db } = await import("@/lib/db.ts");
const { autoConfirmImport, AUTO_CONFIRM_MAX_AGE_DAYS, importLocalDate } = await import("@/lib/import-auto-confirm.ts");

db.prepare("UPDATE profile SET program_start=?,swim_plan_started_at=? WHERE id=1").run("2026-07-21", "2026-08-10");

let seq = 0;
function addImport(over: { date: string; type: string; duration: number; distance?: number }) {
  seq += 1;
  const startedAt = `${over.date}T15:20:00.000Z`;
  return Number(db.prepare(`INSERT INTO workout_imports
    (source,external_id,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,metadata)
    VALUES ('garmin_fit',?,?,?,?,?,140,?)`)
    .run(`ext-${seq}`, String(seq).repeat(20).slice(0, 64), startedAt, over.duration, over.type,
      JSON.stringify({ localDate: over.date, distanceMeters: over.distance ?? 1200, laps: [] }))
    .lastInsertRowid);
}
const historyCount = () => (db.prepare("SELECT COUNT(*) c FROM workout_logs").get() as any).c;

test("a fresh swim on a planned swim day is confirmed automatically", () => {
  // 2026-09-02 — среда, в плане плавание.
  const id = addImport({ date: "2026-09-02", type: "swim", duration: 2500 });
  const before = historyCount();
  const result = autoConfirmImport(id) as any;
  assert.equal(result.confirmed, true, result.reason);
  assert.equal(historyCount(), before + 1);

  const log = db.prepare("SELECT date,duration_seconds d,avg_heart_rate hr,metrics_source ms FROM workout_logs ORDER BY id DESC LIMIT 1").get() as any;
  assert.equal(log.date, "2026-09-02");
  assert.equal(log.d, 2500, "длительность взята из импорта, а не из плана");
  assert.equal(log.hr, 140);
  assert.equal(log.ms, "imported_metric");
});

test("running it twice does not create a second workout", () => {
  const id = db.prepare("SELECT id FROM workout_imports ORDER BY id DESC LIMIT 1").get() as any;
  const before = historyCount();
  const again = autoConfirmImport(id.id) as any;
  assert.equal(again.confirmed, false);
  assert.match(again.reason, /уже связан/);
  assert.equal(historyCount(), before, "дублей быть не должно");
});

test("a discipline the day does not plan is left for manual review", () => {
  const id = addImport({ date: "2026-09-02", type: "bike", duration: 2000 });
  const result = autoConfirmImport(id) as any;
  assert.equal(result.confirmed, false);
  assert.match(result.reason, /нет тренировки дисциплины/);
});

test("an implausibly short session is not confirmed as a full workout", () => {
  // 2026-08-31 — понедельник, плавательный день, и он в пределах свежести.
  const id = addImport({ date: "2026-08-31", type: "swim", duration: 120 });
  const result = autoConfirmImport(id) as any;
  assert.equal(result.confirmed, false);
  assert.match(result.reason, /слишком короткая/);
});

test("old imports are never backfilled silently", () => {
  const id = addImport({ date: "2026-06-20", type: "swim", duration: 2400 });
  const before = historyCount();
  const result = autoConfirmImport(id) as any;
  assert.equal(result.confirmed, false);
  assert.match(result.reason, new RegExp(`старше ${AUTO_CONFIRM_MAX_AGE_DAYS}`));
  assert.equal(historyCount(), before, "историю задним числом не переписываем");
});

test("the local date comes from the file, not from the UTC timestamp", () => {
  // Тренировка в 00:30 по Москве — это 21:30 предыдущих суток по UTC.
  assert.equal(importLocalDate("2026-09-02T21:30:00.000Z", { localDate: "2026-09-03" }), "2026-09-03");
  assert.equal(importLocalDate("2026-09-02T21:30:00.000Z", {}), "2026-09-02", "без подсказки берём UTC-дату");
});
