"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Flame,
  Gauge,
  Loader2,
  Moon,
  Play,
  RefreshCw,
  Waves,
} from "lucide-react";
import { currentProgramWeek } from "@/app/personal-data";
import { formatDuration, formatMeters } from "@/lib/swim-metrics";
import { exerciseLabelRu } from "@/lib/swim/exercise-catalog";
import { intervalTotalMeters, totalDistanceMeters } from "@/lib/swim/workout-engine";
import type { SwimInterval, SwimProgramProgress, SwimWorkoutDef, SwimWorkoutProgress } from "@/lib/swim/types";
import { SwimNavigation } from "../swim-navigation";

const DAY_LABEL = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const LEVEL_LABEL: Record<string, string> = { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" };
const STATUS_LABEL: Record<string, string> = { not_started: "Запланировано", in_progress: "Идёт сейчас", awaiting_confirmation: "Ожидает подтверждения", completed: "Выполнено" };

type StageKey = "warmup" | "main" | "legs" | "cooldown";
const STAGE_LABEL: Record<StageKey, string> = { warmup: "Разминка", main: "Основной сет", legs: "Выносливость", cooldown: "Заминка" };
const STAGE_TONE: Record<StageKey, "green" | "blue"> = { warmup: "green", main: "blue", legs: "blue", cooldown: "green" };

function stageOf(interval: SwimInterval): StageKey {
  if (interval.type === "warmup") return "warmup";
  if (interval.exerciseId === "kick") return "legs";
  if (["cooldown", "recovery", "easy"].includes(interval.type)) return "cooldown";
  return "main";
}

function mondayOf(d: Date): Date {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((d.getDay() + 6) % 7));
  return monday;
}
function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shortDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d);
}

