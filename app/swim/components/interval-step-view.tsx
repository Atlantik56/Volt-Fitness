import { GlassPanel } from "./glass-panel";
import { intervalTypeLabel, intervalTotalMeters, type SwimIntervalStepView } from "@/lib/swim/workout-engine";
import { formatMeters } from "@/lib/swim-metrics";

// Экран у бортика: без decorative motion, крупные значения, один явный фокус —
// текущий интервал. Совпадает с ограничением ANIMATIONS.md (Hero/переходы —
// не здесь) и требованием "без анимаций, отвлекающих во время плавания".
export function IntervalStepView({ step, next }: { step: SwimIntervalStepView; next: SwimIntervalStepView | null }) {
  const { interval } = step;
  return (
    <GlassPanel variant="raised" style={{ padding: "clamp(20px, 4vw, 36px)" }}>
      <p className="swim-eyebrow" style={{ marginBottom: 8 }}>
        ИНТЕРВАЛ {step.index + 1} ИЗ {step.total} · {intervalTypeLabel(interval.type).toUpperCase()}
      </p>
      <h2 style={{ fontSize: "clamp(32px, 5vw, 52px)", margin: "0 0 16px", lineHeight: 1.02 }}>
        {interval.repeats > 1 ? `${interval.repeats}×${Math.round(interval.distanceMeters)} м` : `${Math.round(interval.distanceMeters)} м`}
      </h2>
      <p style={{ fontSize: 20, margin: "0 0 4px", fontWeight: 700 }}>{step.exerciseName}</p>
      <p style={{ color: "var(--swim-text-muted)", fontSize: 16, margin: "0 0 20px", maxWidth: "60ch" }}>{interval.description}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 15 }}>
        <span>
          <b>Всего в интервале:</b> {formatMeters(intervalTotalMeters(interval)) ?? "—"}
        </span>
        <span>
          <b>Отдых:</b> {interval.restSeconds ? `${interval.restSeconds} сек` : "без отдыха"}
        </span>
        {interval.equipment.length > 0 && (
          <span>
            <b>Инвентарь:</b> {interval.equipment.join(", ")}
          </span>
        )}
      </div>
      {next && (
        <p style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--swim-border)", color: "var(--swim-text-muted)", fontSize: 14 }}>
          Далее: {next.interval.repeats > 1 ? `${next.interval.repeats}×${Math.round(next.interval.distanceMeters)} м` : `${Math.round(next.interval.distanceMeters)} м`} · {next.exerciseName}
        </p>
      )}
    </GlassPanel>
  );
}
