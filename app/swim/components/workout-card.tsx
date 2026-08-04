import Link from "next/link";
import { GlassPanel } from "./glass-panel";
import { StatusBadge } from "./status-badge";
import { formatMeters } from "@/lib/swim-metrics";

const LEVEL_LABEL: Record<string, string> = { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" };
const STATUS_LABEL: Record<string, string> = { not_started: "Не начата", in_progress: "Идёт", awaiting_confirmation: "Ожидает подтверждения", completed: "Завершена" };
const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "synced"> = { not_started: "neutral", in_progress: "synced", awaiting_confirmation: "warning", completed: "success" };

export function WorkoutCard({
  programId,
  workoutId,
  title,
  goal,
  distanceMeters,
  estimatedMinutes,
  intervalCount,
  level,
  status,
}: {
  programId: string;
  workoutId: string;
  title: string;
  goal: string;
  distanceMeters: number;
  estimatedMinutes: number;
  intervalCount: number;
  level: string;
  status: string;
}) {
  return (
    <GlassPanel as={Link} href={`/swim/workouts/${programId}/${workoutId}`} variant="interactive" style={{ padding: 18, display: "block", textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <h4 style={{ margin: 0, fontSize: 18 }}>{title}</h4>
        <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</StatusBadge>
      </div>
      <p style={{ color: "var(--swim-text-muted)", margin: "0 0 12px" }}>{goal}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 13, color: "var(--swim-text-muted)" }}>
        <span>{formatMeters(distanceMeters) ?? "Нет данных"}</span>
        <span>~{estimatedMinutes} мин</span>
        <span>{intervalCount} интервалов</span>
        <span>{LEVEL_LABEL[level] ?? level}</span>
      </div>
    </GlassPanel>
  );
}
