"use client";
import Link from "next/link";
import { GlassPanel } from "./glass-panel";
import { StatusBadge } from "./status-badge";
import { formatMeters } from "@/lib/swim-metrics";
import type { SwimNextWorkoutView } from "@/app/swim/types";

const STATUS_LABEL: Record<NonNullable<SwimNextWorkoutView>["status"], string> = {
  not_started: "Запланирована",
  in_progress: "Тренировка идёт",
  awaiting_confirmation: "Ожидает подтверждения",
};
const STATUS_TONE: Record<NonNullable<SwimNextWorkoutView>["status"], "neutral" | "warning" | "synced"> = {
  not_started: "neutral",
  in_progress: "synced",
  awaiting_confirmation: "warning",
};

// Hero — центральный элемент главной страницы (docs/volt-swim/SPRINTS.md):
// либо ближайшая тренировка программы (название, тип, дистанция, оценка
// времени), либо честный empty state со ссылкой на выбор программы.
export function SwimHero({ nextWorkout, loading }: { nextWorkout: SwimNextWorkoutView; loading: boolean }) {
  if (loading) {
    return (
      <GlassPanel as="section" variant="raised" className="swim-hero" aria-busy="true" aria-label="Загрузка следующей тренировки">
        <div className="swim-hero-inner">
          <div>
            <div className="swim-loading-line" style={{ width: 120, marginBottom: 14 }} />
            <div className="swim-loading-line" style={{ width: "70%", height: 40, marginBottom: 14 }} />
            <div className="swim-loading-line" style={{ width: 220 }} />
          </div>
        </div>
      </GlassPanel>
    );
  }

  if (!nextWorkout) {
    return (
      <GlassPanel as="section" variant="raised" className="swim-hero">
        <div className="swim-hero-inner">
          <div>
            <p className="swim-eyebrow">VOLT SWIM</p>
            <h2>Следующая тренировка пока не назначена</h2>
            <p style={{ color: "var(--swim-text-muted)", maxWidth: "50ch" }}>
              План плавания ещё не начат. Выберите программу в разделе «Тренировки», чтобы увидеть следующий заплыв здесь.
            </p>
            <Link href="/swim/workouts" className="swim-btn primary">
              Выбрать программу
            </Link>
          </div>
        </div>
      </GlassPanel>
    );
  }

  const distanceLabel = formatMeters(nextWorkout.distanceMeters);
  return (
    <GlassPanel as="section" variant="raised" className="swim-hero">
      <div className="swim-hero-inner">
        <div>
          <p className="swim-eyebrow">СЛЕДУЮЩАЯ ТРЕНИРОВКА · ПЛАВАНИЕ</p>
          <h2>{nextWorkout.title}</h2>
          <p style={{ color: "var(--swim-text-muted)", maxWidth: "50ch", marginTop: -6 }}>{nextWorkout.goal}</p>
          <div className="swim-hero-meta">
            <StatusBadge tone={STATUS_TONE[nextWorkout.status]}>{STATUS_LABEL[nextWorkout.status]}</StatusBadge>
            <span>{distanceLabel ?? "Дистанция: нет данных"}</span>
            <span>~{nextWorkout.estimatedMinutes} мин</span>
          </div>
          <Link href={`/swim/workouts/${nextWorkout.programId}/${nextWorkout.workoutId}`} className="swim-btn primary">
            {nextWorkout.status === "not_started" ? "Начать тренировку" : "Продолжить тренировку"}
          </Link>
        </div>
      </div>
    </GlassPanel>
  );
}
