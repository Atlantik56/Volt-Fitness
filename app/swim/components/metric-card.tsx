import { GlassPanel } from "./glass-panel";

export function MetricCard({
  label,
  value,
  unit,
  period,
}: {
  label: string;
  value: string | null;
  unit?: string;
  period?: string;
}) {
  return (
    <GlassPanel className="swim-metric-card" aria-label={`${label}: ${value ?? "нет данных"}`}>
      <p className="swim-metric-label">{label}</p>
      {value ? (
        <p className="swim-metric-value">
          {value}
          {unit && <span>{unit}</span>}
        </p>
      ) : (
        <p className="swim-metric-nodata">Нет данных</p>
      )}
      {period && <p className="swim-metric-label" style={{ marginTop: 6, marginBottom: 0 }}>{period}</p>}
    </GlassPanel>
  );
}
