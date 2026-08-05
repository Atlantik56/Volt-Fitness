import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-history-"));
const { db } = await import("@/lib/db.ts");
const { getSwimHistory } = await import("@/lib/swim-data.ts");
const { startWorkoutDraft, finishWorkoutDraft, confirmWorkoutDraft } = await import("@/lib/active-workout-service.ts");
const { getProgram } = await import("@/lib/swim/program-engine.ts");
const { buildSwimSnapshot, buildConfirmationExercises, totalDistanceMeters } = await import("@/lib/swim/workout-engine.ts");

test("нет заплывов — честный пустой результат, не подставленные нули", () => {
  const history = getSwimHistory();
  assert.equal(history.hasAnyHistory, false);
  assert.deepEqual(history.items, []);
});

test("лог не-swim активности (Силовая) не попадает в историю Swim", () => {
  db.prepare(
    "INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds) VALUES ('2026-08-01','Силовая','Гантели по кругу',0,1800)",
  ).run();
  const history = getSwimHistory();
  assert.equal(history.items.some((item) => item.title === "Гантели по кругу"), false);
});

test("ручной заплыв без привязки к плану — в истории, но без маршрута в детали", () => {
  db.prepare(
    "INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds,avg_heart_rate,metrics_source) VALUES ('2026-08-02','Плавание','Бассейн',900,1500,0,'manual')",
  ).run();
  const history = getSwimHistory();
  const item = history.items.find((row) => row.title === "Бассейн");
  assert.ok(item);
  assert.equal(item!.source, "manual");
  assert.equal(item!.route, null);
  assert.equal(item!.distanceMeters, 900);
  assert.equal(item!.durationSeconds, 1500);
  assert.equal(item!.avgHeartRate, null); // 0 — нет данных, а не 0 уд/мин
  assert.ok(item!.paceLabel);
});

test("импортированный из Garmin заплыв помечен источником imported_metric", () => {
  db.prepare(
    "INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds,avg_heart_rate,metrics_source) VALUES ('2026-08-03','Плавание','Заплыв с часов',1200,1800,128,'imported_metric')",
  ).run();
  const history = getSwimHistory();
  const item = history.items.find((row) => row.title === "Заплыв с часов");
  assert.ok(item);
  assert.equal(item!.source, "imported_metric");
  assert.equal(item!.avgHeartRate, 128);
  assert.equal(history.hasAnyHistory, true);
});

test("завершённая тренировка программы резолвится в маршрут /swim/workouts/{programId}/{workoutId}", () => {
  const program = getProgram("foundation")!;
  const workout = program.weeks[0].days.find((d) => d.workout)!.workout!;
  const snapshot = buildSwimSnapshot(program, workout)!;
  const started = startWorkoutDraft({ date: "2026-08-04", snapshot });
  assert.equal(started.ok, true);
  const finished = finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  assert.equal(finished.ok, true);
  const confirmed = confirmWorkoutDraft({
    id: started.draft!.id, expectedStatus: "awaiting_confirmation", durationSeconds: 2000,
    distanceMeters: totalDistanceMeters(workout), effort: "Нормально", painAfter: 0,
    exercises: buildConfirmationExercises(workout),
  });
  assert.equal(confirmed.ok, true);

  const history = getSwimHistory();
  const item = history.items.find((row) => row.date === "2026-08-04");
  assert.ok(item);
  assert.deepEqual(item!.route, { programId: "foundation", workoutId: workout.id });
});

test("поиск/фильтр остаются на клиенте — сервис всегда отдаёт полный отфильтрованный по активности список, отсортированный по дате", () => {
  const history = getSwimHistory();
  const dates = history.items.map((item) => item.date);
  const sorted = [...dates].sort().reverse();
  assert.deepEqual(dates, sorted);
});
