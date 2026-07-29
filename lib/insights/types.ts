// AI-4 — единый контракт Insight Layer (docs/INSIGHT_ENGINE.md).
// Это только тип и его инварианты — сами данные по-прежнему считают
// существующие детерминированные модули (coach-insights, evening, mood).

export type InsightCategory = "weight" | "training" | "nutrition" | "consistency" | "mood" | "evening";
export type InsightKind = "observation" | "pattern" | "milestone";
// tone/priority — не часть контракта AI_INSIGHT_ENGINE.md, добавлены явно, т.к.
// существующий UI (CoachCard) уже их требует (см. docs/INSIGHT_ENGINE.md "Единый контракт").
export type InsightTone = "good" | "warn" | "info";

export type Insight = {
  id: string;
  category: InsightCategory;
  kind: InsightKind;
  tone: InsightTone;
  priority: number;
  title: string;
  summary: string;
  confidence: number; // 0..1, вычислен локально из размера доказательной базы
  evidenceCount: number;
  evidenceHash: string;
  periodStart?: string;
  periodEnd?: string;
  usedSignals: string[];
  suggestionKey?: string;
};
