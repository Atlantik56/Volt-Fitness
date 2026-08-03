import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-active-workout-origin-"));
const { db } = await import("@/lib/db.ts");
const service = await import("@/lib/active-workout-service.ts");
const weekService = await import("@/lib/week-schedule-service.ts");

const snapshot = (extra: Record<string, unknown> = {}) => ({
  title: "Бассейн", type: "Кардио", rounds: 1,
  exercises: [{ name: "Плавание", target: "30 мин", recommendedWeight: 0 }],
  ...extra,
});

test("origin по умолчанию 'original', scheduleChangeId по умолчанию null — старые вызовы без этих полей не ломаются", () => {
  const draft = service.startWorkoutDraft({ date: "2026-06-01", snapshot: snapshot() }).draft!;
  assert.equal(draft.snapshot.origin, "original");
  assert.equal(draft.snapshot.scheduleChangeId, null);
});

test("origin='scheduled' и scheduleChangeId сохраняются и читаются обратно без изменений", () => {
  const draft = service.startWorkoutDraft({ date: "2026-06-02", snapshot: snapshot({ origin: "scheduled", scheduleChangeId: 42 }) }).draft!;
  assert.equal(draft.snapshot.origin, "scheduled");
  assert.equal(draft.snapshot.scheduleChangeId, 42);
});

test("некорректный origin по значению отбрасывается к 'original', а не принимается как есть", () => {
  const draft = service.startWorkoutDraft({ date: "2026-06-03", snapshot: snapshot({ origin: "bogus" }) }).draft!;
  assert.equal(draft.snapshot.origin, "original");
});

test("snapshot не меняется после последующего редактирования недели (другого дня)", () => {
  const draft = service.startWorkoutDraft({ date: "2026-06-04", snapshot: snapshot({ origin: "scheduled", scheduleChangeId: 1 }) }).draft!;
  // Черновик на 2026-06-04 открыт (активен), поэтому сам этот день редактировать
  // нельзя (см. lib/week-schedule-service.ts); редактируем соседний день недели —
  // snapshot уже созданного черновика не должен зависеть от последующих правок недели.
  const result = weekService.applyRest({ date: "2026-06-05", reasonCode: "mood", todayIso: "2026-06-04" });
  assert.equal(result.ok, true);
  const reloaded = (db.prepare("SELECT snapshot FROM workout_drafts WHERE id=?").get(draft.id) as any);
  const parsed = JSON.parse(reloaded.snapshot);
  assert.equal(parsed.title, "Бассейн");
  assert.equal(parsed.origin, "scheduled");
});
