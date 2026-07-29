import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Симулирует production-like копию БД ДО AI-5: schema_migrations доходит
// только до версии 11 (последней перед insight_log), есть реальные данные в
// уже существующей таблице. Проверяем, что применение db.ts на такой копии
// добавляет insight_log аддитивно и не трогает существующие данные.
const dataDir = mkdtempSync(path.join(tmpdir(), "volt-insight-memory-migration-"));
const dbPath = path.join(dataDir, "volt.sqlite");

const seed = new Database(dbPath);
seed.exec(`
  CREATE TABLE workout_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, completed TEXT NOT NULL DEFAULT '[]', rounds INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
seed.prepare("INSERT INTO workout_logs (date,type,title,rounds) VALUES (?,?,?,?)").run("2026-01-01", "Силовая", "Старая тренировка до AI-5", 2);
for (let v = 1; v <= 11; v++) seed.prepare("INSERT INTO schema_migrations(version) VALUES (?)").run(v);
seed.close();

process.env.DATA_DIR = dataDir;
const { db } = await import("@/lib/db.ts");

test("миграция v12 на production-like копии со старой схемой: insight_log появляется, старые данные не тронуты", () => {
  const migrated = db.prepare("SELECT 1 FROM schema_migrations WHERE version=12").get();
  assert.ok(migrated);

  const cols = (db.prepare("PRAGMA table_info(insight_log)").all() as any[]).map(c => c.name);
  assert.ok(cols.includes("insight_id") && cols.includes("evidence_hash"));

  const oldRow = db.prepare("SELECT date,type,title,rounds FROM workout_logs WHERE title=?").get("Старая тренировка до AI-5") as any;
  assert.deepEqual(oldRow, { date: "2026-01-01", type: "Силовая", title: "Старая тренировка до AI-5", rounds: 2 });
});

test("insight_log пуст сразу после миграции — новая таблица не бэкфилится задним числом", () => {
  const count = (db.prepare("SELECT count(*) c FROM insight_log").get() as any).c;
  assert.equal(count, 0);
});
