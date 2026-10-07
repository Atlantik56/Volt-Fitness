"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Bell, CalendarDays, RefreshCw, Trophy, Waves } from "lucide-react";
import { formatDuration, formatKm, formatMeters } from "@/lib/swim-metrics";
import type { SwimAggregateRecord, SwimRecordEntry, SwimRecordsData } from "@/app/swim/types";
import { SwimNavigation } from "../swim-navigation";
import { GlassPanel } from "./glass-panel";
import { SectionHeader } from "./section-header";

type SpotlightPeriod = "week" | "month";
type RecordKind = "distance" | "pace" | "duration" | "heart" | "calories";

const PERIOD_LABEL: Record<SpotlightPeriod, string> = { week: "Неделя", month: "Месяц" };

function dateLabel(iso: string | null): string {
  if (!iso) return "Недоступно";
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function monthLabel(key: string): string {
  const date = new Date(`${key}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const value = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function recordValue(record: SwimRecordEntry | null, kind: RecordKind): string {
  if (!record) return "Недоступно";
  if (kind === "distance") return formatMeters(record.value) ?? "Недоступно";
  if (kind === "pace") return `${formatDuration(record.value) ?? "Недоступно"} /100 м`;
  if (kind === "duration") return formatDuration(record.value) ?? "Недоступно";
  if (kind === "heart") return `${Math.round(record.value)} уд/мин`;
  return `${Math.round(record.value)} ккал`;
}

function RecordCard({ label, record, kind, featured = false }: { label: string; record: SwimRecordEntry | null; kind: RecordKind; featured?: boolean }) {
  return (
    <GlassPanel className={`swim-records-card${featured ? " featured" : ""}${record ? "" : " unavailable"}`}>
      <span>{label}</span>
      <strong>{recordValue(record, kind)}</strong>
      {record ? <><b>{record.title}</b><small>{dateLabel(record.date)}</small></> : <small>Метрика не записана в подтверждённых заплывах</small>}
    </GlassPanel>
  );
}

function AchievementCard({ label, value, context }: { label: string; value: string | null; context: string }) {
  return (
    <article className={`swim-record-achievement${value ? "" : " unavailable"}`}>
      <span>{label}</span>
      <strong>{value ?? "Недоступно"}</strong>
      <small>{value ? context : "Недостаточно записанных данных"}</small>
    </article>
  );
}

function volumeValue(record: SwimAggregateRecord): string | null {
  return record ? formatMeters(record.value) : null;
}

function swimsLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} заплывов`;
  if (mod10 === 1) return `${count} заплыв`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} заплыва`;
  return `${count} заплывов`;
}

export function SwimRecordsScreen() {
  const [data, setData] = useState<SwimRecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [spotlightPeriod, setSpotlightPeriod] = useState<SpotlightPeriod>("month");

  const fetchRecords = useCallback(() => {
    return fetch("/api/swim/records", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("request failed")))
      .then((json: SwimRecordsData) => { setData(json); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  const spotlight = data?.periodBest[spotlightPeriod];
  const spotlightRecord = spotlight?.record ?? null;

  return (
    <div className="swim-plan swim-records">
      <header className="swim-plan-header">
        <div>
          <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>Рекорды</b></p>
          <h1>Рекорды</h1>
          <p>Лучшие достижения по завершённым и подтверждённым заплывам.</p>
        </div>
        <div className="swim-header-tools" aria-label="Состояние синхронизации">
          <button type="button" aria-label="Календарь"><CalendarDays size={19} /></button>
          <span><RefreshCw size={14} /> Синхронизировано <i /></span>
          <button type="button" aria-label="Уведомления"><Bell size={18} /><i /></button>
        </div>
      </header>
      <SwimNavigation />

      {error && <div className="swim-home-error" role="alert">Не удалось загрузить рекорды. <button onClick={() => { setLoading(true); void fetchRecords(); }}>Повторить</button></div>}
      {loading || !data ? (
        <div className="swim-history-loading swim-records-loading" aria-busy="true"><div className="swim-loading-line" /><div className="swim-loading-line" /><div className="swim-loading-line" /></div>
      ) : !data.hasAnyHistory ? (
        <GlassPanel className="swim-history-empty"><Waves size={30} /><b>Первый рекорд впереди</b><p>Рекорды появятся после первого завершённого и подтверждённого заплыва.</p><Link href="/swim/workouts" className="swim-btn primary">Открыть план тренировок</Link></GlassPanel>
      ) : (
        <>
          <section className="swim-home-card swim-records-hero" aria-label="Рекорды за всё время">
            <span className="swim-history-hero-track" aria-hidden="true" />
            <div className="swim-records-lifetime">
              <p className="swim-eyebrow">Вся история</p>
              <span>Общая дистанция</span>
              <h2>{data.totalDistanceMeters ? formatKm(data.totalDistanceMeters) : "Недоступно"}</h2>
              <div className="swim-records-lifetime-stats">
                <div><strong>{data.totalSwims}</strong><small>Заплывов</small></div>
                <div><strong>{data.totalDurationSeconds ? formatDuration(data.totalDurationSeconds) : "Недоступно"}</strong><small>В воде</small></div>
                <div><strong>{dateLabel(data.firstSwimDate)}</strong><small>Первый заплыв</small></div>
              </div>
            </div>

            <GlassPanel className="swim-records-spotlight">
              <div className="swim-records-spotlight-head">
                <span><Trophy size={17} /> Личный рекорд</span>
                <div className="swim-plan-period-tabs" role="tablist" aria-label="Период личного рекорда">
                  {(Object.keys(PERIOD_LABEL) as SpotlightPeriod[]).map((period) => <button key={period} type="button" role="tab" aria-selected={spotlightPeriod === period} className={spotlightPeriod === period ? "active" : ""} onClick={() => setSpotlightPeriod(period)}>{PERIOD_LABEL[period]}</button>)}
                </div>
              </div>
              <small>Лучший заплыв</small>
              <strong>{recordValue(spotlightRecord, "distance")}</strong>
              {spotlightRecord ? <><b>{dateLabel(spotlightRecord.date)}</b><p>{spotlight?.swimCount === 1 ? "Первый личный рекорд" : `Лучший из ${spotlight?.swimCount ?? 0} заплывов периода`}</p></> : <p>В этом периоде пока нет заплыва с записанной дистанцией</p>}
            </GlassPanel>
          </section>

          <section className="swim-section swim-records-section">
            <SectionHeader eyebrow="Лучшие результаты" title="Заплывы, которые задали планку" />
            <div className="swim-records-featured">
              <RecordCard label="Самый длинный заплыв" record={data.largestSwim} kind="distance" featured />
              <RecordCard label="Лучший средний темп" record={data.fastestPace} kind="pace" />
              <RecordCard label="Самое долгое время в воде" record={data.longestDuration} kind="duration" />
              {data.highestHeartRate && <RecordCard label="Самый высокий средний пульс" record={data.highestHeartRate} kind="heart" />}
              {data.mostCalories && <RecordCard label="Больше всего калорий" record={data.mostCalories} kind="calories" />}
            </div>
          </section>

          <section className="swim-section swim-records-section">
            <SectionHeader eyebrow="Ритм тренировок" title="Как складывается постоянство" />
            <GlassPanel className="swim-records-achievements">
              <AchievementCard label="Лучший недельный объём" value={volumeValue(data.longestWeek)} context={data.longestWeek ? `Неделя с ${dateLabel(data.longestWeek.period)}` : ""} />
              <AchievementCard label="Лучший месячный объём" value={volumeValue(data.longestMonth)} context={data.longestMonth ? monthLabel(data.longestMonth.period) : ""} />
              <AchievementCard label="Самый активный месяц" value={data.mostActiveMonth ? swimsLabel(data.mostActiveMonth.swimCount) : null} context={data.mostActiveMonth ? monthLabel(data.mostActiveMonth.period) : ""} />
              <AchievementCard label="Самая длинная серия" value={data.longestStreakDays ? `${data.longestStreakDays} дн.` : null} context="Последовательные дни с заплывами" />
              <AchievementCard label="Лучший тренировочный день" value={volumeValue(data.bestTrainingDay)} context={data.bestTrainingDay ? dateLabel(data.bestTrainingDay.period) : ""} />
              <AchievementCard label="Средняя дистанция" value={data.averageDistanceMeters ? formatMeters(data.averageDistanceMeters) : null} context="Только заплывы с записанной дистанцией" />
            </GlassPanel>
          </section>

          <div className="swim-records-footnote"><Activity size={15} /><span>Все рекорды рассчитаны локально из workout_logs. Неполные метрики не заменяются нулями.</span></div>
        </>
      )}
    </div>
  );
}
