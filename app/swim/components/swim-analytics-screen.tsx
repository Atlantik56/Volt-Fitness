"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Bell, CalendarDays, RefreshCw, Waves } from "lucide-react";
import { formatDuration, formatKm, formatMeters } from "@/lib/swim-metrics";
import type { SwimAnalyticsData, SwimAnalyticsPeriod } from "@/app/swim/types";
import { SwimNavigation } from "../swim-navigation";
import { MetricCard } from "./metric-card";
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

  return (
    <div className="swim-plan swim-analytics">
      <header className="swim-plan-header">
        <div>
          <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>Аналитика</b></p>
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
        <div className="swim-history-loading" aria-busy="true"><div className="swim-loading-line" style={{ height: 210, marginBottom: 16 }} /><div className="swim-loading-line" style={{ height: 120 }} /></div>
      ) : !data.hasAnyHistory ? (
        <GlassPanel className="swim-history-empty"><Waves size={30} /><b>Пока нечего анализировать</b><p>Аналитика появится после первого завершённого и подтверждённого заплыва.</p><Link href="/swim/workouts" className="swim-btn primary">Открыть план тренировок</Link></GlassPanel>
      ) : (
        <>
          <section className="swim-section">
            <SectionHeader eyebrow={dateLabel} title="Объём плавания" />
            <div className="swim-analytics-overview">
              <GlassPanel variant="raised" className="swim-analytics-volume">
                <div className="swim-analytics-volume-head"><div><strong>{formatKm(data.distanceMeters) ?? "Нет данных"}</strong><span>за период</span></div>{delta !== null && delta !== undefined && <b className={delta >= 0 ? "positive" : "negative"}>{delta > 0 ? "+" : ""}{delta}% <small>к прошлому периоду</small></b>}</div>
                {data.volume.length ? <div className="swim-analytics-bars" role="img" aria-label={`Объём по неделям: ${data.volume.map((point) => `${point.label}: ${point.distanceMeters} м`).join(", ")}`}>{data.volume.map((point) => <div key={point.label}><span style={{ height: `${Math.max(4, Math.round(point.distanceMeters / maxVolume * 100))}%` }} /><small>{point.label.slice(5).split("-").reverse().join(".")}</small></div>)}</div> : <p className="swim-analytics-no-data">В выбранном периоде нет заплывов.</p>}
              </GlassPanel>
              <GlassPanel className="swim-analytics-total"><h3>Итого</h3><dl><div><dt>Тренировки</dt><dd>{data.workoutCount}</dd></div><div><dt>Время</dt><dd>{formatDuration(data.durationSeconds) ?? "Нет данных"}</dd></div><div><dt>Средняя дистанция</dt><dd>{data.averageDistanceMeters ? formatMeters(data.averageDistanceMeters) : "Нет данных"}</dd></div><div><dt>Калории</dt><dd>{data.calories ? `${data.calories} ккал` : "Нет данных"}</dd></div></dl></GlassPanel>
            </div>
          </section>
          <section className="swim-section">
            <SectionHeader eyebrow="Эффективность" title="Ключевые показатели" />
            <div className="swim-grid swim-analytics-metrics">
              <MetricCard label="Средний темп" value={data.avgPaceLabel} unit="/100 м" period={PERIOD_LABELS[period]} />
              <MetricCard label="Средний пульс" value={data.avgHeartRate ? String(data.avgHeartRate) : null} unit="уд/мин" period={PERIOD_LABELS[period]} />
              <MetricCard label="SWOLF" value={null} period="Не записан в тренировках" />
              <MetricCard label="Техника" value={null} period="Нет Stroke Count в журнале" />
            </div>
          </section>
          {data.workoutCount === 0 && <GlassPanel className="swim-analytics-period-empty"><Activity size={22} /><div><b>В выбранном периоде нет заплывов</b><p>Выберите более длинный период, чтобы увидеть накопленную динамику.</p></div></GlassPanel>}
        </>
      )}
    </div>
  );
}
