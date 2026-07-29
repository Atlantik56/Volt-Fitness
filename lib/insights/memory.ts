// AI-5 — Coach Memory: чистая детерминированная логика (docs/MEMORY_ENGINE.md).
// Никакого React, API или прямого доступа к БД — только преобразования плоских
// объектов. Хранение (lib/insight-memory-store.ts) вызывает эти функции и само
// решает, как читать/писать insight_log.
//
// Продуктовые решения (зафиксированы в docs/ROADMAP_AI.md, раздел AI-5):
// - COOLDOWN_DAYS=7 — и для повтора той же evidence-версии, и для показа новой
//   evidence-версии как "обновления" (если прежняя версия не была dismissed).
// - DISMISS_COOLDOWN_DAYS=7 — новая evidence-версия после dismiss прежней.
// - Смена sourceRevision показывает инсайт немедленно, без cooldown.
// - SAFETY_INSIGHT_IDS сейчас пуст (в Insight Layer нет медицинских
//   предупреждений — они отдельно в CoachDecision/readiness, вне AI-4/AI-5),
//   но механизм активен: любой будущий id в этом множестве не может быть
//   скрыт dismiss навсегда — только на SAFETY_DISMISS_COOLDOWN_DAYS.

export const COOLDOWN_DAYS = 7;
export const DISMISS_COOLDOWN_DAYS = 7;
export const SAFETY_DISMISS_COOLDOWN_DAYS = 1;
export const SAFETY_INSIGHT_IDS: ReadonlySet<string> = new Set();
// Повторные/конкурентные вызовы markInsightShown в пределах этого окна
// считаются ОДНИМ фактическим показом (например двойной вызов React
// StrictMode-эффекта или сетевой ретрай) — show_count не растёт дважды.
export const SHOWN_DEDUP_WINDOW_SECONDS = 5;

export type MemoryRecord = {
  insightId: string;
  evidenceHash: string;
  sourceRevision: string;
  firstShownAt: string | null;
  lastShownAt: string | null;
  dismissedAt: string | null;
  resolvedAt: string | null;
  showCount: number;
} | null; // null — пары insight_id+evidence_hash ещё не было в журнале

export type ShowDecisionKind =
  | "new" // insight_id встречается впервые
  | "repeat" // та же evidence-версия, cooldown обычного повтора прошёл
  | "update" // новая evidence-версия (или сменилась sourceRevision)
  | "suppressed-repeat" // та же версия, cooldown обычного повтора ещё не прошёл
  | "suppressed-dismissed" // версия скрыта пользователем, cooldown ещё не прошёл
  | "suppressed-resolved"; // паттерн разрешён, нового evidence/revision нет

export type ShowDecision = { show: boolean; kind: ShowDecisionKind };

type InsightRef = { id: string; evidenceHash: string; sourceRevision: string };

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / 86400000;
}

