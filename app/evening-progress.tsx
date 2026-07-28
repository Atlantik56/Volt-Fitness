"use client";
import { useMemo, useState } from "react";
import { useToast } from "./toast";
import {
  computeEveningScore, buildEveningCoachMessage, findEveningPatterns, computeEveningWeeklyStats,
  describeFirstDrink, EVENING_SUBTITLES,
} from "../lib/evening";

function localIso(d: Date) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
function currentWeekDates(): string[] {
  const now = new Date(), monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return localIso(d) });
}

function eveningResultFor(data: any, dateIso: string, avgFirstDrinkMinutes: number | null) {
  const row = (data.activity || []).find((x: any) => x.date === dateIso) || {};
  const workoutDone = (data.workouts || []).some((w: any) => w.date === dateIso);
  return computeEveningScore({
    workout: workoutDone,
    dinner: !!row.dinner,
    walk: !!row.walk,
    waterLiters: Number(row.waterLiters) || 0,
    sleepHours: Number(row.sleepHours) || 0,
    beers: Number(row.beers) || 0,
    firstDrinkTime: row.firstDrinkTime || "",
  }, avgFirstDrinkMinutes);
}

function todayMood(data: any, today: string) {
  return (data.moodLogs || []).find((m: any) => m.date === today) || null;
}

export function summarizeEveningToday(data: any) {
  const today = localIso(new Date());
  const row = (data.activity || []).find((x: any) => x.date === today) || {};
  const fieldsFilled = [row.workEndTime, row.firstDrinkTime, row.dinner, row.walk, row.waterLiters].filter(Boolean).length;
  const hasData = fieldsFilled > 0 || !!row.sleepHours || !!row.beers || !!todayMood(data, today);
  if (!hasData) return { hasData, subtitle: EVENING_SUBTITLES.noData };
  if (fieldsFilled < 3) return { hasData, subtitle: EVENING_SUBTITLES.partial };
  const activity = data.activity || [];
  const weekSet = new Set(currentWeekDates());
  const stats = computeEveningWeeklyStats(activity, weekSet, today);
  const patterns = findEveningPatterns(activity, data.workouts || []);
  const subtitle = patterns.length ? EVENING_SUBTITLES.newInsight : EVENING_SUBTITLES.neutral;
  const result = eveningResultFor(data, today, stats.avgFirstDrinkMinutes);
  return { hasData, subtitle, score: result.score };
}

export function EveningProgressCard({ data, onOpen }: { data: any; onOpen: () => void }) {
  const { subtitle } = summarizeEveningToday(data);
  return (
    <section className="evening-cta card">
      <span className="evening-cta-icon">🌙</span>
      <div className="evening-cta-copy"><p className="eyebrow">ВЕЧЕРНИЙ ПРОГРЕСС</p><h3>{subtitle}</h3></div>
      <button type="button" onClick={onOpen}>Посмотреть отчёт →</button>
    </section>
  );
}

