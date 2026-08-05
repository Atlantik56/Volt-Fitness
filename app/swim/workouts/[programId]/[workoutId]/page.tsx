"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Footprints, Play, Sparkles, Waves } from "lucide-react";
import { SwimNavigation } from "../../../swim-navigation";
import { GlassPanel } from "../../../components/glass-panel";
import { StatusBadge } from "../../../components/status-badge";
import { IntervalStepView } from "../../../components/interval-step-view";
import { WorkoutSummaryForm } from "../../../components/workout-summary-form";
import { buildConfirmationExercises, buildIntervalSteps, buildSwimSnapshot, intervalTypeLabel, totalDistanceMeters } from "@/lib/swim/workout-engine";
import { exerciseLabelRu } from "@/lib/swim/exercise-catalog";
import { formatMeters } from "@/lib/swim-metrics";
import type { SwimInterval, SwimProgramProgress, SwimWorkoutDef } from "@/lib/swim/types";

type ApiDraft = { id: number; status: string; startedAt: string | null; finishedAt: string | null; planKey?: string };
type Phase = "loading" | "not_found" | "preview" | "active" | "awaiting_confirmation" | "completed" | "error";
type SessionMode = "swim" | "rest";
type StageKey = "warmup" | "main" | "legs" | "cooldown";

const STAGE_META: Record<StageKey, { title: string; eyebrow: string; className: string }> = {
  warmup: { title: "Разминка", eyebrow: "Войти в ритм", className: "warmup" },
  main: { title: "Основной блок", eyebrow: "Техника и объём", className: "main" },
  legs: { title: "Ноги", eyebrow: "Работа от бедра", className: "legs" },
  cooldown: { title: "Заминка", eyebrow: "Восстановление", className: "cooldown" },
};

function stageOf(interval: SwimInterval): StageKey {
  if (interval.type === "warmup") return "warmup";
  if (interval.exerciseId === "kick") return "legs";
  if (["cooldown", "recovery", "easy"].includes(interval.type)) return "cooldown";
  return "main";
}

function paceLabel(intervals: SwimInterval[]): string {
  const pace = intervals.find((interval) => interval.targetPaceSecondsPer100)?.targetPaceSecondsPer100;
  if (pace) return `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, "0")} / 100 м`;
  if (intervals.every((interval) => ["cooldown", "recovery", "easy"].includes(interval.type))) return "Лёгкий";
  return "Спокойный";
}