// exactRecord — состояние ИМЕННО этой пары (insight_id, evidence_hash), если
// она уже встречалась. latestForId — самая свежая запись для этого insight_id
// под ЛЮБЫМ evidence_hash (нужна, чтобы решить про cooldown обновления/dismiss,
// когда для точной пары записи ещё нет).
export function shouldShowInsight(insight: InsightRef, exactRecord: MemoryRecord, latestForId: MemoryRecord, now: Date, safetyIds: ReadonlySet<string> = SAFETY_INSIGHT_IDS): ShowDecision {
  const isSafety = safetyIds.has(insight.id);
  const revisionChanged = (record: NonNullable<MemoryRecord>) => record.sourceRevision !== insight.sourceRevision;

  if (exactRecord) {
    if (exactRecord.resolvedAt != null) {
      if (revisionChanged(exactRecord)) return { show: true, kind: "update" };
      return { show: false, kind: "suppressed-resolved" };
    }
    if (exactRecord.dismissedAt != null) {
      if (revisionChanged(exactRecord)) return { show: true, kind: "update" };
      if (isSafety) {
        if (daysSince(exactRecord.dismissedAt, now) >= SAFETY_DISMISS_COOLDOWN_DAYS) return { show: true, kind: "repeat" };
      }
      return { show: false, kind: "suppressed-dismissed" };
    }
    if (exactRecord.lastShownAt != null) {
      if (daysSince(exactRecord.lastShownAt, now) < COOLDOWN_DAYS) return { show: false, kind: "suppressed-repeat" };
      return { show: true, kind: "repeat" };
    }
    return { show: true, kind: "new" };
  }

  // Новая evidence-версия (для этой пары ещё нет записи).
  if (!latestForId) return { show: true, kind: "new" };
  if (revisionChanged(latestForId)) return { show: true, kind: "update" };

  if (latestForId.dismissedAt != null) {
    if (daysSince(latestForId.dismissedAt, now) < DISMISS_COOLDOWN_DAYS) return { show: false, kind: "suppressed-dismissed" };
    return { show: true, kind: "update" };
  }
  if (latestForId.resolvedAt != null) return { show: true, kind: "update" }; // resolved, но пришло новое evidence
  if (latestForId.lastShownAt != null) {
    if (daysSince(latestForId.lastShownAt, now) < COOLDOWN_DAYS) return { show: false, kind: "suppressed-repeat" };
    return { show: true, kind: "update" };
  }
  return { show: true, kind: "update" };
}

// Идемпотентно: повторный вызов в пределах SHOWN_DEDUP_WINDOW_SECONDS — no-op
// (тот же фактический показ), не двойной инкремент show_count.
export function markInsightShown(record: MemoryRecord, ref: InsightRef, now: Date): NonNullable<MemoryRecord> {
  const nowIso = now.toISOString();
  if (!record) {
    return { insightId: ref.id, evidenceHash: ref.evidenceHash, sourceRevision: ref.sourceRevision, firstShownAt: nowIso, lastShownAt: nowIso, dismissedAt: null, resolvedAt: null, showCount: 1 };
  }
  if (record.lastShownAt != null) {
    const deltaSec = (now.getTime() - Date.parse(record.lastShownAt)) / 1000;
    if (deltaSec >= 0 && deltaSec < SHOWN_DEDUP_WINDOW_SECONDS) return record;
  }
  return {
    ...record,
    sourceRevision: ref.sourceRevision,
    firstShownAt: record.firstShownAt ?? nowIso,
    lastShownAt: nowIso,
    showCount: record.showCount + 1,
    // Раз этот показ вообще случился (shouldShowInsight его разрешил), любое
    // прежнее dismissed/resolved состояние ЭТОЙ ТОЧНОЙ пары устарело.
    dismissedAt: null,
    resolvedAt: null,
  };
}

// Идемпотентно: если версия уже была dismissed, сохраняем ПЕРВЫЙ dismissedAt,
// а не перезаписываем его новым now при повторном вызове.
export function dismissInsight(record: MemoryRecord, ref: InsightRef, now: Date): NonNullable<MemoryRecord> {
  const nowIso = now.toISOString();
  if (!record) return { insightId: ref.id, evidenceHash: ref.evidenceHash, sourceRevision: ref.sourceRevision, firstShownAt: null, lastShownAt: null, dismissedAt: nowIso, resolvedAt: null, showCount: 0 };
  return { ...record, dismissedAt: record.dismissedAt ?? nowIso };
}

// Идемпотентно, тот же принцип, что и dismissInsight.
export function resolveInsight(record: MemoryRecord, ref: InsightRef, now: Date): NonNullable<MemoryRecord> {
  const nowIso = now.toISOString();
  if (!record) return { insightId: ref.id, evidenceHash: ref.evidenceHash, sourceRevision: ref.sourceRevision, firstShownAt: null, lastShownAt: null, dismissedAt: null, resolvedAt: nowIso, showCount: 0 };
  return { ...record, resolvedAt: record.resolvedAt ?? nowIso };
}