export function EveningProgressPage({ data, refresh, loaded = true }: { data: any; refresh: () => void; loaded?: boolean }) {
  const notify = useToast();
  const [tab, setTab] = useState("Сегодня");
  const today = localIso(new Date());
  const activity = data.activity || [];
  const workouts = data.workouts || [];
  const todayRow = activity.find((x: any) => x.date === today) || {};
  const workoutToday = workouts.some((w: any) => w.date === today);
  const mood = todayMood(data, today);
  const weekDates = useMemo(() => currentWeekDates(), []);
  const weekSet = useMemo(() => new Set(weekDates), [weekDates]);
  const stats = useMemo(() => computeEveningWeeklyStats(activity, weekSet, today), [activity, weekSet, today]);
  const result = useMemo(() => eveningResultFor(data, today, stats.avgFirstDrinkMinutes), [data, today, stats.avgFirstDrinkMinutes]);
  const patterns = useMemo(() => findEveningPatterns(activity, workouts), [activity, workouts]);
  const coachMsg = useMemo(() => buildEveningCoachMessage(result, patterns), [result, patterns]);

  const submit = async (e: any) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    const body: any = { action: "activity", date: today, workEndTime: b.workEndTime || "", firstDrinkTime: b.firstDrinkTime || "", dinner: b.dinner ? 1 : 0, walk: b.walk ? 1 : 0, waterLiters: b.waterLiters || 0 };
    const r = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    notify(r.ok ? "Спасибо за честную запись" : "Не удалось сохранить", r.ok ? "good" : "warn");
    refresh();
  };

  if (!loaded) {
    return (
      <div className="detail-page evening-page">
        <header className="detail-intro"><p className="eyebrow">ВЕЧЕРНИЙ ПРОГРЕСС</p><h2>Отчёт за сегодня</h2><p>Загружаем данные…</p></header>
      </div>
    );
  }

  return (
    <div className="detail-page evening-page">
      <header className="detail-intro"><p className="eyebrow">ВЕЧЕРНИЙ ПРОГРЕСС</p><h2>Отчёт за сегодня</h2><p>Твой вечер. Твои результаты. Твой следующий шаг.</p></header>

      <div className="metric-tabs" role="group" aria-label="Раздел вечернего прогресса">
        {["Сегодня", "Привычки", "Алкоголь", "Аналитика"].map(x => (
          <button key={x} type="button" className={tab === x ? "active" : ""} onClick={() => setTab(x)}>{x}</button>
        ))}
      </div>

      {tab === "Сегодня" && (
        <>
          <div className="progress-hero evening-hero">
            <div className="big-ring evening-ring" style={{ background: `conic-gradient(var(--lime) ${result.score * 10}%, #2a2e30 ${result.score * 10}%)` }}>
              <div><b>{result.score}</b><span>/ 10</span></div>
            </div>
            <div>
              <small>СЕГОДНЯШНИЙ ВЕЧЕР</small>
              <h3>{result.title}</h3>
              <div className="evening-checklist">
                {result.items.map(it => <span key={it.label} className={it.done ? "done" : ""}>{it.done ? "✔" : "·"} {it.label}</span>)}
              </div>
            </div>
          </div>

          <div className="result-coach-note evening-coach-note">
            <span className="result-coach-avatar">V</span>
            <div>
              <small>AI COACH</small><b>{coachMsg.title}</b><p>{coachMsg.text}</p>
              {!patterns.length && <p className="evening-honest">Пока не хватает данных для точных выводов — они появятся, если продолжишь отмечать вечера.</p>}
            </div>
          </div>

          <div className="digest-grid evening-facts">
            <article><b>{todayRow.workEndTime || "—"}</b><span>Конец работы</span></article>
            <article><b>{todayRow.firstDrinkTime || "—"}</b><span>Первая банка</span></article>
            <article><b>{todayRow.dinner ? "✓ Был" : "—"}</b><span>Ужин</span></article>
            <article><b>{workoutToday ? "✓ Выполнена" : "—"}</b><span>Тренировка</span></article>
            <article><b>{todayRow.waterLiters ? `${todayRow.waterLiters} л` : "—"}</b><span>Вода</span></article>
            <article><b>{mood ? mood.mood : "—"}</b><span>Настроение</span></article>
          </div>
          {result.firstDrinkNote && <p className="detail-lead">{result.firstDrinkNote}</p>}

          <form className="activity-entry card evening-form" onSubmit={submit}>
            <div><p className="eyebrow">ЗАПИСЬ ЗА СЕГОДНЯ</p><h3>Как прошёл вечер</h3></div>
            <label>Конец работы<input type="time" name="workEndTime" defaultValue={todayRow.workEndTime || ""} /></label>
            <label>Первая банка (если было)<input type="time" name="firstDrinkTime" defaultValue={todayRow.firstDrinkTime || ""} /></label>
            <label className="evening-checkbox"><input type="checkbox" name="dinner" defaultChecked={!!todayRow.dinner} /> Ужин</label>
            <label className="evening-checkbox"><input type="checkbox" name="walk" defaultChecked={!!todayRow.walk} /> Прогулка</label>
            <label>Вода, л<input type="number" step="0.1" min="0" name="waterLiters" defaultValue={todayRow.waterLiters || 0} /></label>
            <button>Сохранить</button>
          </form>
        </>
      )}

      {tab === "Привычки" && <EveningHabits activity={activity} weekDates={weekDates} todayRow={todayRow} workoutToday={workoutToday} />}
      {tab === "Алкоголь" && <EveningAlcohol activity={activity} weekDates={weekDates} stats={stats} />}
      {tab === "Аналитика" && <EveningAnalytics stats={stats} patterns={patterns} />}
    </div>
  );
}

