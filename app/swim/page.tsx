"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, Bell, Bot, CalendarDays, ChevronRight, Clock3, CloudUpload, Dumbbell, Flame, Gauge, Heart, Medal, Plus, RefreshCw, Route, Waves } from "lucide-react";
import { formatDuration, formatMeters } from "@/lib/swim-metrics";
import type { SwimHomeData, SwimRecentSessionView } from "./types";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const EMPTY: SwimHomeData = {
  nextWorkout: null,
  lastSwim: null,
  weeklyActivity: { swimCount: 0, totalDistanceMeters: 0, goalMeters: null, totalDurationSeconds: 0, totalCalories: 0, avgHeartRate: null, dailyMeters: [0, 0, 0, 0, 0, 0, 0] },
  metrics: { avgPaceLabel: null, swolf: null, avgHeartRate: null, calories: null },
  hasAnySwimHistory: false,
  insights: [], recentSwims: [], monthRecord: null, effortDistribution: { easy: 0, aerobic: 0, hard: 0 },
};

export default function SwimHomePage() {
  const [data, setData] = useState<SwimHomeData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/swim", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((json: SwimHomeData) => { setData(json); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetch("/api/swim", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((json: SwimHomeData) => { setData(json); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const upload = async (file: File) => {
    const form = new FormData(); form.append("file", file);
    const response = await fetch("/api/workout-imports", { method: "POST", body: form });
    if (response.ok) load();
  };

  const weekMax = Math.max(...data.weeklyActivity.dailyMeters, 1);
  const effortTotal = data.effortDistribution.easy + data.effortDistribution.aerobic + data.effortDistribution.hard;
  const next = data.nextWorkout;

  return (
    <div className="swim-home">
      <header className="swim-home-header">
        <div>
          <p className="swim-breadcrumb">VOLT / Тренировки / <b>Swim</b></p>
          <h1>VOLT Swim</h1>
          <p>Плавай умнее. Становись сильнее.</p>
        </div>
        <div className="swim-header-tools" aria-label="Состояние синхронизации">
          <button type="button" aria-label="Календарь"><CalendarDays size={19} /></button>
          <span><RefreshCw size={14} /> Синхронизировано <i /></span>
          <button type="button" aria-label="Уведомления"><Bell size={18} /><i /></button>
        </div>
      </header>

      {error && <div className="swim-home-error" role="alert">Не удалось загрузить данные. <button onClick={load}>Повторить</button></div>}

      <section className="swim-kpi-grid" aria-label="Показатели за неделю">
        <KpiCard icon={<Waves />} label="Объём (7 дней)" value={data.weeklyActivity.totalDistanceMeters || null} kind="distance" loading={loading} accent="cyan" />
        <KpiCard icon={<CalendarDays />} label="Тренировки" value={data.weeklyActivity.swimCount || null} kind="integer" sub={data.weeklyActivity.swimCount ? "подтверждено" : "Нет заплывов"} loading={loading} accent="blue" />
        <KpiCard icon={<Clock3 />} label="Время" value={data.weeklyActivity.totalDurationSeconds || null} kind="duration" loading={loading} accent="blue" />
        <KpiCard icon={<Flame />} label="Калории" value={data.weeklyActivity.totalCalories || null} kind="calories" loading={loading} accent="orange" />
        <KpiCard icon={<Heart />} label="Ср. пульс" value={data.weeklyActivity.avgHeartRate} kind="heart" loading={loading} accent="red" />
      </section>

      <section className="swim-home-grid">
        <article className="swim-home-card swim-next-card">
          <div className="swim-next-top"><b>Следующая тренировка</b><span>{next?.status === "in_progress" ? "В процессе" : "Сегодня"}</span></div>
          {next ? <>
            <p className="swim-next-time"><Clock3 size={14} /> По плану Foundation</p>
            <h2>{next.title}</h2>
            <span className="swim-goal-pill">Основная цель</span>
            <p className="swim-next-goal">{next.goal}</p>
            <p className="swim-next-meta"><b>{formatMeters(next.distanceMeters)}</b><i /> ~{next.estimatedMinutes} мин <i /> Foundation</p>
            <div className="swim-next-actions">
              <Link href={`/swim/workouts/${next.programId}/${next.workoutId}`} className="swim-primary-action"><Route size={17} />{next.status === "not_started" ? "Начать тренировку" : "Продолжить тренировку"}<ChevronRight size={17} /></Link>
              <Link href={`/swim/workouts/${next.programId}/${next.workoutId}`} className="swim-secondary-action">Подробнее</Link>
            </div>
          </> : <div className="swim-card-empty"><h2>План завершён</h2><p>Следующей тренировки Foundation сейчас нет.</p><Link href="/swim/workouts">Открыть план</Link></div>}
        </article>

        <article className="swim-home-card swim-week-volume">
          <CardTitle title="Объём за неделю" icon={<Activity size={18} />} />
          <p className="swim-card-metric">{formatMeters(data.weeklyActivity.totalDistanceMeters) ?? "—"}</p>
          <p className="swim-card-caption">{data.weeklyActivity.goalMeters ? `${Math.round(data.weeklyActivity.totalDistanceMeters / data.weeklyActivity.goalMeters * 100)}% от цели` : "Цель недели не задана"}</p>
          <div className="swim-bars" aria-label="Дистанция по дням">
            {data.weeklyActivity.dailyMeters.map((value, index) => <div key={DAYS[index]}><span style={{ height: `${Math.max(value ? 14 : 2, value / weekMax * 100)}%` }} className={value ? "has-data" : ""} /><small>{DAYS[index]}</small></div>)}
          </div>
        </article>

        <article className="swim-home-card swim-ai-card">
          <CardTitle title="AI Coach" badge="BETA" />
          <div className="swim-ai-orb"><Bot size={42} /></div>
          {data.insights[0] ? <><b>{data.insights[0].title}</b><p>{data.insights[0].description}</p></> : <><b>{data.hasAnySwimHistory ? "Данные собираются" : "Начни с первой тренировки"}</b><p>{data.hasAnySwimHistory ? "Персональный вывод появится, когда данных будет достаточно." : "AI Coach использует только подтверждённые результаты."}</p></>}
          <button type="button" disabled><Bot size={15} /> Открыть AI Coach <ChevronRight size={15} /></button>
        </article>

        <LastWorkoutCard session={data.recentSwims[0] ?? null} />

        <article className="swim-home-card swim-quick-card">
          <CardTitle title="Быстрые действия" />
          <Link href="/swim/workouts"><CalendarDays size={18} /><span><b>План тренировок</b></span><ChevronRight size={16} /></Link>
          <button type="button" onClick={() => fileInput.current?.click()}><CloudUpload size={18} /><span><b>Импорт из Garmin</b><small>FIT / TCX</small></span><ChevronRight size={16} /></button>
          <button type="button" disabled><Plus size={18} /><span><b>Добавить вручную</b><small>Скоро</small></span><ChevronRight size={16} /></button>
          <input ref={fileInput} type="file" accept=".fit" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
        </article>

        <article className="swim-home-card swim-balance-card">
          <CardTitle title="Баланс нагрузок" />
          {effortTotal ? <div className="swim-balance-body"><div className="swim-donut" style={{ "--easy": `${data.effortDistribution.easy / effortTotal * 360}deg`, "--aerobic": `${(data.effortDistribution.easy + data.effortDistribution.aerobic) / effortTotal * 360}deg` } as React.CSSProperties}><span>{effortTotal}<small>заплывов</small></span></div><ul><li><i className="aerobic" />Обычная <b>{Math.round(data.effortDistribution.aerobic / effortTotal * 100)}%</b></li><li><i className="easy" />Лёгкая <b>{Math.round(data.effortDistribution.easy / effortTotal * 100)}%</b></li><li><i className="hard" />Тяжёлая <b>{Math.round(data.effortDistribution.hard / effortTotal * 100)}%</b></li></ul></div> : <div className="swim-card-empty compact"><Gauge size={30} /><b>Недостаточно данных</b><p>Баланс появится после подтверждённых тренировок с оценкой усилия.</p></div>}
        </article>

        <article className="swim-home-card swim-record-card">
          <CardTitle title="Рекорд месяца" />
          {data.monthRecord ? <><small>Самый длинный заплыв</small><p className="swim-record-distance">{formatMeters(data.monthRecord.distanceMeters ?? 0)}</p><b>{data.monthRecord.title}</b><p>{data.monthRecord.date}</p><Medal size={68} /></> : <div className="swim-card-empty compact"><Medal size={36} /><b>Рекордов пока нет</b><p>Первый подтверждённый заплыв появится здесь.</p></div>}
        </article>

        <article className="swim-home-card swim-recent-card">
          <CardTitle title="Недавние тренировки" action="Смотреть все" />
          {data.recentSwims.length ? <div className="swim-recent-table">{data.recentSwims.map((session) => <div key={session.id}><time>{shortDate(session.date)}</time><b>{session.title}</b><span>{formatMeters(session.distanceMeters ?? 0) ?? "—"}</span><span>{formatDuration(session.durationSeconds ?? 0) ?? "—"}</span><span>{session.paceLabel ? `${session.paceLabel}/100м` : "—"}</span><span><Heart size={13} /> {session.avgHeartRate ?? "—"}</span><em>{session.effort ?? "Без оценки"}</em></div>)}</div> : <div className="swim-card-empty compact"><Waves size={30} /><b>Тренировок пока нет</b><p>Завершённые и подтверждённые заплывы появятся здесь.</p></div>}
        </article>
      </section>
    </div>
  );
}

