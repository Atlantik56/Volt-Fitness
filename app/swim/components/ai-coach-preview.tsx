import { GlassPanel } from "./glass-panel";
import { SectionHeader } from "./section-header";
import type { SwimInsight } from "@/lib/swim/types";

const PRIORITY_LABEL: Record<SwimInsight["priority"], string> = { low: "Низкий приоритет", medium: "Средний приоритет", high: "Важно" };

// Рендерит контракт lib/swim/insight-service.ts (SwimInsight[]) напрямую —
// getSwimInsights() сейчас всегда возвращает [], поэтому виден только честный
// neutral-текст ниже, но проводка данных та же, что будет использовать
// реальный генератор инсайтов в Sprint 4.
export function AiCoachPreview({ hasHistory, insights }: { hasHistory: boolean; insights: SwimInsight[] }) {
  return (
    <section className="swim-section">
      <SectionHeader eyebrow="RITMOVIS COACH" title="AI Coach" />
      {insights.length > 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          {insights.map((insight) => (
            <GlassPanel key={insight.id} className="swim-coach-preview">
              <span className="swim-coach-marker" aria-hidden="true" />
              <div>
                <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{insight.title}</p>
                <p style={{ margin: "0 0 6px", color: "var(--swim-text-muted)" }}>{insight.description}</p>
                <span className="swim-badge">{PRIORITY_LABEL[insight.priority]}</span>
              </div>
            </GlassPanel>
          ))}
        </div>
      ) : (
        <GlassPanel className="swim-coach-preview">
          <span className="swim-coach-marker" aria-hidden="true" />
          <div>
            <p style={{ margin: "0 0 6px", fontWeight: 700 }}>
              {hasHistory ? "Персональный разбор заплывов появится здесь" : "Coach начнёт анализировать плавание после первых тренировок"}
            </p>
            <p style={{ margin: 0, color: "var(--swim-text-muted)" }}>
              Когда в истории будет достаточно подтверждённых заплывов, RITMOVIS Coach объяснит темп, SWOLF и восстановление на основе твоих данных — без общих советов.
            </p>
          </div>
        </GlassPanel>
      )}
    </section>
  );
}