export function SwimPlanScreen({ programId }: { programId: string }) {
  const [progress, setProgress] = useState<SwimProgramProgress | null>(null);
  const [programStart, setProgramStart] = useState<string | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [weekIndexOverride, setWeekIndexOverride] = useState<number | null>(null);
  const [selectedWorkoutIdOverride, setSelectedWorkoutIdOverride] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/swim/programs/${programId}`, { cache: "no-store" }).then((r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("request failed");
        return r.json();
      }),
      fetch("/api/fitness", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([programJson, fitnessJson]: [{ progress: SwimProgramProgress } | null, { profile?: { programStart?: string } } | null]) => {
        if (!programJson) {
          setNotFound(true);
          return;
        }
        setProgress(programJson.progress);
        setProgramStart(fitnessJson?.profile?.programStart);
      })
      .catch(() => setError(true));
  }, [programId]);

  const totalWeeks = progress?.program.weeks.length ?? 0;
  const liveWeek = useMemo(() => Math.min(Math.max(currentProgramWeek(programStart), 1), Math.max(totalWeeks, 1)), [programStart, totalWeeks]);
  const weekIndex = weekIndexOverride !== null && weekIndexOverride >= 1 && weekIndexOverride <= totalWeeks ? weekIndexOverride : totalWeeks > 0 ? liveWeek : null;
  const setWeekIndex = (updater: (current: number) => number) =>
    setWeekIndexOverride((prevOverride) => {
      const current = prevOverride !== null && prevOverride >= 1 && prevOverride <= totalWeeks ? prevOverride : liveWeek;
      return updater(current);
    });

  const week = progress?.program.weeks.find((w) => w.weekIndex === weekIndex) ?? null;
  const monday = useMemo(() => {
    if (!programStart || !weekIndex) return null;
    const start = new Date(`${programStart}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    return addDays(mondayOf(start), (weekIndex - 1) * 7);
  }, [programStart, weekIndex]);
  const todayIso = isoDate(new Date());

  const rows = useMemo(() => {
    if (!week || !progress) return [];
    return week.days.map((day) => {
      const date = monday ? addDays(monday, day.dayIndex - 1) : null;
      const workoutProgress = day.workout ? progress.workouts.find((w) => w.workout.id === day.workout!.id) ?? null : null;
      return { day, date, workoutProgress, isToday: date ? isoDate(date) === todayIso : false };
    });
  }, [week, progress, monday, todayIso]);

  const defaultSelectedId = useMemo(() => {
    const todayRow = rows.find((row) => row.isToday && row.workoutProgress);
    const firstRow = rows.find((row) => row.workoutProgress);
    return (todayRow ?? firstRow)?.workoutProgress?.workout.id ?? null;
  }, [rows]);
  const selectedWorkoutId = selectedWorkoutIdOverride && rows.some((row) => row.workoutProgress?.workout.id === selectedWorkoutIdOverride)
    ? selectedWorkoutIdOverride
    : defaultSelectedId;
  const setSelectedWorkoutId = setSelectedWorkoutIdOverride;

  const selected = rows.find((row) => row.workoutProgress?.workout.id === selectedWorkoutId)?.workoutProgress ?? null;

  const summary = useMemo(() => {
    if (!week) return null;
    const withWorkout = rows.filter((row) => row.workoutProgress);
    const targetSessions = withWorkout.length;
    const targetMeters = week.plannedDistanceMeters ?? 0;
    const targetSeconds = withWorkout.reduce((sum, row) => sum + (row.workoutProgress!.workout.estimatedMinutes * 60), 0);
    const doneSessions = withWorkout.filter((row) => row.workoutProgress!.status === "completed").length;
    const actualMeters = withWorkout.reduce((sum, row) => sum + (row.workoutProgress!.actual?.distanceMeters ?? 0), 0);
    const actualSeconds = withWorkout.reduce((sum, row) => sum + (row.workoutProgress!.actual?.durationSeconds ?? 0), 0);
    const actualCalories = withWorkout.reduce((sum, row) => sum + (row.workoutProgress!.actual?.calories ?? 0), 0);
    const pct = (actual: number, target: number) => (target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null);
    return {
      volume: { actual: actualMeters, target: targetMeters, pct: pct(actualMeters, targetMeters) },
      sessions: { actual: doneSessions, target: targetSessions, pct: pct(doneSessions, targetSessions) },
      time: { actual: actualSeconds, target: targetSeconds, pct: pct(actualSeconds, targetSeconds) },
      calories: actualCalories,
    };
  }, [week, rows]);

  const phase = useMemo(() => {
    if (!progress) return null;
    const weeks = progress.program.weeks;
    const points = weeks.reduce<{ weekIndex: number; target: number; actual: number }[]>((acc, w) => {
      const prevTarget = acc.at(-1)?.target ?? 0;
      const prevActual = acc.at(-1)?.actual ?? 0;
      const actualThisWeek = progress.workouts
        .filter((wp) => wp.weekIndex === w.weekIndex)
        .reduce((sum, wp) => sum + (wp.actual?.distanceMeters ?? 0), 0);
      acc.push({ weekIndex: w.weekIndex, target: prevTarget + (w.plannedDistanceMeters ?? 0), actual: prevActual + actualThisWeek });
      return acc;
    }, []);
    const targetTotal = points.at(-1)?.target ?? 0;
    const actualTotal = points.at(-1)?.actual ?? 0;
    const percent = targetTotal > 0 ? Math.round((actualTotal / targetTotal) * 100) : 0;
    return { points, targetTotal, actualTotal, percent, remaining: Math.max(0, targetTotal - actualTotal) };
  }, [progress]);

  if (error) {
    return (
      <div className="swim-plan">
        <header className="swim-plan-header">
          <div>
            <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>План тренировок</b></p>
            <h1>План тренировок</h1>
          </div>
        </header>
        <SwimNavigation />
        <div className="swim-plan-empty" role="alert">
          <h4>Не удалось загрузить план тренировок</h4>
          <p>Проверьте соединение и обновите страницу.</p>
        </div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="swim-plan">
        <header className="swim-plan-header">
          <div>
            <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>План тренировок</b></p>
            <h1>План тренировок</h1>
          </div>
        </header>
        <SwimNavigation />
        <div className="swim-plan-empty">
          <h4>Программа недоступна</h4>
          <p>
            Вернитесь на{" "}
            <Link href="/swim" className="swim-plan-link">
              главную VOLT Swim
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }
  if (!progress || !week || weekIndex === null) {
    return (
      <div className="swim-plan">
        <header className="swim-plan-header">
          <div>
            <p className="swim-breadcrumb">
              VOLT / Тренировки / Swim / <b>План тренировок</b>
            </p>
            <h1>План тренировок</h1>
          </div>
        </header>
        <SwimNavigation />
        <div className="swim-plan-loading" aria-busy="true">
          <Loader2 className="swim-spin" size={22} />
        </div>
      </div>
    );
  }

  return (
    <div className="swim-plan">
      <header className="swim-plan-header">
        <div>
          <p className="swim-breadcrumb">
            VOLT / Тренировки / Swim / <b>План тренировок</b>
          </p>
          <h1>План тренировок</h1>
          <p>
            Неделя {weekIndex} из {totalWeeks}
            {monday && <> · {shortDate(monday)} – {shortDate(addDays(monday, 6))}</>}
          </p>
        </div>
        <div className="swim-header-tools" aria-label="Состояние синхронизации">
          <button type="button" aria-label="Календарь"><CalendarDays size={19} /></button>
          <span><RefreshCw size={14} /> Синхронизировано <i /></span>
          <button type="button" aria-label="Уведомления"><Bell size={18} /><i /></button>
        </div>
      </header>

      <SwimNavigation />

      <div className="swim-plan-toolbar">
        <div className="swim-plan-period-tabs" role="tablist" aria-label="Период плана">
          <button type="button" role="tab" aria-selected="true" className="active">Неделя</button>
          <button type="button" role="tab" aria-selected="false" aria-disabled="true" title="Скоро" disabled>Месяц</button>
          <button type="button" role="tab" aria-selected="false" aria-disabled="true" title="Скоро" disabled>Фаза</button>
        </div>
        <div className="swim-plan-week-nav">
          <button type="button" aria-label="Предыдущая неделя" onClick={() => setWeekIndex((i) => Math.max(1, (i ?? 1) - 1))} disabled={weekIndex <= 1}>
            <ChevronLeft size={18} />
          </button>
          <span>Неделя {weekIndex} из {totalWeeks}</span>
          <button type="button" aria-label="Следующая неделя" onClick={() => setWeekIndex((i) => Math.min(totalWeeks, (i ?? 1) + 1))} disabled={weekIndex >= totalWeeks}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="swim-plan-grid">
        <div className="swim-plan-main">
          <section className="swim-home-card swim-plan-table" aria-label={`Тренировки недели ${weekIndex}`}>
            <div className="swim-plan-table-head">
              <span>День</span>
              <span>Тренировка</span>
              <span>Объём</span>
              <span>Цель</span>
              <span>Статус</span>
            </div>
            {rows.map((row) => (
              <PlanRow
                key={row.day.dayIndex}
                row={row}
                isNext={row.workoutProgress?.workout.id === progress.nextWorkout?.workout.id}
                selected={row.workoutProgress?.workout.id === selectedWorkoutId}
                onSelect={() => row.workoutProgress && setSelectedWorkoutId(row.workoutProgress.workout.id)}
              />
            ))}
          </section>

          {summary && (
            <section className="swim-plan-summary" aria-label="Итоги недели">
              <SummaryTile icon={<Waves size={18} />} label="Объём недели" value={`${summary.volume.actual.toLocaleString("ru-RU")} м`} pct={summary.volume.pct} />
              <SummaryTile icon={<CalendarDays size={18} />} label="Тренировок" value={`${summary.sessions.actual} из ${summary.sessions.target}`} pct={summary.sessions.pct} />
              <SummaryTile icon={<Clock3 size={18} />} label="Время" value={formatDuration(summary.time.actual) ?? "0:00"} pct={summary.time.pct} />
              <SummaryTile icon={<Flame size={18} />} label="Калории" value={summary.calories ? `${summary.calories.toLocaleString("ru-RU")} ккал` : "—"} pct={null} />
            </section>
          )}

          {phase && (
            <section className="swim-home-card swim-plan-phase" aria-label="Прогресс фазы программы">
              <div className="swim-plan-phase-top">
                <div className="swim-plan-phase-head">
                  <h3>Прогресс фазы</h3>
                  <p>Неделя {weekIndex} из {totalWeeks}</p>
                </div>
                <div className="swim-plan-phase-pct-block">
                  <strong className="swim-plan-phase-pct">{phase.percent}%</strong>
                  <span>Выполнено</span>
                </div>
              </div>
              <div className="swim-plan-phase-bar"><i style={{ width: `${phase.percent}%` }} /></div>
              <div className="swim-plan-phase-goal">
                <span>Цель фазы <b>{phase.targetTotal.toLocaleString("ru-RU")} м</b></span>
                <span>Осталось <b>{phase.remaining.toLocaleString("ru-RU")} м</b></span>
              </div>
              <PhaseChart points={phase.points} currentWeek={weekIndex} />
            </section>
          )}
        </div>

        <aside className="swim-plan-detail">
          {selected ? (
            <WorkoutDetailPanel
              programId={programId}
              workoutProgress={selected}
              isNext={selected.workout.id === progress.nextWorkout?.workout.id}
            />
          ) : (
            <div className="swim-home-card swim-plan-detail-empty">
              <Moon size={26} />
              <h4>День отдыха</h4>
              <p>Выберите тренировку в списке слева, чтобы увидеть её план.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PlanRow({
  row,
  isNext,
  selected,
  onSelect,
}: {
  row: { day: { dayIndex: number; workout: SwimWorkoutDef | null }; date: Date | null; workoutProgress: SwimWorkoutProgress | null; isToday: boolean };
  isNext: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { day, date, workoutProgress, isToday } = row;
  if (!day.workout) {
    return (
      <div className="swim-plan-row rest" aria-label={`${DAY_LABEL[day.dayIndex - 1]}: день отдыха`}>
        <span className="swim-plan-row-day"><b>{DAY_LABEL[day.dayIndex - 1]}</b>{date && <small>{date.getDate()}</small>}</span>
        <span className="swim-plan-row-title"><Moon size={14} /> День отдыха</span>
        <span className="swim-plan-row-meta">—</span>
        <span className="swim-plan-row-meta">Восстановление</span>
        <span className="swim-plan-row-status" />
      </div>
    );
  }
  const status = workoutProgress?.status ?? "not_started";
  return (
    <button
      type="button"
      className={`swim-plan-row${selected ? " selected" : ""}${isToday ? " today" : ""}`}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <span className="swim-plan-row-day"><b>{DAY_LABEL[day.dayIndex - 1]}</b>{date && <small>{date.getDate()}</small>}</span>
      <span className="swim-plan-row-title">
        <strong>{day.workout.title}</strong>
        <small>{formatMeters(totalDistanceMeters(day.workout)) ?? "—"} · {day.workout.estimatedMinutes} мин</small>
      </span>
      <span className="swim-plan-row-meta">{formatMeters(totalDistanceMeters(day.workout)) ?? "—"}</span>
      <span className="swim-plan-row-meta">{day.workout.goal}</span>
      <span className="swim-plan-row-status">
        {isToday && status !== "completed" ? (
          <span className="swim-plan-status-pill today">Сегодня</span>
        ) : (
          <StatusIcon status={status} />
        )}
        {isNext && status === "not_started" && !isToday && <span className="swim-plan-status-pill">Далее</span>}
      </span>
    </button>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <span className="swim-plan-status-icon completed" title="Выполнено"><Check size={13} /></span>;
  if (status === "in_progress") return <span className="swim-plan-status-icon progress" title="Идёт сейчас"><Play size={11} /></span>;
  if (status === "awaiting_confirmation") return <span className="swim-plan-status-icon waiting" title="Ожидает подтверждения"><Clock3 size={12} /></span>;
  return <span className="swim-plan-status-icon" title="Запланировано"><Circle size={10} /></span>;
}

function SummaryTile({ icon, label, value, pct }: { icon: React.ReactNode; label: string; value: string; pct: number | null }) {
  return (
    <article className="swim-home-card swim-plan-summary-tile">
      <span className="swim-plan-summary-icon">{icon}</span>
      <div>
        <b>{label}</b>
        <p>{value}</p>
        {pct !== null && <small>{pct}% от цели</small>}
      </div>
    </article>
  );
}

function PhaseChart({ points, currentWeek }: { points: { weekIndex: number; target: number; actual: number }[]; currentWeek: number }) {
  const width = 640;
  const height = 110;
  const padding = 20;
  const maxValue = Math.max(...points.map((p) => Math.max(p.target, p.actual)), 1);
  const x = (weekIndex: number) => padding + ((weekIndex - 1) / Math.max(1, points.length - 1)) * (width - padding * 2);
  const y = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);
  const targetPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.weekIndex)},${y(p.target)}`).join(" ");
  const actualPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.weekIndex)},${y(p.actual)}`).join(" ");
  return (
    <svg className="swim-plan-chart" viewBox={`0 0 ${width} ${height + 18}`} role="img" aria-label="Прогресс объёма по неделям">
      <path d={targetPath} className="swim-plan-chart-target" />
      <path d={actualPath} className="swim-plan-chart-actual" />
      {points.map((p) => (
        <circle key={p.weekIndex} cx={x(p.weekIndex)} cy={y(p.actual)} r={p.weekIndex === currentWeek ? 5 : 3} className={p.weekIndex === currentWeek ? "swim-plan-chart-dot current" : "swim-plan-chart-dot"} />
      ))}
      {points.map((p) => (
        <text key={p.weekIndex} x={x(p.weekIndex)} y={height + 14} textAnchor="middle" className="swim-plan-chart-label">
          Неделя {p.weekIndex}
        </text>
      ))}
    </svg>
  );
}

function WorkoutDetailPanel({ programId, workoutProgress, isNext }: { programId: string; workoutProgress: SwimWorkoutProgress; isNext: boolean }) {
  const { workout, status } = workoutProgress;
  const stages = (["warmup", "main", "legs", "cooldown"] as StageKey[])
    .map((key) => ({ key, intervals: workout.intervals.filter((interval) => stageOf(interval) === key) }))
    .filter((stage) => stage.intervals.length > 0);
  const paceCandidates = workout.intervals.flatMap((interval) => (interval.targetPaceSecondsPer100 ? [interval.targetPaceSecondsPer100] : []));
  const paceLabel = paceCandidates.length
    ? (() => {
        const min = Math.min(...paceCandidates);
        const max = Math.max(...paceCandidates);
        const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
        return min === max ? `${fmt(min)}/100м` : `${fmt(min)}–${fmt(max)}/100м`;
      })()
    : null;

  const href = `/swim/workouts/${programId}/${workout.id}`;
  const ctaLabel = status === "in_progress" ? "Продолжить тренировку" : status === "awaiting_confirmation" ? "Подтвердить результат" : "Начать тренировку";

  return (
    <div className="swim-home-card swim-plan-detail-panel">
      <div className="swim-plan-detail-head">
        <h3>{workout.title}</h3>
      </div>
      {isNext && <span className="swim-plan-badge">Основная цель</span>}
      <p className="swim-plan-detail-sub">{LEVEL_LABEL[workout.level] ?? workout.level} · {STATUS_LABEL[status]}</p>

      <div className="swim-plan-detail-stats">
        <span><b>{formatMeters(totalDistanceMeters(workout)) ?? "—"}</b><small>Объём</small></span>
        <span><b>{workout.estimatedMinutes} мин</b><small>Время</small></span>
        <span><b>{LEVEL_LABEL[workout.level] ?? workout.level}</b><small>Уровень</small></span>
      </div>

      <h4 className="swim-plan-detail-heading">Описание</h4>
      <p className="swim-plan-detail-desc">{workout.goal}</p>

      <h4 className="swim-plan-detail-heading">Структура тренировки</h4>
      <div className="swim-plan-structure">
        {stages.map((stage) => {
          const volume = stage.intervals.reduce((sum, interval) => sum + intervalTotalMeters(interval), 0);
          const first = stage.intervals[0];
          const repeats = stage.intervals.reduce((sum, interval) => sum + Math.max(1, interval.repeats), 0);
          return (
            <div className="swim-plan-structure-row" key={stage.key}>
              <i className={STAGE_TONE[stage.key]} />
              <div>
                <b>{STAGE_LABEL[stage.key]}</b>
                <small>
                  {repeats} × {first.distanceMeters} м · {exerciseLabelRu(first.exerciseId)}
                  {first.restSeconds ? ` · Отдых ${first.restSeconds} сек` : ""}
                </small>
              </div>
              <strong>{volume.toLocaleString("ru-RU")} м</strong>
            </div>
          );
        })}
      </div>

      {paceLabel && (
        <>
          <h4 className="swim-plan-detail-heading">Рекомендации</h4>
          <div className="swim-plan-recommend">
            <span><Gauge size={16} /><div><small>Темп</small><b>{paceLabel}</b></div></span>
          </div>
        </>
      )}

      {status === "completed" ? (
        <div className="swim-plan-detail-actions">
          <Link href={href} className="swim-plan-secondary-action">
            Тренировка выполнена · смотреть
          </Link>
        </div>
      ) : (
        <div className="swim-plan-detail-actions">
          <Link href={href} className="swim-plan-primary-action">
            <Play size={15} fill="currentColor" /> {ctaLabel}
          </Link>
          <Link href={href} className="swim-plan-secondary-action">
            Подробнее
          </Link>
        </div>
      )}
    </div>
  );
}
