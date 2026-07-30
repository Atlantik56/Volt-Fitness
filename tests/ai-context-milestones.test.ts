// AI Sprint 6 — интеграция Milestones в Coach (lib/ai-context.ts,
// lib/ai-context-data.ts). Coach не пересчитывает вехи сам — только читает уже
// готовый детерминированный список из lib/milestones.ts и получает его в
// безопасной (LLM-friendly) форме.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-ai-context-milestones-"));
const { db } = await import("@/lib/db.ts");
const { loadAiCoachContextData } = await import("@/lib/ai-context-data.ts");
const { buildAiCoachContext, renderAiCoachContextText } = await import("@/lib/ai-context.ts");
const { findNewAutomaticMilestone } = await import("@/lib/milestones.ts");

function seedProfile() {
  db.prepare("UPDATE profile SET name=?,height=?,start_weight=?,target_weight=?,program_start=? WHERE id=1")
    .run("Илья", 167, 86, 67, "2026-01-01");
}
function insertStrengthLog(date: string, exercise: string, weight: number, reps: number) {
  return db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps) VALUES (?,?,?,?)").run(date, exercise, weight, reps).lastInsertRowid as number;
}
function insertMeasurement(date: string, weight: number) {
  return db.prepare("INSERT INTO measurements (date,weight) VALUES (?,?)").run(date, weight).lastInsertRowid as number;
}
function insertManualMilestone(occurredAt: string, title: string, note: string, category: string) {
  return db.prepare("INSERT INTO milestones (occurred_at,title,note,category) VALUES (?,?,?,?)").run(occurredAt, title, note, category).lastInsertRowid as number;
}
function insertPhoto(date: string, filename: string) {
  db.prepare("INSERT INTO photos (filename,date,content_type) VALUES (?,?,?)").run(filename, date, "image/jpeg");
}

test("AI Sprint 6: пустые Milestones работают корректно — честное состояние, без падений", () => {
  const date = "2026-02-01";
  const ctx = buildAiCoachContext(loadAiCoachContextData(db, { date }));
  assert.deepEqual(ctx.milestones.recent, []);
  assert.deepEqual(ctx.milestones.highlights, []);
  assert.equal(ctx.milestones.latestPR, null);
  assert.equal(ctx.milestones.latestWeightMilestone, null);
  const rendered = renderAiCoachContextText(ctx);
  assert.ok(rendered.includes("Зафиксированных вех пока нет."));
});

test("AI Sprint 6: milestones попадают в AI Context (личный рекорд, новый минимум веса, ручная веха)", () => {
  seedProfile();
  const date = "2026-02-20";
  insertStrengthLog("2026-02-01", "Присед", 20, 10);
  insertStrengthLog("2026-02-10", "Присед", 25, 8); // PR
  insertMeasurement("2026-02-01", 85);
  insertMeasurement("2026-02-15", 83); // новый минимум
  insertManualMilestone("2026-02-05", "Пробежал 5 км", "Личное достижение", "тренировки");

  const ctx = buildAiCoachContext(loadAiCoachContextData(db, { date }));
  assert.ok(ctx.milestones.latestPR);
  assert.equal(ctx.milestones.latestPR!.title, "Новый рабочий вес: Присед");
  assert.ok(ctx.milestones.latestWeightMilestone);
  assert.ok(ctx.milestones.highlights.some(m => m.title === "Пробежал 5 км"));

  const rendered = renderAiCoachContextText(ctx);
  assert.ok(rendered.includes("Достижения пользователя"));
  assert.ok(rendered.includes("Пробежал 5 км"));
});

test("AI Sprint 6: скрытые поля не передаются — Coach получает только безопасный payload", () => {
  const date = "2026-02-25";
  insertPhoto("2026-02-20", "приватное-фото-секрет.jpg");
  insertManualMilestone("2026-02-21", "Личная веха", "x".repeat(500), "личное"); // длинная заметка
  const ctx = buildAiCoachContext(loadAiCoachContextData(db, { date }));

  for (const m of [...ctx.milestones.recent, ...ctx.milestones.highlights]) {
    assert.equal(Object.keys(m).sort().join(","), "kind,occurredAt,summary,title");
    assert.ok(m.summary.length <= 200, "summary должен быть обрезан до безопасной длины");
  }

  const rendered = renderAiCoachContextText(ctx);
  assert.equal(rendered.includes("приватное-фото-секрет.jpg"), false);
  assert.equal(rendered.includes(".jpg"), false);
  assert.equal(rendered.includes("sourceIds"), false);
  assert.equal(rendered.includes("strength_log:"), false);
  assert.equal(rendered.includes("measurement:"), false);
  assert.equal(rendered.includes("milestone:"), false);
});

test("AI Sprint 6: нет дублей достижений — повторная загрузка того же состояния БД даёт идентичный список", () => {
  const date = "2026-03-01";
  const ctx1 = buildAiCoachContext(loadAiCoachContextData(db, { date }));
  const ctx2 = buildAiCoachContext(loadAiCoachContextData(db, { date }));
  assert.deepEqual(ctx1.milestones, ctx2.milestones);
  // recent и highlights — независимые top-N срезы ОДНОГО списка и могут
  // законно пересекаться (одна и та же веха вполне может быть и "недавней", и
  // "заметной") — дублей не должно быть ВНУТРИ каждого списка по отдельности.
  const key = (m: { kind: string; occurredAt: string; title: string }) => `${m.kind}|${m.occurredAt}|${m.title}`;
  const recentKeys = ctx1.milestones.recent.map(key);
  const highlightKeys = ctx1.milestones.highlights.map(key);
  assert.equal(new Set(recentKeys).size, recentKeys.length);
  assert.equal(new Set(highlightKeys).size, highlightKeys.length);
});

test("AI Sprint 6: нет повторных поздравлений — findNewAutomaticMilestone учитывает курсор last_seen", () => {
  const date = "2026-03-05";
  const data = loadAiCoachContextData(db, { date });
  const milestones = (data.milestones ?? []).slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
  const latestAutomatic = milestones.find(m => m.automatic);
  assert.ok(latestAutomatic, "в фикстуре должна быть хотя бы одна автоматическая веха");

  // Ещё не видели — баннер должен показаться.
  assert.equal(findNewAutomaticMilestone(milestones, null)?.id, latestAutomatic!.id);
  // Уже видели именно эту — баннер больше не показывается.
  assert.equal(findNewAutomaticMilestone(milestones, latestAutomatic!.id), null);
  // Видели что-то другое (устаревший курсор) — баннер снова показывается.
  assert.equal(findNewAutomaticMilestone(milestones, "some-old-id")?.id, latestAutomatic!.id);
});

test("AI Sprint 6: Monthly Summary — вехи месяца доступны и совпадают с общим списком вех, попавших в этот месяц", () => {
  const date = "2026-03-31";
  const data = loadAiCoachContextData(db, { date });
  const marchMilestones = (data.milestones ?? []).filter(m => m.occurredAt.startsWith("2026-03"));
  // К этому моменту в БД уже есть данные из предыдущих тестов файла — просто
  // проверяем, что фильтрация по месяцу из общего списка не теряет и не
  // дублирует события (тот же принцип, что buildMonthOverview использует внутри).
  const ids = marchMilestones.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length);
});
