import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-cycling-workout-"));
const { db } = await import("@/lib/db.ts");
const service = await import("@/lib/active-workout-service.ts");

const snapshot = () => ({
  title: "Bike / Indoor Cycling",
  type: "Кардио",
  rounds: 1,
  origin: "scheduled",
  scheduleChangeId: 12,
  exercises: [
    { name: "Лёгкая разминка", target: "5 мин", recommendedWeight: 0 },
    { name: "Easy Zone 2", target: "20 мин", recommendedWeight: 0 },
    { name: "Заминка", target: "5 мин", recommendedWeight: 0 },
  ],
});

test("повторный Cycling start возвращает один общий draft", () => {
  const first = service.startWorkoutDraft({ date: "2026-08-11", snapshot: snapshot() });
  const second = service.startWorkoutDraft({ date: "2026-08-11", snapshot: snapshot() });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.draft?.id, first.draft?.id);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_drafts WHERE date=?").get("2026-08-11") as any).n, 1);
});

test("Cycling confirmation сохраняет реальные метрики и load feedback в общий workout_logs", () => {
  const started = service.startWorkoutDraft({ date: "2026-08-12", snapshot: snapshot() });
  const finished = service.finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  assert.equal(finished.ok, true);
  const confirmed = service.confirmWorkoutDraft({
    id: started.draft!.id,
    expectedStatus: "awaiting_confirmation",
    durationSeconds: 1800,
    distanceMeters: 10_000,
    avgHeartRate: 124,
    maxHeartRate: 149,
    calories: 260,
    effort: "Нормально",
    painAfter: 2,
    loadFeedback: "discomfort",
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.summary?.averageSpeed, 20);
  const workout = db.prepare(`SELECT type,duration_seconds duration,distance_meters distance,avg_heart_rate hr,max_heart_rate maxHr,
    calories,avg_speed speed,metrics_source metricsSource,pain_after painAfter,load_feedback loadFeedback
    FROM workout_logs WHERE id=?`).get(confirmed.draft!.workoutId) as any;
  assert.deepEqual(workout, {
    type: "Кардио", duration: 1800, distance: 10_000, hr: 124, maxHr: 149,
    calories: 260, speed: 20, metricsSource: "manual", painAfter: 2, loadFeedback: "discomfort",
  });
  assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE workout_id=?").get(confirmed.draft!.workoutId) as any).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM progression_decisions WHERE workout_id=?").get(confirmed.draft!.workoutId) as any).n, 0);
});

test("отсутствующие Cycling метрики остаются отсутствующими для selector (нули в legacy schema)", () => {
  const started = service.startWorkoutDraft({ date: "2026-08-13", snapshot: snapshot() });
  service.finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  const confirmed = service.confirmWorkoutDraft({
    id: started.draft!.id,
    expectedStatus: "awaiting_confirmation",
    durationSeconds: 1200,
    loadFeedback: "calm",
  });
  assert.equal(confirmed.ok, true);
  const metrics = db.prepare("SELECT avg_heart_rate hr,distance_meters distance,avg_speed speed,calories FROM workout_logs WHERE id=?").get(confirmed.draft!.workoutId) as any;
  assert.deepEqual(metrics, { hr: 0, distance: 0, speed: 0, calories: 0 });
});

test("Cycling awaiting_confirmation отменяется без workout log", () => {
  const started = service.startWorkoutDraft({ date: "2026-08-16", snapshot: snapshot() });
  service.finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  const cancelled = service.cancelWorkoutDraft({ id: started.draft!.id, expectedStatus: "awaiting_confirmation" });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.draft?.status, "cancelled");
  assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get("2026-08-16") as any).n, 0);
});

test("связанный bike FIT задаёт Cycling-метрики, но не подтверждает draft сам", () => {
  const started = service.startWorkoutDraft({ date: "2026-08-17", snapshot: snapshot() });
  service.finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  db.prepare(`INSERT INTO workout_imports(
    source,external_id,fingerprint,started_at,duration_seconds,activity_type,
    average_heart_rate,max_heart_rate,calories,average_cadence,training_effect,metadata,draft_id
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "Garmin FIT", "cycling-fit-1", "cycling-fit-fingerprint-1", "2026-08-17T08:00:00.000Z", 1800, "bike",
    126, 151, 275, 82, 2.4, JSON.stringify({ distanceMeters: 12_000, laps: [] }), started.draft!.id,
  );
  assert.equal((db.prepare("SELECT status FROM workout_drafts WHERE id=?").get(started.draft!.id) as any).status, "awaiting_confirmation");
  assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get("2026-08-17") as any).n, 0);

  const confirmed = service.confirmWorkoutDraft({
    id: started.draft!.id,
    expectedStatus: "awaiting_confirmation",
    durationSeconds: 600,
    loadFeedback: "calm",
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.summary?.metricsSource, "imported_metric");
  assert.equal(confirmed.summary?.confirmationSource, "Garmin");
  assert.equal(confirmed.summary?.duration, 1800);
  assert.equal(confirmed.summary?.distanceMeters, 12_000);
  assert.equal(confirmed.summary?.averageHeartRate, 126);
  assert.equal(confirmed.summary?.averageSpeed, 24);
});

test("невалидный load feedback отклоняется и не создаёт workout log", () => {
  const started = service.startWorkoutDraft({ date: "2026-08-14", snapshot: snapshot() });
  service.finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  const confirmed = service.confirmWorkoutDraft({
    id: started.draft!.id,
    expectedStatus: "awaiting_confirmation",
    durationSeconds: 1200,
    loadFeedback: "unsafe",
  });
  assert.equal(confirmed.ok, false);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get("2026-08-14") as any).n, 0);
});

test("повторный confirm Cycling не создаёт второй workout log", () => {
  const started = service.startWorkoutDraft({ date: "2026-08-15", snapshot: snapshot() });
  service.finishWorkoutDraft({ id: started.draft!.id, expectedStatus: "active" });
  const body = { id: started.draft!.id, expectedStatus: "awaiting_confirmation", durationSeconds: 900, loadFeedback: "calm" };
  assert.equal(service.confirmWorkoutDraft(body).ok, true);
  assert.equal(service.confirmWorkoutDraft(body).ok, false);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get("2026-08-15") as any).n, 1);
});
