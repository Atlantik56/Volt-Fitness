import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Production already contains FIT imports. SQLite only rejects CURRENT_TIMESTAMP
// as an ALTER TABLE default when the target table has rows, so a fresh database
// test does not exercise the deployment path that failed.
const dataDir = mkdtempSync(path.join(tmpdir(), "volt-strava-production-migration-"));
const dbPath = path.join(dataDir, "volt.sqlite");
const seed = new Database(dbPath);

seed.exec(`
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Илья',
    height REAL NOT NULL DEFAULT 167,
    start_weight REAL NOT NULL DEFAULT 86,
    target_weight REAL NOT NULL DEFAULT 67,
    program_start TEXT NOT NULL DEFAULT '2026-07-21',
    training_plan_v3_started_at TEXT
  );
  INSERT INTO profile(id,training_plan_v3_started_at) VALUES(1,NULL);
  CREATE TABLE workout_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT,
    fingerprint TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    activity_type TEXT NOT NULL,
    average_heart_rate INTEGER,
    max_heart_rate INTEGER,
    calories INTEGER,
    average_cadence REAL,
    training_effect REAL,
    metadata TEXT NOT NULL DEFAULT '{}',
    draft_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX idx_workout_imports_fingerprint ON workout_imports(source,fingerprint);
  CREATE TABLE strava_connections (
    username TEXT PRIMARY KEY,
    athlete_id TEXT NOT NULL,
    athlete_name TEXT NOT NULL DEFAULT '',
    scopes TEXT NOT NULL,
    connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_synced_at TEXT,
    last_sync_error TEXT NOT NULL DEFAULT ''
  );
`);
seed.prepare(`INSERT INTO workout_imports
  (source,fingerprint,started_at,duration_seconds,activity_type,created_at)
  VALUES(?,?,?,?,?,?)`).run("fit", "existing-import", "2026-08-31T08:00:00.000Z", 3600, "bike", "2026-08-31 08:05:00");
for (let version = 1; version <= 23; version++) {
  seed.prepare("INSERT INTO schema_migrations(version) VALUES(?)").run(version);
}
seed.close();

process.env.DATA_DIR = dataDir;
const { db } = await import("@/lib/db.ts");

test("migration v24 upgrades a populated workout_imports table", () => {
  assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=24").get());
  const row = db.prepare("SELECT fingerprint,created_at createdAt,updated_at updatedAt,review_status reviewStatus FROM workout_imports WHERE fingerprint=?").get("existing-import") as any;
  assert.deepEqual(row, {
    fingerprint: "existing-import",
    createdAt: "2026-08-31 08:05:00",
    updatedAt: "2026-08-31 08:05:00",
    reviewStatus: "new",
  });
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='strava_webhook_events'").get());
});
