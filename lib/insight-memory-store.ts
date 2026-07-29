// AI-5 — Coach Memory: слой хранения поверх insight_log (миграция v12,
// lib/db.ts). Единственное место, где чистые функции lib/insights/memory.ts
// встречаются с SQLite. Сам не принимает решений «показывать/не показывать» —
// только читает/пишет MemoryRecord и вызывает чистые операции.
import type Database from "better-sqlite3";
import { markInsightShown, dismissInsight, resolveInsight, shouldShowInsight, type MemoryRecord } from "./insights/memory.ts";
import type { Insight } from "./insights/types.ts";

type Row = {
  insight_id: string; evidence_hash: string; source_revision: string;
  first_shown_at: string | null; last_shown_at: string | null;
  dismissed_at: string | null; resolved_at: string | null; show_count: number;
};

function rowToRecord(row: Row | undefined): MemoryRecord {
  if (!row) return null;
  return {
    insightId: row.insight_id, evidenceHash: row.evidence_hash, sourceRevision: row.source_revision,
    firstShownAt: row.first_shown_at, lastShownAt: row.last_shown_at,
    dismissedAt: row.dismissed_at, resolvedAt: row.resolved_at, showCount: row.show_count,
  };
}

function getExact(db: Database.Database, insightId: string, evidenceHash: string): MemoryRecord {
  const row = db.prepare("SELECT insight_id,evidence_hash,source_revision,first_shown_at,last_shown_at,dismissed_at,resolved_at,show_count FROM insight_log WHERE insight_id=? AND evidence_hash=?").get(insightId, evidenceHash) as Row | undefined;
  return rowToRecord(row);
}

// Самая свежая запись для insight_id под ЛЮБЫМ evidence_hash (для cooldown
// показа обновления/после dismiss, когда точной пары ещё не было).
function getLatestForInsightId(db: Database.Database, insightId: string): MemoryRecord {
  const row = db.prepare("SELECT insight_id,evidence_hash,source_revision,first_shown_at,last_shown_at,dismissed_at,resolved_at,show_count FROM insight_log WHERE insight_id=? ORDER BY id DESC LIMIT 1").get(insightId) as Row | undefined;
  return rowToRecord(row);
}

function upsert(db: Database.Database, record: NonNullable<MemoryRecord>): void {
  db.prepare(`
    INSERT INTO insight_log (insight_id,evidence_hash,source_revision,first_shown_at,last_shown_at,dismissed_at,resolved_at,show_count)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(insight_id,evidence_hash) DO UPDATE SET
      source_revision=excluded.source_revision, first_shown_at=excluded.first_shown_at,
      last_shown_at=excluded.last_shown_at, dismissed_at=excluded.dismissed_at,
      resolved_at=excluded.resolved_at, show_count=excluded.show_count
  `).run(record.insightId, record.evidenceHash, record.sourceRevision, record.firstShownAt, record.lastShownAt, record.dismissedAt, record.resolvedAt, record.showCount);
}

// Фильтрует кандидатов по Memory (без записи show — только чтение +
// auto-resolve пропавших) и возвращает то, что реально можно показать сейчас.
// Конкурентные вызовы безопасны: сама фильтрация ничего не пишет, кроме
// auto-resolve, которое идемпотентно (resolveInsight хранит только первый resolvedAt).
export function filterVisibleInsights(db: Database.Database, candidates: Insight[], now: Date): Insight[] {
  const visible: Insight[] = [];
  const seenInsightIds = new Set<string>();
  for (const insight of candidates) {
    seenInsightIds.add(insight.id);
    const exact = getExact(db, insight.id, insight.evidenceHash);
    const latest = exact ? null : getLatestForInsightId(db, insight.id);
    const decision = shouldShowInsight({ id: insight.id, evidenceHash: insight.evidenceHash, sourceRevision: insight.sourceRevision }, exact, latest, now);
    // isUpdate — решение Memory (kind==="update": новый evidence_hash или смена
    // source_revision после того, как этот insight_id уже был активен), а не
    // UI и не Insight Layer. Первый показ и обычный повтор той же версии — false.
    if (decision.show) visible.push({ ...insight, isUpdate: decision.kind === "update" });
  }

  // Auto-resolve: insight_id, который раньше был активен (показан, не dismissed
  // и не resolved), но пропал из свежего списка кандидатов целиком — паттерн
  // перестал быть актуальным (docs/MEMORY_ENGINE.md: "resolved_at — паттерн
  // перестал быть актуальным или цель достигнута").
  const activeRows = db.prepare("SELECT insight_id,evidence_hash,source_revision,first_shown_at,last_shown_at,dismissed_at,resolved_at,show_count FROM insight_log WHERE dismissed_at IS NULL AND resolved_at IS NULL AND last_shown_at IS NOT NULL").all() as Row[];
  for (const row of activeRows) {
    if (seenInsightIds.has(row.insight_id)) continue;
    const record = rowToRecord(row)!;
    const resolved = resolveInsight(record, { id: row.insight_id, evidenceHash: row.evidence_hash, sourceRevision: row.source_revision }, now);
    upsert(db, resolved);
  }

  return visible;
}

// Записывает фактический показ для уже отфильтрованного (видимого) списка.
// Идемпотентно и безопасно при повторных/конкурентных вызовах — см.
// markInsightShown (SHOWN_DEDUP_WINDOW_SECONDS) и ON CONFLICT upsert выше.
export function markInsightsShown(db: Database.Database, insights: Insight[], now: Date): void {
  for (const insight of insights) {
    const existing = getExact(db, insight.id, insight.evidenceHash);
    const updated = markInsightShown(existing, { id: insight.id, evidenceHash: insight.evidenceHash, sourceRevision: insight.sourceRevision }, now);
    upsert(db, updated);
  }
}

export function dismissInsightRecord(db: Database.Database, insightId: string, evidenceHash: string, sourceRevision: string, now: Date): void {
  const existing = getExact(db, insightId, evidenceHash);
  const updated = dismissInsight(existing, { id: insightId, evidenceHash, sourceRevision }, now);
  upsert(db, updated);
}
