import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-insight-memory-store-"));
const { db } = await import("@/lib/db.ts");
const { filterVisibleInsights, markInsightsShown, dismissInsightRecord } = await import("@/lib/insight-memory-store.ts");
const { COOLDOWN_DAYS } = await import("@/lib/insights/memory.ts");
import type { Insight } from "@/lib/insights/types.ts";

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: "weight-plateau", category: "weight", kind: "observation", tone: "info", priority: 2,
    title: "Вес почти не меняется", summary: "текст", confidence: 0.5, evidenceCount: 5,
    evidenceHash: "hash-1", sourceRevision: "ai4-v1", usedSignals: ["measurements.weight"],
    ...overrides,
  };
}

test("миграция v12 записана и таблица insight_log существует", () => {
  const row = db.prepare("SELECT 1 FROM schema_migrations WHERE version=12").get();
  assert.ok(row);
  const cols = (db.prepare("PRAGMA table_info(insight_log)").all() as any[]).map(c => c.name);
  assert.ok(cols.includes("insight_id") && cols.includes("evidence_hash") && cols.includes("show_count"));
});

test("пустой журнал: новый инсайт всегда проходит фильтр (первый запуск)", () => {
  const insights = filterVisibleInsights(db, [makeInsight({ id: "empty-log-test" })], new Date());
  assert.equal(insights.length, 1);
});

test("после markInsightsShown повтор с тем же hash подавляется в течение cooldown", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insight = makeInsight({ id: "repeat-test", evidenceHash: "hash-repeat" });
  markInsightsShown(db, [insight], now);

  const soon = filterVisibleInsights(db, [insight], new Date(now.getTime() + 86400000));
  assert.equal(soon.length, 0);

  const later = filterVisibleInsights(db, [insight], new Date(now.getTime() + (COOLDOWN_DAYS + 1) * 86400000));
  assert.equal(later.length, 1);
});

test("dismiss скрывает конкретную evidence-версию, но новая версия проходит после dismiss-cooldown", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insightV1 = makeInsight({ id: "dismiss-test", evidenceHash: "hash-v1" });
  markInsightsShown(db, [insightV1], now);
  dismissInsightRecord(db, "dismiss-test", "hash-v1", "ai4-v1", now);

  // Тот же hash — остаётся скрытым бессрочно.
  const sameHashLater = filterVisibleInsights(db, [insightV1], new Date(now.getTime() + 365 * 86400000));
  assert.equal(sameHashLater.length, 0);

  // Новая evidence-версия сразу после dismiss — тоже подавлена (dismiss-cooldown).
  const insightV2 = makeInsight({ id: "dismiss-test", evidenceHash: "hash-v2" });
  const tooSoon = filterVisibleInsights(db, [insightV2], new Date(now.getTime() + 86400000));
  assert.equal(tooSoon.length, 0);

  // После dismiss-cooldown новая версия проходит.
  const afterCooldown = filterVisibleInsights(db, [insightV2], new Date(now.getTime() + 8 * 86400000));
  assert.equal(afterCooldown.length, 1);
});

test("resolve: инсайт, пропавший из свежих кандидатов, помечается resolved и не возвращается с тем же hash", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insight = makeInsight({ id: "resolve-test", evidenceHash: "hash-resolve" });
  markInsightsShown(db, [insight], now);

  // Кандидат больше не встречается в свежем списке — auto-resolve.
  filterVisibleInsights(db, [], new Date(now.getTime() + 86400000));
  const row = db.prepare("SELECT resolved_at FROM insight_log WHERE insight_id=? AND evidence_hash=?").get("resolve-test", "hash-resolve") as any;
  assert.ok(row.resolved_at);

  // Тот же hash снова "появился" (гипотетически) — не должен показаться повторно.
  const again = filterVisibleInsights(db, [insight], new Date(now.getTime() + 2 * 86400000));
  assert.equal(again.length, 0);

  // Но новая evidence-версия для того же insight_id — это новое evidence, показывается.
  const updated = makeInsight({ id: "resolve-test", evidenceHash: "hash-resolve-v2" });
  const shows = filterVisibleInsights(db, [updated], new Date(now.getTime() + 3 * 86400000));
  assert.equal(shows.length, 1);
});

test("смена source_revision у dismissed пары показывает инсайт немедленно", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insight = makeInsight({ id: "revision-test", evidenceHash: "hash-rev", sourceRevision: "ai4-v1" });
  markInsightsShown(db, [insight], now);
  dismissInsightRecord(db, "revision-test", "hash-rev", "ai4-v1", now);

  const stillOldRevision = filterVisibleInsights(db, [insight], new Date(now.getTime() + 86400000));
  assert.equal(stillOldRevision.length, 0);

  const newRevisionSameHash = makeInsight({ id: "revision-test", evidenceHash: "hash-rev", sourceRevision: "ai5-v2" });
  const shows = filterVisibleInsights(db, [newRevisionSameHash], new Date(now.getTime() + 86400000));
  assert.equal(shows.length, 1);
});

