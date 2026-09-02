import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-import-dedupe-"));
const { db } = await import("@/lib/db.ts");
const { storeImportedWorkout } = await import("@/lib/fit-import-service.ts");

const workout = (overrides: Partial<any> = {}) => ({
  source: "garmin_fit" as const,
  externalId: "garmin:4536:3622629310:2026-08-31T15:24:23.000Z",
  fingerprint: "a".repeat(64),
  startedAt: "2026-08-31T15:24:23.000Z",
  duration: 2099,
  activityType: "swim" as const,
  averageHeartRate: 137,
  maxHeartRate: 165,
  calories: 277,
  metadata: { averageCadence: 21, trainingEffect: null, fitSport: "swimming", distanceMeters: 1150, laps: [] },
  ...overrides,
});

const importCount = () => (db.prepare("SELECT COUNT(*) c FROM workout_imports").get() as any).c;

test("the same activity fetched twice by different routes is stored once", () => {
  // Регрессия боевого бага: ручная загрузка FIT и копия того же заезда из
  // intervals.icu — байт-в-байт разные файлы, поэтому fingerprint отличается,
  // а external_id совпадает. Раньше это давало два импорта.
  const first = storeImportedWorkout(workout());
  assert.equal(first.result.duplicate, false);

  const second = storeImportedWorkout(workout({ fingerprint: "b".repeat(64) }));
  assert.equal(second.result.duplicate, true, "разные байты того же заезда — это дубль");
  assert.equal(second.result.id, first.result.id);
  assert.equal(importCount(), 1);
});

test("a genuinely different activity is still stored separately", () => {
  const before = importCount();
  const other = storeImportedWorkout(workout({
    externalId: "garmin:4536:3622629310:2026-08-06T15:26:10.000Z",
    fingerprint: "c".repeat(64),
    startedAt: "2026-08-06T15:26:10.000Z",
  }));
  assert.equal(other.result.duplicate, false);
  assert.equal(importCount(), before + 1);
});

test("records without an external id still deduplicate by fingerprint", () => {
  const before = importCount();
  const anonymous = workout({ externalId: null, fingerprint: "d".repeat(64), startedAt: "2026-07-01T10:00:00.000Z" });
  assert.equal(storeImportedWorkout(anonymous).result.duplicate, false);
  assert.equal(storeImportedWorkout(anonymous).result.duplicate, true);
  assert.equal(importCount(), before + 1);
});

test("the unique index makes a duplicate external id impossible at the database level", () => {
  const row = db.prepare("SELECT source,external_id,fingerprint,started_at,duration_seconds,activity_type,metadata FROM workout_imports WHERE external_id IS NOT NULL LIMIT 1").get() as any;
  assert.throws(
    () => db.prepare("INSERT INTO workout_imports (source,external_id,fingerprint,started_at,duration_seconds,activity_type,metadata) VALUES (?,?,?,?,?,?,?)")
      .run(row.source, row.external_id, "e".repeat(64), row.started_at, row.duration_seconds, row.activity_type, row.metadata),
    /UNIQUE/,
  );
});
