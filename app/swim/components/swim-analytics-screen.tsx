"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Bell, CalendarDays, RefreshCw, Waves } from "lucide-react";
import { formatDuration, formatKm, formatMeters } from "@/lib/swim-metrics";
import type { SwimAnalyticsData, SwimAnalyticsPeriod } from "@/app/swim/types";
import { SwimNavigation } from "../swim-navigation";
import { GlassPanel } from "./glass-panel";
import { SectionHeader } from "./section-header";

const PERIOD_LABELS: Record<SwimAnalyticsPeriod, string> = { "30d": "30 дней", "90d": "90 дней", "1y": "1 год" };

export function SwimAnalyticsScreen() {
  const [period, setPeriod] = useState<SwimAnalyticsPeriod>("30d");
  const [data, setData] = useState<SwimAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchAnalytics = useCallback(() => {
    return fetch(`/api/swim/analytics?period=${period}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("request failed")))
      .then((json: SwimAnalyticsData) => { setData(json); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [period]);
  useEffect(() => { void fetchAnalytics(); }, [fetchAnalytics]);

  const maxVolume = useMemo(() => Math.max(1, ...(data?.volume.map((point) => point.distanceMeters) ?? [])), [data]);
  const delta = data?.distanceDeltaPercent;
  const dateLabel = data ? `${data.fromDate.split("-").reverse().join(".")} — ${data.toDate.split("-").reverse().join(".")}` : "";
  const periodStory = !data || data.workoutCount === 0
    ? "В выбранном периоде ещё нет подтверждённых заплывов."
    : data.workoutCount < 3
      ? "Пока это точка отсчёта. Следующие заплывы превратят её в историю прогресса."
      : delta === null || delta === undefined
        ? "Ритм уже виден, но для честного сравнения нужен полный предыдущий период."
        : delta > 0
          ? `Объём вырос на ${delta}% относительно предыдущего периода.`
          : delta < 0
            ? `Объём ниже прошлого периода на ${Math.abs(delta)}%. Это изменение ритма, а не оценка результата.`
            : "Объём сохранился на уровне предыдущего периода.";

  return (
    <div className="swim-plan swim-analytics">
      <header className="swim-plan-header">
        <div>
          <p className="swim-breadcrumb">RITMOVIS / Тренировки / Swim / <b>Аналитика</b></p>
          <h1>Аналитика</h1>
          <p>Динамика объёма и эффективности по подтверждённым заплывам.</p>
        </div>
        <div className="swim-header-tools" aria-label="Состояние синхронизации">
          <button type="button" aria-label="Календарь"><CalendarDays size={19} /></button>
          <span><RefreshCw size={14} /> Синхронизировано <i /></span>
          <button type="button" aria-label="Уведомления"><Bell size={18} /><i /></button>
        </div>
      </header>
      <SwimNavigation />

      <div className="swim-glass swim-analytics-toolbar">
        <span>Период</span>
        <div className="swim-plan-period-tabs" role="tablist" aria-label="Период аналитики">
          {(Object.keys(PERIOD_LABELS) as SwimAnalyticsPeriod[]).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={period === key} className={period === key ? "active" : ""} onClick={() => { setLoading(true); setPeriod(key); }}>{PERIOD_LABELS[key]}</button>
          ))}
        </div>
      </div>

      {error && <div className="swim-home-error" role="alert">Не удалось загрузить аналитику. <button onClick={() => { setLoading(true); void fetchAnalytics(); }}>Повторить</button></div>}
      {loading || !data ? (
        <div className="swim-history-loading swim-analytics-loading" aria-busy="true"><div className="swim-loading-line" /><div className="swim-loading-line" /><div className="swim-loading-line" /></div>
      ) : !data.hasAnyHistory ? (
        <GlassPanel className="swim-history-empty"><Waves size={30} /><b>Пока нечего анализировать</b><p>Аналитика появится после первого завершённого и подтверждённого заплыва.</p><Link href="/swim/workouts" className="swim-btn primary">Открыть план тренировок</Link></GlassPanel>
      ) : (
        <>
          <section className="swim-home-card swim-history-hero swim-analytics-story-hero" aria-label="История периода">
            <span className="swim-history-hero-track" aria-hidden="true" />
            <div className="swim-analytics-story-copy">
              <p className="swim-eyebrow">{dateLabel}</p>
              <h2>{formatKm(data.distanceMeters) ?? "Пока без дистанции"}</h2>
              <p>{periodStory}</p>
            </div>
            <div className="swim-analytics-story-meta">
              <span><b>{data.workoutCount}</b>{data.workoutCount === 1 ? "заплыв" : "заплывов"}</span>
              <span><b>{formatDuration(data.durationSeconds) ?? "—"}</b>в воде</span>
              <span><b>{data.averageDistanceMeters ? formatMeters(data.averageDistanceMeters) : "—"}</b>в среднем</span>
            </div>
          </section>

          <section className="swim-section swim-analytics-chapter">
            <SectionHeader eyebrow="Глава 1" title="Как складывался объём" />
            {data.volume.length ? (
              <GlassPanel className={`swim-analytics-volume-story ${data.volume.length <= 3 ? "sparse" : ""}`} role="img" aria-label={`Объём по неделям: ${data.volume.map((point) => `${point.label}: ${point.distanceMeters} м`).join(", ")}`}>
                <div className="swim-analytics-story-line" aria-hidden="true" />
                {data.volume.map((point, index) => (
                  <div className="swim-analytics-volume-moment" key={point.label}>
                    <i aria-hidden="true" />
                    <div><small>{point.label.split("-").reverse().join(".")}</small><b>{formatMeters(point.distanceMeters)}</b><p>{point.workoutCount} {point.workoutCount === 1 ? "заплыв" : "заплыва"} за неделю</p></div>
                    <span aria-hidden="true"><em style={{ width: `${Math.max(12, Math.round(point.distanceMeters / maxVolume * 100))}%` }} /></span>
                    {index === 0 && data.volume.length <= 3 && <strong>Точка отсчёта</strong>}
                  </div>
                ))}
              </GlassPanel>
            ) : <GlassPanel className="swim-analytics-chapter-empty">Завершённый заплыв откроет первую главу динамики.</GlassPanel>}
          </section>

          <section className="swim-section swim-analytics-chapter">
            <SectionHeader eyebrow="Глава 2" title="Что уже можно понять" />
            <GlassPanel className="swim-analytics-reading">
              <article className="primary"><div><span>Темп</span><h3>{data.avgPaceLabel ? `${data.avgPaceLabel} /100 м` : "Пока неизвестен"}</h3></div><p>{data.avgPaceLabel ? "Средний темп по заплывам, где записаны и время, и дистанция." : "Нужны одновременно время и дистанция — без них RITMOVIS не делает предположений."}</p></article>
              <article><div><span>Пульс</span><h3>{data.avgHeartRate ? `${data.avgHeartRate} уд/мин` : "Нет данных"}</h3></div><p>{data.avgHeartRate ? "Среднее только по тренировкам с записанным пульсом." : "Пульс не был записан, поэтому он не участвует в истории эффективности."}</p></article>
              <article><div><span>Техника</span><h3>Ожидает данных</h3></div><p>SWOLF и Stroke Count появятся здесь, когда эти значения будут сохранены в подтверждённых тренировках.</p></article>
            </GlassPanel>
          </section>
          {data.workoutCount === 0 && <GlassPanel className="swim-analytics-period-empty"><Activity size={22} /><div><b>В выбранном периоде нет заплывов</b><p>Выберите более длинный период, чтобы увидеть накопленную динамику.</p></div></GlassPanel>}
        </>
      )}
    </div>
  );
}
