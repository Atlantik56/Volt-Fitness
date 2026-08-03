import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = mkdtempSync(path.join(tmpdir(), "volt-week-schedule-migration-"));
const legacy = new Database(path.join(dataDir, "volt.sqlite"));
legacy.exec(`
 CREATE TABLE workout_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,completed TEXT NOT NULL DEFAULT '[]',rounds INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO workout_logs(date,type,title,completed,rounds) VALUES('2026-06-01','Силовая','Историческая','[]',1);
`);
legacy.close();
process.env.DATA_DIR = dataDir;
const { db } = await import("@/lib/db.ts");

test("миграция v17 (week_schedule_changes) аддитивна и не трогает существующие workout_logs", () => {
  assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=17").get());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='week_schedule_changes'").get());
  const historical = db.prepare("SELECT date,title FROM workout_logs").all();
  assert.deepEqual(historical, [{ date: "2026-06-01", title: "Историческая" }]);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM week_schedule_changes").get() as any).n, 0);
});

test("date UNIQUE — второй upsert по той же дате обновляет строку, а не создаёт дубль", () => {
  db.prepare("INSERT INTO week_schedule_changes(date,action,assigned_source_day) VALUES(?,?,?)").run("2026-06-02", "rest", null);
  assert.throws(() => db.prepare("INSERT INTO week_schedule_changes(date,action,assigned_source_day) VALUES(?,?,?)").run("2026-06-02", "rest", null));
  db.prepare("INSERT INTO week_schedule_changes(date,action,assigned_source_day) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET action=excluded.action").run("2026-06-02", "replace", 3);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM week_schedule_changes WHERE date=?").get("2026-06-02") as any).n, 1);
});

test("action CHECK ограничивает значение допустимым списком", () => {
  assert.throws(() => db.prepare("INSERT INTO week_schedule_changes(date,action) VALUES(?,?)").run("2026-06-03", "invent-new-week"));
});
