"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { SwimNavigation } from "../../../swim-navigation";
import { GlassPanel } from "../../../components/glass-panel";
import { StatusBadge } from "../../../components/status-badge";
import { IntervalStepView } from "../../../components/interval-step-view";
import { WorkoutControls } from "../../../components/workout-controls";
import { WorkoutSummaryForm } from "../../../components/workout-summary-form";
import { buildConfirmationExercises, buildIntervalSteps, buildSwimSnapshot, totalDistanceMeters } from "@/lib/swim/workout-engine";
import { formatMeters } from "@/lib/swim-metrics";
import type { SwimProgramProgress, SwimWorkoutDef } from "@/lib/swim/types";

type ApiDraft = { id: number; status: string; startedAt: string | null; finishedAt: string | null; planKey?: string };
type Phase = "loading" | "not_found" | "preview" | "active" | "awaiting_confirmation" | "completed" | "error";

function localIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function elapsedSeconds(draft: ApiDraft | null): number {
  if (!draft?.startedAt) return 0;
  const start = new Date(draft.startedAt.replace(" ", "T") + "Z").getTime();
  const end = draft.finishedAt ? new Date(draft.finishedAt.replace(" ", "T") + "Z").getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 1000));
}

export default function SwimWorkoutSessionPage({ params }: { params: Promise<{ programId: string; workoutId: string }> }) {
  const { programId, workoutId } = use(params);
  const [phase, setPhase] = useState<Phase>("loading");
  const [program, setProgram] = useState<SwimProgramProgress["program"] | null>(null);
  const [workout, setWorkout] = useState<SwimWorkoutDef | null>(null);
  const [draft, setDraft] = useState<ApiDraft | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/swim/programs/${programId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch("/api/fitness", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ])
      .then(([programJson, fitnessJson]: [{ progress: SwimProgramProgress }, { workoutDrafts: ApiDraft[] }]) => {
        const wp = programJson.progress.workouts.find((w) => w.workout.id === workoutId);
        if (!wp) {
          setPhase("not_found");
          return;
        }
        setProgram(programJson.progress.program);
        setWorkout(wp.workout);
        if (wp.status === "completed") {
          setPhase("completed");
          return;
        }
        const liveDraft = (fitnessJson.workoutDrafts || []).find((d) => d.planKey === wp.planKey) ?? null;
        setDraft(liveDraft);
        setPhase(wp.status === "awaiting_confirmation" ? "awaiting_confirmation" : wp.status === "in_progress" ? "active" : "preview");
      })
      .catch(() => setPhase("not_found"));
  }, [programId, workoutId]);

  const start = async () => {
    if (!program || !workout) return;
    const snapshot = buildSwimSnapshot(program, workout);
    if (!snapshot) return setActionError("Не удалось подготовить тренировку");
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "startWorkoutDraft", date: localIso(new Date()), snapshot }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setActionError(json.error || "Не удалось начать тренировку");
      setDraft(json.draft);
      setStepIndex(0);
      setPhase("active");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!draft) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finishWorkoutDraft", id: draft.id, expectedStatus: "active" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setActionError(json.error || "Не удалось завершить тренировку");
      setDraft(json.draft);
      setPhase("awaiting_confirmation");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (effort: string, painAfter: number, notes: string) => {
    if (!draft || !workout) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/fitness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirmWorkoutDraft",
          id: draft.id,
          expectedStatus: "awaiting_confirmation",
          durationSeconds: elapsedSeconds(draft),
          distanceMeters: totalDistanceMeters(workout),
          effort,
          painAfter,
          notes,
          exercises: buildConfirmationExercises(workout),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setActionError(json.error || "Не удалось подтвердить тренировку");
      setDraft(json.draft);
      setPhase("completed");
    } finally {
      setBusy(false);
    }
  };

  const steps = workout ? buildIntervalSteps(workout) : [];
  const currentStep = steps[stepIndex] ?? null;

  return (
    <>
      <header className="swim-page-header">
        <div>
          <p className="swim-eyebrow">VOLT SWIM</p>
          <h1>{workout ? workout.title : "Тренировка"}</h1>
          {workout && program && <p>{program.name} · {workout.goal}</p>}
        </div>
      </header>

      <SwimNavigation />

      {actionError && (
        <GlassPanel style={{ padding: "12px 16px", marginBottom: 16, borderColor: "rgba(255,120,120,.4)" }} role="alert">
          {actionError}
        </GlassPanel>
      )}

      {phase === "loading" && (
        <GlassPanel style={{ padding: 24 }} aria-busy="true">
          <div className="swim-loading-line" style={{ width: "50%", marginBottom: 10 }} />
          <div className="swim-loading-line" style={{ width: "80%" }} />
        </GlassPanel>
      )}

      {phase === "not_found" && (
        <GlassPanel className="swim-empty">
          <h4>Тренировка не найдена</h4>
          <p>
            Вернитесь к{" "}
            <Link href={`/swim/workouts/${programId}`} style={{ color: "var(--swim-aqua)" }}>
              программе
            </Link>
            .
          </p>
        </GlassPanel>
      )}

      {phase === "preview" && workout && (
        <GlassPanel variant="raised" style={{ padding: "clamp(20px, 4vw, 32px)" }}>
          <div className="swim-hero-meta" style={{ marginBottom: 18 }}>
            <StatusBadge>Не начата</StatusBadge>
            <span>{formatMeters(totalDistanceMeters(workout)) ?? "Нет данных"}</span>
            <span>~{workout.estimatedMinutes} мин</span>
            <span>{workout.intervals.length} интервалов</span>
          </div>
          <ol style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "grid", gap: 8 }}>
            {steps.map((step) => (
              <li key={step.interval.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: "var(--swim-surface-raised)", borderRadius: "var(--swim-radius-sm)", fontSize: 14 }}>
                <span>{step.exerciseName}</span>
                <span style={{ color: "var(--swim-text-muted)" }}>{step.interval.repeats > 1 ? `${step.interval.repeats}×${step.interval.distanceMeters} м` : `${step.interval.distanceMeters} м`}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="swim-btn primary" onClick={start} disabled={busy}>
            {busy ? "Начинаем…" : "Начать тренировку"}
          </button>
        </GlassPanel>
      )}

      {phase === "active" && currentStep && (
        <>
          <IntervalStepView step={currentStep} next={steps[stepIndex + 1] ?? null} />
          <WorkoutControls
            canGoBack={stepIndex > 0}
            canGoNext={stepIndex < steps.length - 1}
            onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
            onNext={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            onFinish={finish}
            busy={busy}
          />
        </>
      )}

      {phase === "awaiting_confirmation" && workout && (
        <WorkoutSummaryForm distanceMeters={totalDistanceMeters(workout)} durationSeconds={elapsedSeconds(draft)} intervalCount={workout.intervals.length} busy={busy} onSubmit={confirm} />
      )}

      {phase === "completed" && (
        <GlassPanel className="swim-empty">
          <h4>Тренировка сохранена</h4>
          <p>Результаты уже видны на главной странице VOLT Swim.</p>
          <div className="swim-quick-actions" style={{ justifyContent: "center", marginTop: 12 }}>
            <Link href="/swim" className="swim-btn primary">
              На главную VOLT Swim
            </Link>
            <Link href={`/swim/workouts/${programId}`} className="swim-btn secondary">
              К программе
            </Link>
          </div>
        </GlassPanel>
      )}
    </>
  );
}