function restLabel(intervals: SwimInterval[]): string {
  const rests = intervals.flatMap((interval) => interval.restSeconds ? [interval.restSeconds] : []);
  if (!rests.length) return "Без отдыха";
  const min = Math.min(...rests);
  const max = Math.max(...intervals.flatMap((interval) => interval.restSecondsMax ? [interval.restSecondsMax] : rests));
  return min === max ? `${min} сек` : `${min}–${max} сек`;
}

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
  const [completedMeters, setCompletedMeters] = useState(0);
  const [mode, setMode] = useState<SessionMode>("swim");
  const [restRemaining, setRestRemaining] = useState(0);
  const [restPaused, setRestPaused] = useState(false);
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
        if (wp.status === "in_progress") {
          try {
            const saved = JSON.parse(localStorage.getItem(`volt-swim-session:${programId}:${workoutId}`) || "null");
            if (saved && Number.isInteger(saved.stepIndex)) setStepIndex(Math.max(0, saved.stepIndex));
            if (saved && Number.isFinite(saved.completedMeters)) setCompletedMeters(Math.max(0, saved.completedMeters));
          } catch {}
        }
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
      setCompletedMeters(0);
      localStorage.removeItem(`volt-swim-session:${programId}:${workoutId}`);
      setPhase("active");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (actualMeters = completedMeters) => {
    if (!draft) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finishWorkoutDraft", id: draft.id, expectedStatus: "active" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setActionError(json.error || "Не удалось завершить тренировку");
      setDraft(json.draft);
      setCompletedMeters(actualMeters);
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
          distanceMeters: completedMeters || totalDistanceMeters(workout),
          effort,
          painAfter,
          notes,
          exercises: buildConfirmationExercises(workout),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setActionError(json.error || "Не удалось подтвердить тренировку");
      setDraft(json.draft);
      localStorage.removeItem(`volt-swim-session:${programId}:${workoutId}`);
      setPhase("completed");
    } finally {
      setBusy(false);
    }
  };

  const steps = workout ? buildIntervalSteps(workout) : [];
  const stages = workout ? (["warmup", "main", "legs", "cooldown"] as StageKey[])
    .map((key) => ({ key, intervals: workout.intervals.filter((interval) => stageOf(interval) === key) }))
    .filter((stage) => stage.intervals.length > 0) : [];
  const currentStep = steps[stepIndex] ?? null;
  const progressPercent = steps.length ? Math.round((stepIndex / steps.length) * 100) : 0;

  useEffect(() => {
    if (phase !== "active" || mode !== "rest" || restPaused || restRemaining <= 0) return;
    const timer = window.setInterval(() => setRestRemaining((value) => {
      if (value <= 1) { window.clearInterval(timer); setMode("swim"); setRestPaused(false); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, mode, restPaused, restRemaining]);

  useEffect(() => {
    if (phase !== "active") return;
    localStorage.setItem(`volt-swim-session:${programId}:${workoutId}`, JSON.stringify({ stepIndex, completedMeters }));
  }, [phase, programId, workoutId, stepIndex, completedMeters]);

  const completeCurrent = () => {
    if (!currentStep) return;
    const nextMeters = completedMeters + currentStep.totalMeters;
    setCompletedMeters(nextMeters);
    if (stepIndex >= steps.length - 1) { void finish(nextMeters); return; }
    setStepIndex((index) => index + 1);
    const rest = currentStep.interval.restSeconds ?? 0;
    if (rest > 0) { setRestRemaining(rest); setMode("rest"); setRestPaused(false); }
  };

  return (
    <>
      {phase !== "preview" && <header className="swim-page-header">
        <div>
          <p className="swim-eyebrow">VOLT SWIM</p>
          <h1>{workout ? workout.title : "Тренировка"}</h1>
          {workout && program && <p>{program.name} · {workout.goal}</p>}
        </div>
      </header>}

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
        <>
          <section className="swim-workout-hero">
            <div className="swim-workout-hero-shade" />
            <div className="swim-workout-hero-content">
              <Link href={`/swim/workouts/${programId}`} className="swim-workout-back"><ArrowLeft size={15} /> К программе</Link>
              <p className="swim-eyebrow">VOLT SWIM · {program?.name ?? "ТРЕНИРОВКА"}</p>
              <h1>{workout.title}</h1>
              <p className="swim-workout-hero-goal">{workout.goal}</p>
              <div className="swim-workout-stats">
                <span><strong>{formatMeters(totalDistanceMeters(workout))}</strong><small>объём</small></span>
                <span><strong>≈ {workout.estimatedMinutes}</strong><small>минут</small></span>
                <span><strong>{stages.length}</strong><small>этапа</small></span>
              </div>
              <button type="button" className="swim-btn primary swim-workout-start" onClick={start} disabled={busy}>
                <Play size={15} fill="currentColor" /> {busy ? "Начинаем…" : "Начать тренировку"}
              </button>
            </div>
            <div className="swim-workout-hero-mark">
              <span><Waves size={30} /></span>
              <small>ФОКУС ТРЕНИРОВКИ</small>
              <strong>Длинный гребок</strong>
              <p>Спокойная техника без лишних усилий</p>
            </div>
          </section>

          <div className="swim-plan-heading">
            <div><p className="swim-eyebrow">ПЛАН ТРЕНИРОВКИ</p><h2>Четыре этапа в одном ритме</h2></div>
            <span><StatusBadge>Не начата</StatusBadge> · {formatMeters(totalDistanceMeters(workout))} · ≈ {workout.estimatedMinutes} мин</span>
          </div>

          <div className="swim-stage-grid">
            {stages.map((stage, index) => {
              const meta = STAGE_META[stage.key];
              const volume = stage.intervals.reduce((sum, interval) => sum + interval.distanceMeters * Math.max(1, interval.repeats), 0);
              const repetitions = stage.intervals.reduce((sum, interval) => sum + Math.max(1, interval.repeats), 0);
              const StageIcon = stage.key === "legs" ? Footprints : stage.key === "main" ? Activity : stage.key === "cooldown" ? Sparkles : Waves;
              return (
                <article className={`swim-stage-card ${meta.className}`} key={stage.key}>
                  <div className="swim-stage-summary">
                    <span className="swim-stage-icon"><StageIcon size={25} /></span>
                    <div><small>{index + 1}. {meta.title}</small><strong>{volume.toLocaleString("ru-RU")} м</strong><span>{meta.eyebrow}</span></div>
                  </div>
                  <div className="swim-stage-intervals">
                    {stage.intervals.map((interval) => (
                      <div key={interval.id}>
                        <small>{exerciseLabelRu(interval.exerciseId)}</small>
                        <strong>{interval.repeats > 1 ? `${interval.repeats} × ${interval.distanceMeters} м` : `${interval.distanceMeters} м`}</strong>
                        {interval.equipment.length > 0 && <span>{interval.equipment.join(", ")}</span>}
                      </div>
                    ))}
                  </div>
                  <dl className="swim-stage-details">
                    <div><dt>Отдых</dt><dd>{restLabel(stage.intervals)}</dd></div>
                    <div><dt>Темп</dt><dd>{paceLabel(stage.intervals)}</dd></div>
                    <div><dt>Фокус</dt><dd>{stage.intervals[0].description}</dd></div>
                  </dl>
                  <div className="swim-stage-reps"><span>{intervalTypeLabel(stage.intervals[0].type)}</span><small>{repetitions} {repetitions === 1 ? "подход" : repetitions < 5 ? "подхода" : "подходов"}</small></div>
                </article>
              );
            })}
          </div>

          <GlassPanel className="swim-coach-note">
            <span><Sparkles size={22} /></span>
            <div><small>СОВЕТ COACH</small><p>Плавание — это не спринт. Контроль дыхания и длинный гребок дадут скорость без лишних усилий.</p></div>
          </GlassPanel>
        </>
      )}

      {phase === "active" && currentStep && (
        <>
          <div className="swim-session-progress" aria-label={`Выполнено ${progressPercent}%`}><i style={{ width: `${progressPercent}%` }} /></div>
          {mode === "rest" ? (
            <GlassPanel variant="raised" className="swim-rest-panel">
              <p className="swim-eyebrow">ОТДЫХ · СЛЕДУЮЩИЙ ОТРЕЗОК {stepIndex + 1} ИЗ {steps.length}</p>
              <strong>{Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, "0")}</strong>
              <p>Далее: {currentStep.totalMeters} м · {currentStep.exerciseName}</p>
              <div className="swim-session-actions">
                <button type="button" className="swim-btn secondary" onClick={() => setRestPaused((value) => !value)}>{restPaused ? "Продолжить таймер" : "Пауза"}</button>
                <button type="button" className="swim-btn primary" onClick={() => { setMode("swim"); setRestRemaining(0); }}>Начать раньше</button>
              </div>
            </GlassPanel>
          ) : (
            <>
              <IntervalStepView step={currentStep} next={steps[stepIndex + 1] ?? null} />
              <div className="swim-session-actions">
                <button type="button" className="swim-btn secondary" onClick={() => { setStepIndex((i) => Math.max(0, i - 1)); setCompletedMeters((m) => Math.max(0, m - (steps[stepIndex - 1]?.totalMeters ?? 0))); }} disabled={stepIndex === 0 || busy}>Назад</button>
                <button type="button" className="swim-btn primary" onClick={completeCurrent} disabled={busy}>{stepIndex === steps.length - 1 ? "Завершить отрезок" : "Отрезок выполнен"}</button>
                <button type="button" className="swim-btn ghost" onClick={() => void finish(completedMeters)} disabled={busy || completedMeters === 0}>Завершить раньше</button>
              </div>
            </>
          )}
        </>
      )}

      {phase === "awaiting_confirmation" && workout && (
        <WorkoutSummaryForm distanceMeters={completedMeters || totalDistanceMeters(workout)} durationSeconds={elapsedSeconds(draft)} intervalCount={steps.length} busy={busy} onSubmit={confirm} />
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
