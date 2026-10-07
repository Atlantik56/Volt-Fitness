import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-mcp-data-"));
const { db } = await import("@/lib/db.ts");
const { getRecentWorkouts, getWeekPlan } = await import("@/lib/volt-mcp-data.ts");

test("week plan resolves exactly one shared calendar week", () => {
  const result = getWeekPlan(db, "2026-09-06");
  assert.equal(result.days.length, 7);
  assert.equal(result.week.mondayIso, "2026-08-31");
  assert.equal(result.week.sundayIso, "2026-09-06");
  assert.deepEqual(result.days.map((day) => day.date), ["2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-05","2026-09-06"]);
});

test("recent workouts exclude Strava-origin records", () => {
  db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,external_activity_source)
    VALUES(?,?,?,?,?,?)`).run("2026-09-05", "Вело", "Strava secret", "[]", 1, "strava");
  db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,external_activity_source)
    VALUES(?,?,?,?,?,?)`).run("2026-09-04", "Силовая", "Подтверждённая", "[]", 1, null);
  const result = getRecentWorkouts(db, "2026-09-06", 10);
  assert.equal(JSON.stringify(result).includes("Strava secret"), false);
  assert.equal(JSON.stringify(result).includes("Подтверждённая"), true);
});