function EveningHabits({ activity, weekDates, todayRow, workoutToday }: { activity: any[]; weekDates: string[]; todayRow: any; workoutToday: boolean }) {
  const weekRows = activity.filter((a: any) => weekDates.includes(a.date));
  const habits = [
    { label: "Прогулка после работы", done: !!todayRow.walk, weekCount: weekRows.filter((a: any) => a.walk).length },
    { label: "Ужин до вечера", done: !!todayRow.dinner, weekCount: weekRows.filter((a: any) => a.dinner).length },
    { label: "Вода ≥ 1.5 л", done: (Number(todayRow.waterLiters) || 0) >= 1.5, weekCount: weekRows.filter((a: any) => (Number(a.waterLiters) || 0) >= 1.5).length },
    { label: "Тренировка сегодня", done: workoutToday, weekCount: null as number | null },
  ];
  return (
    <section className="mood-card card evening-habits">
      <div className="section-head"><div><p className="eyebrow">ПРИВЫЧКИ</p><h3>Маленькие шаги</h3></div></div>
      <div className="habit-list">
        {habits.map(h => (
          <div key={h.label} className="habit-row">
            <span className={`habit-check${h.done ? " done" : ""}`}>{h.done ? "✓" : ""}</span>
            <div><b>{h.label}</b>{h.weekCount != null && <small>{h.weekCount} из 7 дней на этой неделе</small>}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EveningAlcohol({ activity, weekDates, stats }: { activity: any[]; weekDates: string[]; stats: ReturnType<typeof computeEveningWeeklyStats> }) {
  const labels = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
  const byDate = new Map(activity.map((a: any) => [a.date, a]));
  const today = localIso(new Date());
  const max = Math.max(1, ...weekDates.map(d => Number(byDate.get(d)?.beers) || 0));
  const todayRow = byDate.get(today) || {};
  const note = describeFirstDrink(todayRow.firstDrinkTime || "", stats.avgFirstDrinkMinutes);
  return (
    <section className="digest-card card evening-alcohol">
      <div className="section-head"><div><p className="eyebrow">АЛКОГОЛЬ</p><h3>Не главный показатель — просто факт вечера</h3></div></div>
      {note && <p className="detail-lead">{note}</p>}
      <div className="chart-wrap evening-alcohol-chart">
        <div className="chart-labels"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div>
        <div className="bars" aria-label="Банки за неделю">
          {weekDates.map((d, i) => {
            const v = Number(byDate.get(d)?.beers) || 0;
            return <div className="bar-slot" key={d} title={`${labels[i]}: ${v}`}><i style={{ height: `${(v / max) * 100}%` }} className={d === today ? "today" : ""} /></div>;
          })}
        </div>
      </div>
      <div className="week-days">{weekDates.map((d, i) => <div key={d} className={`day${d === today ? " active" : ""}`}><small>{labels[i]}</small></div>)}</div>
      <p className="detail-lead">Среднее время первой банки: {stats.avgFirstDrinkLabel || "пока нет данных"}.</p>
    </section>
  );
}

function EveningAnalytics({ stats, patterns }: { stats: ReturnType<typeof computeEveningWeeklyStats>; patterns: string[] }) {
  return (
    <>
      <section className="digest-card card">
        <div className="section-head"><div><p className="eyebrow">ИТОГИ НЕДЕЛИ</p><h3>Без «серий» — только факты</h3></div></div>
        <div className="digest-grid">
          <article><b>{stats.avgFirstDrinkLabel || "—"}</b><span>Среднее время первой банки</span></article>
          <article><b>{stats.changeMinutes != null ? `${stats.changeMinutes > 0 ? "+" : ""}${Math.round(stats.changeMinutes)} мин` : "—"}</b><span>к прошлой неделе</span></article>
          <article><b>{stats.betterEveningsCount}</b><span>вечеров лучше среднего</span></article>
          <article><b>{stats.caloriesSaved}</b><span>ккал сэкономлено</span></article>
          <article><b>{stats.bestEveningLabel || "—"}</b><span>лучший вечер недели</span></article>
        </div>
      </section>
      <section className="mood-card card">
        <div className="section-head"><div><p className="eyebrow">ЗАКОНОМЕРНОСТИ</p><h3>Что заметил VOLT</h3></div></div>
        {patterns.length ? (
          <ul className="evening-patterns">{patterns.map(p => <li key={p}>{p}</li>)}</ul>
        ) : (
          <p className="detail-lead">Пока недостаточно данных, чтобы найти закономерности. Продолжай отмечать вечера — через пару недель здесь появятся первые наблюдения.</p>
        )}
      </section>
    </>
  );
}