type KpiKind = "distance" | "integer" | "duration" | "calories" | "heart";
function KpiCard({ icon, label, value, kind, sub, loading, accent }: { icon: React.ReactNode; label: string; value: number | null; kind: KpiKind; sub?: string; loading: boolean; accent: string }) {
  const animatedValue = useCountUp(value, loading);
  const formatted = value ? formatKpiValue(kind, animatedValue) : null;
  return <article className={`swim-kpi-card ${accent}${value ? " has-data" : ""}`}><div className="swim-kpi-head"><b>{label}</b><span>{icon}</span></div>{loading ? <i className="swim-loading-line" /> : <><p>{formatted?.value ?? "—"} {formatted?.unit && <small>{formatted.unit}</small>}</p><em>{sub ?? (value ? "Подтверждённые данные" : "Нет данных")}</em></>}</article>;
}
function CardTitle({ title, icon, badge, action }: { title: string; icon?: React.ReactNode; badge?: string; action?: string }) { return <div className="swim-card-title"><h3>{title}</h3>{icon}{badge && <span>{badge}</span>}{action && <button type="button" disabled>{action} <ChevronRight size={14} /></button>}</div>; }
function LastWorkoutCard({ session }: { session: SwimRecentSessionView | null }) { return <article className="swim-home-card swim-last-card"><CardTitle title="Последняя тренировка" />{session ? <><small>{session.date}</small><h3>{session.title}</h3><p>{formatMeters(session.distanceMeters ?? 0) ?? "—"}</p><div><span><Clock3 size={14} />{formatDuration(session.durationSeconds ?? 0) ?? "—"}</span><span><Gauge size={14} />{session.paceLabel ? `${session.paceLabel}/100м` : "—"}</span><span><Heart size={14} />{session.avgHeartRate ?? "—"}</span></div><button type="button" disabled>Смотреть в истории <ChevronRight size={14} /></button></> : <div className="swim-card-empty compact"><Dumbbell size={30} /><b>Нет завершённых тренировок</b></div>}</article>; }
function shortDate(value: string) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date); }
function useCountUp(value: number | null, loading: boolean) {
  const [display, setDisplay] = useState(value ?? 0);
  useEffect(() => {
    if (loading || !value) {
      const frame = requestAnimationFrame(() => setDisplay(value ?? 0));
      return () => cancelAnimationFrame(frame);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => { const progress = Math.min(1, (now - started) / 900); const eased = 1 - Math.pow(1 - progress, 3); setDisplay(Math.round(value * eased)); if (progress < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, loading]);
  return display;
}
function formatKpiValue(kind: KpiKind, value: number) {
  if (kind === "distance") return { value: Math.round(value).toLocaleString("ru-RU"), unit: "м" };
  if (kind === "duration") return { value: formatDuration(value) ?? "0:00", unit: "" };
  if (kind === "calories") return { value: Math.round(value).toLocaleString("ru-RU"), unit: "ккал" };
  if (kind === "heart") return { value: String(Math.round(value)), unit: "уд/мин" };
  return { value: String(Math.round(value)), unit: "" };
}
