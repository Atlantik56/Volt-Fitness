import { GlassPanel } from "./glass-panel";
import { SectionHeader } from "./section-header";
import { formatKm } from "@/lib/swim-metrics";
import type { SwimWeeklyActivityView } from "@/app/swim/types";

export function WeeklyActivityCard({ weeklyActivity, loading }: { weeklyActivity: SwimWeeklyActivityView; loading: boolean }) {
  const distanceLabel = formatKm(weeklyActivity.totalDistanceMeters);
  return (
    <section className="swim-section">
      <SectionHeader eyebrow="ЭТА НЕДЕЛЯ" title="Недельная активность" />
      <GlassPanel style={{ padding: 20 }}>
        {loading ? (
          <>
            <div className="swim-loading-line" style={{ width: "50%", marginBottom: 10 }} />
            <div className="swim-loading-line" style={{ width: "30%" }} />
          </>
        ) : weeklyActivity.swimCount === 0 ? (
          <p style={{ color: "var(--swim-text-muted)", margin: 0 }}>На этой неделе подтверждённых заплывов ещё нет.</p>
        ) : (
          <>
            <p className="swim-metric-value" style={{ marginBottom: 4 }}>
              {weeklyActivity.swimCount} {plural(weeklyActivity.swimCount)}
            </p>
            <p style={{ color: "var(--swim-text-muted)", margin: 0 }}>{distanceLabel ?? "Нет данных"} за неделю</p>
          </>
        )}
      </GlassPanel>
    </section>
  );
}

function plural(n: number) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заплыв";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "заплыва";
  return "заплывов";
}