test("идемпотентный markInsightsShown: повторный вызов в упор не удваивает show_count", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insight = makeInsight({ id: "idempotent-test", evidenceHash: "hash-idem" });
  markInsightsShown(db, [insight], now);
  markInsightsShown(db, [insight], new Date(now.getTime() + 1000)); // 1с спустя — тот же показ

  const row = db.prepare("SELECT show_count showCount FROM insight_log WHERE insight_id=? AND evidence_hash=?").get("idempotent-test", "hash-idem") as any;
  assert.equal(row.showCount, 1);
});

test("конкурентные/повторные запросы markInsightsShown не создают дублирующих строк (UNIQUE upsert)", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insight = makeInsight({ id: "concurrent-test", evidenceHash: "hash-concurrent" });
  // Симуляция двух "почти одновременных" запросов на один и тот же показ.
  markInsightsShown(db, [insight], now);
  markInsightsShown(db, [insight], now);
  const rows = db.prepare("SELECT * FROM insight_log WHERE insight_id=? AND evidence_hash=?").all("concurrent-test", "hash-concurrent");
  assert.equal(rows.length, 1);
});

test("ошибка БД (отсутствующая таблица) пробрасывается наружу — вызывающий код (route) обязан fallback'нуться", () => {
  db.exec("DROP TABLE insight_log");
  assert.throws(() => filterVisibleInsights(db, [makeInsight({ id: "broken-db-test" })], new Date()));
  // Восстанавливаем таблицу для последующих тестов в этом файле.
  db.exec(`CREATE TABLE insight_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, insight_id TEXT NOT NULL, evidence_hash TEXT NOT NULL,
    source_revision TEXT NOT NULL, first_shown_at TEXT, last_shown_at TEXT, dismissed_at TEXT,
    resolved_at TEXT, show_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec("CREATE UNIQUE INDEX idx_insight_log_pair ON insight_log(insight_id, evidence_hash)");
});

// ---------------------------------------------------------------------------
// Маркер "Обновлено" (isUpdate) — решение принимает Memory (kind==="update"
// в shouldShowInsight), не UI.

test("isUpdate=false у первого показа нового insight_id", () => {
  const [shown] = filterVisibleInsights(db, [makeInsight({ id: "update-badge-new", evidenceHash: "hash-a" })], new Date("2026-08-01T10:00:00Z"));
  assert.equal(shown.isUpdate, false);
});

test("isUpdate=false у обычного повтора той же evidence-версии после cooldown", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insight = makeInsight({ id: "update-badge-repeat", evidenceHash: "hash-b" });
  markInsightsShown(db, [insight], now);
  const [shown] = filterVisibleInsights(db, [insight], new Date(now.getTime() + (COOLDOWN_DAYS + 1) * 86400000));
  assert.equal(shown.isUpdate, false);
});

test("isUpdate=true у новой evidence-версии после dismiss-cooldown", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const v1 = makeInsight({ id: "update-badge-dismiss", evidenceHash: "hash-c1" });
  markInsightsShown(db, [v1], now);
  dismissInsightRecord(db, "update-badge-dismiss", "hash-c1", "ai4-v1", now);
  const v2 = makeInsight({ id: "update-badge-dismiss", evidenceHash: "hash-c2" });
  const [shown] = filterVisibleInsights(db, [v2], new Date(now.getTime() + 8 * 86400000));
  assert.equal(shown.isUpdate, true);
});

test("isUpdate=true у новой evidence-версии после обычного cooldown (без dismiss)", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const v1 = makeInsight({ id: "update-badge-plain", evidenceHash: "hash-d1" });
  markInsightsShown(db, [v1], now);
  const v2 = makeInsight({ id: "update-badge-plain", evidenceHash: "hash-d2" });
  const [shown] = filterVisibleInsights(db, [v2], new Date(now.getTime() + (COOLDOWN_DAYS + 1) * 86400000));
  assert.equal(shown.isUpdate, true);
});

test("isUpdate=true при смене source_revision у dismissed пары (без cooldown)", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const insight = makeInsight({ id: "update-badge-revision", evidenceHash: "hash-e", sourceRevision: "ai4-v1" });
  markInsightsShown(db, [insight], now);
  dismissInsightRecord(db, "update-badge-revision", "hash-e", "ai4-v1", now);
  const newRevision = makeInsight({ id: "update-badge-revision", evidenceHash: "hash-e", sourceRevision: "ai5-v2" });
  const [shown] = filterVisibleInsights(db, [newRevision], new Date(now.getTime() + 86400000));
  assert.equal(shown.isUpdate, true);
});

test("различение null/0/undefined: show_count=0 у только что dismissed без предварительного показа — не путается с отсутствием записи", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  dismissInsightRecord(db, "never-shown-test", "hash-x", "ai4-v1", now);
  const row = db.prepare("SELECT show_count showCount, first_shown_at firstShownAt, dismissed_at dismissedAt FROM insight_log WHERE insight_id=?").get("never-shown-test") as any;
  assert.equal(row.showCount, 0);
  assert.equal(row.firstShownAt, null);
  assert.ok(row.dismissedAt);
});
