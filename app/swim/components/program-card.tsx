import Link from "next/link";
import { GlassPanel } from "./glass-panel";
import { StatusBadge } from "./status-badge";

const LEVEL_LABEL: Record<string, string> = { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" };

export type ProgramSummary = {
  id: string;
  name: string;
  description: string;
  level: string;
  status: "available" | "coming_soon";
  completedCount: number;
  totalCount: number;
};

export function ProgramCard({ program }: { program: ProgramSummary }) {
  const isAvailable = program.status === "available";
  const body = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h4 style={{ margin: "0 0 6px", fontSize: 20 }}>{program.name}</h4>
        <StatusBadge tone={isAvailable ? "synced" : "neutral"}>{isAvailable ? "Доступна" : "Скоро"}</StatusBadge>
      </div>
      <p style={{ color: "var(--swim-text-muted)", margin: "0 0 12px", minHeight: 40 }}>{program.description}</p>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--swim-text-muted)" }}>
        <span>{LEVEL_LABEL[program.level] ?? program.level}</span>
        {isAvailable && <span>{program.completedCount}/{program.totalCount} тренировок</span>}
      </div>
    </>
  );

  if (!isAvailable) {
    return (
      <GlassPanel style={{ padding: 20, opacity: 0.6 }} aria-label={`${program.name}: скоро`}>
        {body}
      </GlassPanel>
    );
  }
  return (
    <GlassPanel as={Link} href={`/swim/workouts/${program.id}`} variant="interactive" style={{ padding: 20, display: "block", textDecoration: "none", color: "inherit" }}>
      {body}
    </GlassPanel>
  );
}
