import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-records-"));
const { db } = await import("@/lib/db.ts");
const { getSwimRecords } = await import("@/lib/swim-data.ts");

test("Records читает только Swim из существующей workout_logs", () => {
  db.prepare("INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds,avg_heart_rate,calories) VALUES (?,?,?,?,?,?,?)")
    .run("2026-08-03", "Плавание", "Контрольный заплыв", 900, 1500, 0, 0);
  db.prepare("INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds,avg_heart_rate,calories) VALUES (?,?,?,?,?,?,?)")
    .run("2026-08-04", "Силовая", "Гантели", 5000, 3600, 180, 900);

  const records = getSwimRecords("2026-08-06");
  assert.equal(records.hasAnyHistory, true);
  assert.equal(records.totalSwims, 1);
  assert.equal(records.totalDistanceMeters, 900);
  assert.equal(records.largestSwim?.title, "Контрольный заплыв");
  assert.equal(records.highestHeartRate, null);
  assert.equal(records.mostCalories, null);
  assert.equal(records.periodBest.week.swimCount, 1);
});

test("пустая workout_logs даёт честное пустое состояние Records", () => {
  db.prepare("DELETE FROM workout_logs").run();
  const records = getSwimRecords("2026-08-06");
  assert.equal(records.hasAnyHistory, false);
  assert.equal(records.totalSwims, 0);
  assert.equal(records.totalDistanceMeters, null);
  assert.equal(records.firstSwimDate, null);
  assert.equal(records.longestStreakDays, null);
});
