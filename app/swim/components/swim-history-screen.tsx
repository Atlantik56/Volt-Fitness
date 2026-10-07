"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, RefreshCw, Search, Waves } from "lucide-react";
import { SwimNavigation } from "../swim-navigation";
import { HistoryList } from "./history-list";
import { summarizeHistory } from "@/lib/swim/history-view";
import { formatDuration, formatKm } from "@/lib/swim-metrics";
import type { SwimHistoryData, SwimHistorySource } from "@/app/swim/types";

type SourceFilter = "all" | SwimHistorySource;
const FILTER_LABEL: Record<SourceFilter, string> = { all: "Все", manual: "Бассейн", imported_metric: "Импорт Garmin" };
const EMPTY: SwimHistoryData = { items: [], hasAnyHistory: false };

// Sprint 3 (History) — только журнал завершённых заплывов: итог журнала,
// главы по месяцам, фильтр по источнику, поиск по названию, переход в детали.
// Никаких трендов/рекордов/heatmap — это отдельный спринт Analytics
// (docs/volt-swim/SPRINTS.md).
export function SwimHistoryScreen() {
  const [data, setData] = useState<SwimHistoryData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");

  // Загрузка не трогает state синхронно — состояние меняется только в
  // колбэках промиса, поэтому эффект остаётся без прямого setState.
  const fetchHistory = useCallback(
    () =>
      fetch("/api/swim/history", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("request failed"))))
        .then((json: SwimHistoryData) => { setData(json); setError(false); })
        .catch(() => setError(true))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { void fetchHistory(); }, [fetchHistory]);
  const retry = () => { setLoading(true); void fetchHistory(); };

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return data.items.filter((item) => {
      if (filter !== "all" && item.source !== filter) return false;
      if (trimmed && !item.title.toLowerCase().includes(trimmed)) return false;
      return true;
    });
  }, [data.items, filter, query]);

  const hasActiveFilter = filter !== "all" || query.trim().length > 0;
  const resetFilters = () => { setFilter("all"); setQuery(""); };
  // Итог всегда описывает ровно то, что сейчас на экране — при активном
  // фильтре подпись меняется, чтобы сумма не выдавала себя за «за всё время».
  const totals = useMemo(() => summarizeHistory(filtered), [filtered]);

  return (
    <div className="swim-plan swim-history">
      <header className="swim-plan-header">
        <div>
          <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>История</b></p>
          <h1>История</h1>
          <p>Журнал завершённых и подтверждённых заплывов.</p>
        </div>
        <div className="swim-header-tools" aria-label="Состояние синхронизации">
          <button type="button" aria-label="Календарь"><CalendarDays size={19} /></button>
          <span><RefreshCw size={14} /> Синхронизировано <i /></span>
          <button type="button" aria-label="Уведомления"><Bell size={18} /><i /></button>
        </div>
      </header>

      <SwimNavigation />

      {error && (
        <div className="swim-home-error" role="alert">
          Не удалось загрузить историю. <button onClick={retry}>Повторить</button>
        </div>
      )}

      {loading ? (
        <div className="swim-history-loading" aria-busy="true">
          <div className="swim-loading-line" style={{ height: 104, marginBottom: 24 }} />
          <div className="swim-loading-line" style={{ width: "40%", marginBottom: 14 }} />
          <div className="swim-loading-line" style={{ height: 88, marginBottom: 12 }} />
          <div className="swim-loading-line" style={{ height: 88 }} />
        </div>
      ) : !data.hasAnyHistory ? (
        <div className="swim-glass swim-history-empty">
          <Waves size={30} />
          <b>Журнал пока пуст</b>
          <p>Здесь появится каждый завершённый и подтверждённый заплыв — с дистанцией, временем и темпом.</p>
          <Link href="/swim/workouts" className="swim-btn primary">Открыть план тренировок</Link>
        </div>
      ) : (
        <>
          <section className="swim-home-card swim-history-hero" aria-label="Итог журнала">
            {/* Чисто декоративный слой: один раз проигрывает блик при
                открытии и застывает (VOLT_SWIM.md — не более одного фонового
                водного эффекта, без бесконечных переливов). Данных не несёт. */}
            <span className="swim-history-hero-shine" aria-hidden="true" />
            <span className="swim-history-hero-track" aria-hidden="true" />
            <p className="swim-eyebrow">{hasActiveFilter ? "По текущему фильтру" : "За всё время"}</p>
            <div className="swim-history-hero-stats">
              <div>
                <strong>{formatKm(totals.distanceMeters) ?? "—"}</strong>
                <small>Проплыто</small>
              </div>
              <div>
                <strong>{totals.count}</strong>
                <small>Заплывов</small>
              </div>
              <div>
                <strong>{formatDuration(totals.durationSeconds) ?? "—"}</strong>
                <small>В воде</small>
              </div>
            </div>
          </section>

          {/* Фильтр и поиск — одна стеклянная панель (не два отдельных
              контрола), как единый пульт управления журналом. */}
          <div className="swim-glass swim-history-toolbar">
            <div className="swim-plan-period-tabs" role="tablist" aria-label="Источник">
              {(Object.keys(FILTER_LABEL) as SourceFilter[]).map((key) => (
                <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
                  {FILTER_LABEL[key]}
                </button>
              ))}
            </div>
            <span className="swim-history-toolbar-divider" aria-hidden="true" />
            <label className="swim-history-search">
              <Search size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по названию тренировки"
                aria-label="Поиск по тренировкам"
              />
            </label>
          </div>

          <HistoryList items={filtered} hasActiveFilter={hasActiveFilter} onResetFilters={resetFilters} />
        </>
      )}
    </div>
  );
}
