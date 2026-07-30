import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Production-like копия ДО AI-6: schema_migrations доходит только до версии 12
// (последней перед milestones), есть реальные данные в уже существующих
// таблицах. Синтетические данные — без переноса личной информации.
const dataDir = mkdtempSync(path.join(tmpdir(), "volt-milestones-migration-"));
const dbPath = path.join(dataDir, "volt.sqlite");

const seed = new Database(dbPath);
seed.exec(`
  CREATE TABLE measurements (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, weight REAL, waist REAL, chest REAL, biceps REAL, thigh REAL, neck REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
seed.prepare("INSERT INTO measurements (date,weight) VALUES (?,?)").run("2026-01-01", 85.5);
for (let v = 1; v <= 12; v++) seed.prepare("INSERT INTO schema_migrations(version) VALUES (?)").run(v);
seed.close();

process.env.DATA_DIR = dataDir;
const { db } = await import("@/lib/db.ts");

test("миграция v13 на production-like копии со старой схемой: milestones появляется, старые данные не тронуты", () => {
  const migrated = db.prepare("SELECT 1 FROM schema_migrations WHERE version=13").get();
  assert.ok(migrated);

  const cols = (db.prepare("PRAGMA table_info(milestones)").all() as any[]).map(c => c.name);
  assert.ok(cols.includes("occurred_at") && cols.includes("title") && cols.includes("category"));

  const oldRow = db.prepare("SELECT date,weight FROM measurements WHERE date=?").get("2026-01-01") as any;
  assert.deepEqual(oldRow, { date: "2026-01-01", weight: 85.5 });
});

test("milestones пуста сразу после миграции — не бэкфилится задним числом", () => {
  const count = (db.prepare("SELECT count(*) c FROM milestones").get() as any).c;
  assert.equal(count, 0);
});
