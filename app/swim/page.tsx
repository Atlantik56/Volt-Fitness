"use client";
import { useCallback, useEffect, useState } from "react";
import { SwimNavigation } from "./swim-navigation";
import { SwimHero } from "./components/swim-hero";
import { MetricCard } from "./components/metric-card";
import { WeeklyActivityCard } from "./components/weekly-activity-card";
import { LastSwimCard } from "./components/last-swim-card";
import { QuickActions } from "./components/quick-actions";
import { AiCoachPreview } from "./components/ai-coach-preview";
import { SectionHeader } from "./components/section-header";
import type { SwimHomeData } from "./types";

export default function SwimHomePage() {
  const [data, setData] = useState<SwimHomeData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/swim", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("request failed");
        return r.json();
      })
      .then((json: SwimHomeData) => {
        setData(json);
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="swim-page-header">
        <div>
          <p className="swim-eyebrow">VOLT SWIM</p>
          <h1>Плавание</h1>
          <p>Регулярные тренировки в бассейне: цель на сегодня, недельная активность и последний заплыв в одном месте.</p>
        </div>
      </header>

      <SwimNavigation />

      {error ? (
        <div className="swim-glass swim-empty" role="alert">
          <h4>Не удалось загрузить данные VOLT Swim</h4>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <button type="button" className="swim-btn secondary" onClick={load}>
            Повторить
          </button>
        </div>
      ) : (
        <>
          <SwimHero nextWorkout={data?.nextWorkout ?? null} loading={loading} />

          <div className="swim-main-grid">
            <div>
              <section className="swim-section">
                <SectionHeader eyebrow="ПОКАЗАТЕЛИ" title="Метрики" />
                <div className="swim-grid">
                  <MetricCard label="Средний темп" value={loading ? null : data?.metrics.avgPaceLabel ?? null} unit="/ 100м" />
                  <MetricCard label="SWOLF" value={loading ? null : data?.metrics.swolf ? String(data.metrics.swolf) : null} />
                  <MetricCard label="Средний пульс" value={loading ? null : data?.metrics.avgHeartRate ? String(data.metrics.avgHeartRate) : null} unit="уд/мин" />
                  <MetricCard label="Калории" value={loading ? null : data?.metrics.calories ? String(data.metrics.calories) : null} unit="ккал" />
                </div>
              </section>
              <LastSwimCard lastSwim={data?.lastSwim ?? null} loading={loading} />
            </div>
            <div>
              <WeeklyActivityCard weeklyActivity={data?.weeklyActivity ?? { swimCount: 0, totalDistanceMeters: 0, goalMeters: null }} loading={loading} />
            </div>
          </div>

          <QuickActions onImported={load} />
          <AiCoachPreview hasHistory={!loading && !!data?.hasAnySwimHistory} insights={data?.insights ?? []} />
        </>
      )}
    </>
  );
}
