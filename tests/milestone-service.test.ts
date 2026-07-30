import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-milestone-service-"));
const { db } = await import("@/lib/db.ts");
const { listManualMilestones, createManualMilestone, updateManualMilestone, deleteManualMilestone } = await import("@/lib/milestone-service.ts");

test("миграция v13: таблица milestones существует", () => {
  const row = db.prepare("SELECT 1 FROM schema_migrations WHERE version=13").get();
  assert.ok(row);
  const cols = (db.prepare("PRAGMA table_info(milestones)").all() as any[]).map(c => c.name);
  assert.ok(cols.includes("occurred_at") && cols.includes("title") && cols.includes("note") && cols.includes("category"));
});

test("CRUD ручных вех: create/list/update/delete", () => {
  assert.equal(listManualMilestones().length, 0);

  const created = createManualMilestone({ occurredAt: "2026-07-15", title: "Первый забег 5 км", note: "Было тяжело, но добежал", category: "тренировки" });
  assert.equal(created.ok, true);

  const list1 = listManualMilestones();
  assert.equal(list1.length, 1);
  assert.equal(list1[0].title, "Первый забег 5 км");
  assert.equal(list1[0].category, "тренировки");

  const id = list1[0].id;
  const updated = updateManualMilestone({ id, occurredAt: "2026-07-16", title: "Первый забег 5 км (уточнено)", note: "", category: "личное" });
  assert.equal(updated.ok, true);

  const list2 = listManualMilestones();
  assert.equal(list2.length, 1);
  assert.equal(list2[0].title, "Первый забег 5 км (уточнено)");
  assert.equal(list2[0].occurredAt, "2026-07-16");
  assert.equal(list2[0].category, "личное");

  const deleted = deleteManualMilestone(id);
  assert.equal(deleted.ok, true);
  assert.equal(listManualMilestones().length, 0);
});

test("создание без даты/заголовка отклоняется", () => {
  const noDate = createManualMilestone({ title: "Веха" });
  assert.equal(noDate.ok, false);
  const noTitle = createManualMilestone({ occurredAt: "2026-07-15", title: "" });
  assert.equal(noTitle.ok, false);
});

test("обновление несуществующей вехи -> 404", () => {
  const result = updateManualMilestone({ id: 999999, occurredAt: "2026-07-15", title: "X" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 404);
});

test("удаление несуществующей вехи -> 404, некорректный id -> 400", () => {
  const missing = deleteManualMilestone(999999);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);
  const invalid = deleteManualMilestone("не число");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.status, 400);
});

test("неизвестная категория подставляется как 'личное', а не падает", () => {
  const created = createManualMilestone({ occurredAt: "2026-07-15", title: "Тест", category: "выдуманная-категория" });
  assert.equal(created.ok, true);
  const list = listManualMilestones();
  assert.equal(list[list.length - 1].category, "личное");
});
