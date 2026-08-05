"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Bell, CalendarDays, ChevronLeft, Clock3, Footprints, Gauge, Pause, Play, RefreshCw, Sparkles, Waves } from "lucide-react";
import { SwimNavigation } from "../../../swim-navigation";
import { GlassPanel } from "../../../components/glass-panel";
import { WorkoutSummaryForm } from "../../../components/workout-summary-form";
import { GarminMatchPanel } from "../../../components/garmin-match-panel";
import { buildConfirmationExercises, buildSwimSnapshot, intervalTotalMeters, totalDistanceMeters } from "@/lib/swim/workout-engine";
import { exerciseLabelRu } from "@/lib/swim/exercise-catalog";
import { formatMeters } from "@/lib/swim-metrics";
import type { SwimCalendarSlot, SwimInterval, SwimProgramProgress, SwimWorkoutDef, SwimWorkoutProgressStatus } from "@/lib/swim/types";

type ApiDraft = { id: number; status: string; startedAt: string | null; finishedAt: string | null; planKey?: string };
type Phase = "loading" | "not_found" | "preview" | "active" | "awaiting_confirmation" | "completed" | "error";
type StageKey = "warmup" | "main" | "legs" | "cooldown";

const DAY_LABEL = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const LEVEL_LABEL: Record<string, string> = { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" };
const STATUS_LABEL: Record<SwimWorkoutProgressStatus, string> = { not_started: "Запланировано", in_progress: "Идёт сейчас", awaiting_confirmation: "Ожидает подтверждения", completed: "Выполнено" };
const ORIGIN_LABEL: Record<SwimCalendarSlot["origin"], string> = { completed: "Фактическая дата выполнения", active: "Дата начала тренировки", projected: "По основному плану VOLT" };

function formatCalendarDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

// Те же названия этапов, что и на утверждённом Плане тренировок
// (app/swim/components/swim-plan-screen.tsx:STAGE_LABEL) — единая
// терминология между Планом и Деталями.
const STAGE_META: Record<StageKey, { title: string; eyebrow: string; className: string }> = {
  warmup: { title: "Разминка", eyebrow: "Войти в ритм", className: "warmup" },
  main: { title: "Основной сет", eyebrow: "Техника и объём", className: "main" },
  legs: { title: "Выносливость", eyebrow: "Работа от бедра", className: "legs" },
  cooldown: { title: "Заминка", eyebrow: "Восстановление", className: "cooldown" },
};

function stageOf(interval: SwimInterval): StageKey {
  if (interval.type === "warmup") return "warmup";
  if (interval.exerciseId === "kick") return "legs";
  if (["cooldown", "recovery", "easy"].includes(interval.type)) return "cooldown";
  return "main";
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
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<SwimWorkoutProgressStatus | null>(null);
  const [calendar, setCalendar] = useState<SwimCalendarSlot | null>(null);
  const [draft, setDraft] = useState<ApiDraft | null>(null);
  // Активная тренировка работает на уровне крупных блоков (разминка/основная
  // часть/выносливость/заминка), а не на уровне каждого отдельного отрезка —
  // в бассейне никто не подтверждает телефоном каждые 50 м. Интервалы и
  // повторы внутри блока остаются видимыми как структура, но не требуют
  // отдельного чек-ина. Фактические длины/темп/паузы подтверждаются после
  // тренировки из Garmin/FIT (см. WorkoutSummaryForm) — completedMeters здесь
  // лишь черновая оценка объёма для формы подтверждения, не точный лог.
  const [blockIndex, setBlockIndex] = useState(0);
  const [completedMeters, setCompletedMeters] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Заполняется после подтверждения тренировки данными из Garmin/FIT
  // (см. GarminMatchPanel) — фактические метры/время подтверждаются
  // постфактум, а не оценкой прогресса по блокам.
  const [garminMeters, setGarminMeters] = useState<number | null>(null);
  const [garminSeconds, setGarminSeconds] = useState<number | null>(null);

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
        setWeekIndex(wp.weekIndex);
        setStatus(wp.status);
        setCalendar(wp.calendar);
        if (wp.status === "completed") {
          setPhase("completed");
          return;
        }
        const liveDraft = (fitnessJson.workoutDrafts || []).find((d) => d.planKey === wp.planKey) ?? null;
        setDraft(liveDraft);
        if (wp.status === "in_progress") {
          try {
            const saved = JSON.parse(localStorage.getItem(`volt-swim-session:${programId}:${workoutId}`) || "null");
            if (saved && Number.isInteger(saved.blockIndex)) setBlockIndex(Math.max(0, saved.blockIndex));
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
      setBlockIndex(0);
      setCompletedMeters(0);
      setPaused(false);
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
          durationSeconds: garminSeconds ?? elapsedSeconds(draft),
          distanceMeters: garminMeters ?? (completedMeters || totalDistanceMeters(workout)),
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

  const stages = workout ? (["warmup", "main", "legs", "cooldown"] as StageKey[])
    .map((key) => ({ key, intervals: workout.intervals.filter((interval) => stageOf(interval) === key) }))
    .filter((stage) => stage.intervals.length > 0) : [];
  const stageVolume = (stage: (typeof stages)[number]) => stage.intervals.reduce((sum, interval) => sum + intervalTotalMeters(interval), 0);
  const currentStage = stages[blockIndex] ?? null;
  const nextStage = stages[blockIndex + 1] ?? null;
  const progressPercent = stages.length ? Math.round((blockIndex / stages.length) * 100) : 0;
  const totalIntervalCount = stages.reduce((sum, stage) => sum + stage.intervals.length, 0);

  useEffect(() => {
    if (phase !== "active") return;
    localStorage.setItem(`volt-swim-session:${programId}:${workoutId}`, JSON.stringify({ blockIndex, completedMeters }));
  }, [phase, programId, workoutId, blockIndex, completedMeters]);

  // «Блок завершён» — необязательная навигация между крупными блоками, не
  // чек-ин за каждый отрезок/повтор внутри блока (см. структуру ниже).
  const completeBlock = () => {
    if (!currentStage) return;
    const nextMeters = completedMeters + stageVolume(currentStage);
    setCompletedMeters(nextMeters);
    if (blockIndex >= stages.length - 1) { void finish(nextMeters); return; }
    setBlockIndex((index) => index + 1);
    setPaused(false);
  };
  const backBlock = () => {
    if (blockIndex === 0) return;
    const prevStage = stages[blockIndex - 1];
    setCompletedMeters((m) => Math.max(0, m - stageVolume(prevStage)));
    setBlockIndex((index) => index - 1);
    setPaused(false);
  };

  const backToPlanHref = weekIndex ? `/swim/workouts?week=${weekIndex}&workout=${workoutId}` : "/swim/workouts";

  return (
    <>
      {phase !== "preview" && <header className="swim-page-header">
        <div>
          <p className="swim-breadcrumb">
            VOLT / Тренировки / Swim /{" "}
            <Link href={backToPlanHref}>План тренировок</Link> /{" "}
            <b>{workout ? workout.title : "Тренировка"}</b>
          </p>
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
            <Link href="/swim/workouts" style={{ color: "var(--swim-aqua)" }}>
              плану тренировок
            </Link>
            .
          </p>
        </GlassPanel>
      )}

      {phase === "preview" && workout && (
        <div className="swim-detail">
          <header className="swim-detail-header">
            <div>
              <p className="swim-breadcrumb">
                VOLT / Тренировки / Swim /{" "}
                <Link href={backToPlanHref}>План тренировок</Link> /{" "}
                <b>{workout.title}</b>
              </p>
              <Link href={backToPlanHref} className="swim-detail-back"><ChevronLeft size={16} /> К плану тренировок</Link>
              <h1>{workout.title}</h1>
              <p className="swim-detail-goal">{workout.goal}</p>
            </div>
            <div className="swim-header-tools" aria-label="Состояние синхронизации">
              <button type="button" aria-label="Календарь"><CalendarDays size={19} /></button>
              <span><RefreshCw size={14} /> Синхронизировано <i /></span>
              <button type="button" aria-label="Уведомления"><Bell size={18} /><i /></button>
            </div>
          </header>

          <section className="swim-home-card swim-detail-hero">
            <div className="swim-detail-hero-top">
              <span className="swim-detail-week-badge">{weekIndex ? `Неделя ${weekIndex} из ${program?.weeks.length ?? weekIndex}` : program?.name}</span>
              {calendar && (
                <span className="swim-detail-date-badge">
                  {DAY_LABEL[calendar.weekday - 1]}, {formatCalendarDate(calendar.date)}
                  {calendar.isToday && <b> · Сегодня</b>}
                </span>
              )}
              {calendar?.scheduleChangeId && <span className="swim-detail-changed-badge">План изменён</span>}
              {status && <span className={`swim-detail-status-badge ${status}`}>{STATUS_LABEL[status]}</span>}
            </div>
            {calendar && <p className="swim-detail-origin">{ORIGIN_LABEL[calendar.origin]}</p>}
            <div className="swim-detail-stats">
              <span><Waves size={16} /><div><strong>{formatMeters(totalDistanceMeters(workout))}</strong><small>Объём</small></div></span>
              <span><Clock3 size={16} /><div><strong>≈ {workout.estimatedMinutes} мин</strong><small>Время</small></div></span>
              <span><Gauge size={16} /><div><strong>{LEVEL_LABEL[workout.level] ?? workout.level}</strong><small>Уровень</small></div></span>
            </div>
          </section>

          <div className="swim-detail-grid">
            <div className="swim-detail-main">
              <section className="swim-home-card swim-detail-structure">
                <h3>Структура тренировки</h3>
                {stages.map((stage) => {
                  const meta = STAGE_META[stage.key];
                  const volume = stage.intervals.reduce((sum, interval) => sum + intervalTotalMeters(interval), 0);
                  const first = stage.intervals[0];
                  const StageIcon = stage.key === "legs" ? Footprints : stage.key === "main" ? Activity : stage.key === "cooldown" ? Sparkles : Waves;
                  return (
                    <div className={`swim-detail-stage-row ${meta.className}`} key={stage.key}>
                      <span className="swim-detail-stage-icon"><StageIcon size={17} /></span>
                      <div className="swim-detail-stage-copy">
                        <b>{meta.title}</b>
                        <small>{first.repeats > 1 ? `${first.repeats} × ${first.distanceMeters} м` : `${first.distanceMeters} м`} · {exerciseLabelRu(first.exerciseId)} · Отдых {restLabel(stage.intervals)}</small>
                      </div>
                      <p className="swim-detail-stage-desc">{first.description}</p>
                      <strong className="swim-detail-stage-volume">{volume.toLocaleString("ru-RU")} м</strong>
                    </div>
                  );
                })}
              </section>

              {(() => {
                const equipment = Array.from(new Set(workout.intervals.flatMap((interval) => interval.equipment)));
                return equipment.length > 0 ? (
                  <section className="swim-home-card swim-detail-equipment">
                    <h3>Оборудование</h3>
                    <ul>{equipment.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                ) : null;
              })()}
            </div>

            <aside className="swim-detail-side">
              <div className="swim-home-card swim-detail-cta-card">
                <button type="button" className="swim-plan-primary-action" onClick={start} disabled={busy}>
                  <Play size={15} fill="currentColor" /> {busy ? "Начинаем…" : "Начать тренировку"}
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {phase === "active" && currentStage && (
        <>
          <div className="swim-session-progress" aria-label={`Выполнено ${progressPercent}%`}><i style={{ width: `${progressPercent}%` }} /></div>

          {paused ? (
            <GlassPanel variant="raised" className="swim-rest-panel">
              <p className="swim-eyebrow">ТРЕНИРОВКА НА ПАУЗЕ</p>
              <strong>Пауза</strong>
              <p>Блок {blockIndex + 1} из {stages.length} · {STAGE_META[currentStage.key].title} подождёт вас.</p>
              <div className="swim-session-actions">
                <button type="button" className="swim-btn primary" onClick={() => setPaused(false)}>Продолжить</button>
                <button type="button" className="swim-btn ghost" onClick={() => void finish(completedMeters)} disabled={busy}>Завершить раньше</button>
              </div>
            </GlassPanel>
          ) : (
            <>
              <GlassPanel variant="raised" className="swim-active-block">
                <p className="swim-eyebrow">БЛОК {blockIndex + 1} ИЗ {stages.length} · {STAGE_META[currentStage.key].eyebrow}</p>
                <h2>{STAGE_META[currentStage.key].title}</h2>
                <div className="swim-active-block-intervals">
                  {currentStage.intervals.map((interval) => (
                    <div key={interval.id} className="swim-active-interval-row">
                      <strong>{interval.repeats > 1 ? `${interval.repeats} × ${interval.distanceMeters} м` : `${interval.distanceMeters} м`}</strong>
                      <div><b>{exerciseLabelRu(interval.exerciseId)}</b><small>{interval.description}</small></div>
                    </div>
                  ))}
                </div>
                <div className="swim-active-block-meta">
                  <span><small>Объём блока</small><b>{stageVolume(currentStage).toLocaleString("ru-RU")} м</b></span>
                  <span><small>Целевой отдых</small><b>{restLabel(currentStage.intervals)}</b></span>
                </div>
                {nextStage && <p className="swim-active-next">Далее: {STAGE_META[nextStage.key].title} · {stageVolume(nextStage).toLocaleString("ru-RU")} м</p>}
              </GlassPanel>
              <div className="swim-session-actions">
                <button type="button" className="swim-btn secondary" onClick={backBlock} disabled={blockIndex === 0 || busy}>Назад</button>
                <button type="button" className="swim-btn primary" onClick={completeBlock} disabled={busy}>{blockIndex === stages.length - 1 ? "Завершить тренировку" : "Блок завершён"}</button>
                <button type="button" className="swim-btn secondary" onClick={() => setPaused(true)} disabled={busy}><Pause size={14} /> Пауза</button>
                <button type="button" className="swim-btn ghost" onClick={() => void finish(completedMeters)} disabled={busy}>Завершить раньше</button>
              </div>
            </>
          )}
        </>
      )}

      {phase === "awaiting_confirmation" && workout && draft && (
        <GarminMatchPanel draftId={draft.id} workout={workout} onApply={(meters, seconds) => { setGarminMeters(meters); setGarminSeconds(seconds); }} />
      )}

      {phase === "awaiting_confirmation" && workout && (
        <WorkoutSummaryForm distanceMeters={garminMeters ?? (completedMeters || totalDistanceMeters(workout))} durationSeconds={garminSeconds ?? elapsedSeconds(draft)} intervalCount={totalIntervalCount} busy={busy} onSubmit={confirm} />
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
