import { GlassPanel } from "./glass-panel";
import { SectionHeader } from "./section-header";
import { EmptyState } from "./empty-state";
import { StatusBadge } from "./status-badge";
import { formatDuration, formatMeters } from "@/lib/swim-metrics";
import type { SwimLastSwimView } from "@/app/swim/types";

export function LastSwimCard({ lastSwim, loading }: { lastSwim: SwimLastSwimView; loading: boolean }) {
  return (
    <section className="swim-section">
      <SectionHeader eyebrow="ИСТОРИЯ" title="Последний заплыв" />
      {loading ? (
        <GlassPanel style={{ padding: 20 }}>
          <div className="swim-loading-line" style={{ width: "60%", marginBottom: 10 }} />
          <div className="swim-loading-line" style={{ width: "40%" }} />
        </GlassPanel>
      ) : !lastSwim ? (
        <EmptyState title="Заплывов пока нет" description="Как только тренировка будет подтверждена или импортирована из внешнего источника, она появится здесь." />
      ) : (
        <GlassPanel style={{ padding: "18px 20px", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <p className="swim-metric-label">{lastSwim.date}</p>
            <p className="swim-metric-value">
              {formatMeters(lastSwim.distanceMeters ?? 0) ?? <span className="swim-metric-nodata">Нет данных</span>}
            </p>
          </div>
          <div>
            <p className="swim-metric-label">Длительность</p>
            <p className="swim-metric-value">{formatDuration(lastSwim.durationSeconds ?? 0) ?? <span className="swim-metric-nodata">Нет данных</span>}</p>
          </div>
          <div>
            <p className="swim-metric-label">Темп / 100м</p>
            <p className="swim-metric-value">{lastSwim.paceLabel ?? <span className="swim-metric-nodata">Нет данных</span>}</p>
          </div>
          <div>
            <p className="swim-metric-label">Бассейн</p>
            <p className="swim-metric-value">{lastSwim.poolLengthMeters ? `${lastSwim.poolLengthMeters} м` : <span className="swim-metric-nodata">Нет данных</span>}</p>
          </div>
          <StatusBadge tone={lastSwim.source === "imported_metric" ? "synced" : "neutral"}>
            {lastSwim.source === "manual" ? "Вручную" : lastSwim.provider === "strava" ? "Strava" : lastSwim.provider === "garmin_fit" ? "Garmin" : "Импорт"}
          </StatusBadge>
          {lastSwim.notes && (
            <p style={{ flexBasis: "100%", margin: "4px 0 0", color: "var(--swim-text-muted)", fontSize: 14 }}>«{lastSwim.notes}»</p>
          )}
        </GlassPanel>
      )}
    </section>
  );
}
