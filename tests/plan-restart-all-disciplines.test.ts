import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-02T12:00:00") });
test.after(() => mock.timers.reset());

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-plan-restart-"));
const { db } = await import("@/lib/db.ts");
const { getActiveTrainingPlanCycle, startTrainingPlanV3, restartTrainingPlanV3 } = await import("@/lib/training-plan-activation.ts");
const { getProgramProgress } = await import("@/lib/swim/services.ts");

db.prepare("UPDATE profile SET program_start=?,swim_plan_started_at=? WHERE id=1").run("2026-07-21", "2026-08-10");

/** Отмечает плавательную тренировку выполненной так же, как это делает приложение. */
function completeSwim(planKey: string, date: string) {
  db.prepare("INSERT INTO workout_drafts (date,plan_key,status,snapshot) VALUES (?,?,'completed','{}')").run(date, planKey);
}

const foundation = () => getProgramProgress("foundation");

test("a completed swim counts towards the programme before any restart", () => {
  const before = foundation()!;
  const firstKey = before.workouts[0].planKey;
  assert.equal(before.completedCount, 0);
  completeSwim(firstKey, "2026-08-11");
  assert.equal(foundation()!.completedCount, 1, "выполненное засчитывается, пока цикл не перезапускали");
});

test("restarting the plan returns swimming to the beginning together with the gym", () => {
  startTrainingPlanV3();
  // Перезапуск запрещён в день старта цикла — сдвигаем старт назад, как это
  // выглядело бы через несколько дней после запуска плана.
  db.prepare("UPDATE profile SET training_plan_v3_started_at='2026-08-20' WHERE id=1").run();
  db.prepare("UPDATE training_plan_cycles SET started_at='2026-08-20' WHERE ended_at IS NULL").run();

  const restarted = restartTrainingPlanV3("2026-08-20") as any;
  assert.equal(restarted.ok, true);
  assert.ok(restarted.cycleId > 0, "создан новый цикл");

  // Недели 1–3 Foundation не упоминаются ни одной версией плана, поэтому реестр
  // не выдавал им идентичности и plan_key выходил независимым от цикла —
  // выполнение переживало перезапуск. Теперь идентичность достраивается из
  // самой программы, и новый цикл начинается чисто.
  assert.equal(foundation()!.completedCount, 0, "новый цикл начинается чисто");
  assert.equal(foundation()!.nextWorkout?.workout.id, foundation()!.workouts[0].workout.id, "следующая — первая тренировка программы");
});

test("the shared cycle is authoritative while the legacy swim anchor remains history", () => {
  const profile = db.prepare("SELECT swim_plan_started_at s,training_plan_v3_started_at v FROM profile WHERE id=1").get() as any;
  assert.equal(profile.s, "2026-08-10", "исторический Swim-якорь не переписываем");
  assert.equal(getActiveTrainingPlanCycle()?.startedAt, profile.v, "общий cycle — единственный боевой якорь");
});

test("nothing is deleted — completed sessions stay in history", () => {
  const drafts = db.prepare("SELECT COUNT(*) c FROM workout_drafts WHERE status='completed'").get() as any;
  assert.ok(drafts.c > 0, "перезапуск обнуляет счёт цикла, но не стирает историю");
});
