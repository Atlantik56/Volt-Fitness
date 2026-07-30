"use client";
// AI-6 — «Моя история» → «Вехи» (docs/MILESTONES.md). Компактная временная
// шкала: автоматические вехи всегда пересчитываются из уже загруженного `data`
// (measurements/workout_logs/strength_logs/program_stages/photos) — это те же
// данные, что уже показаны на других вкладках "Моей истории", не вторая копия
// и не отдельный fetch. Ручные вехи — CRUD через /api/fitness (action:
// addMilestone/updateMilestone/deleteMilestone), хранятся отдельно (см.
// lib/milestone-service.ts). Фото остаются приватными: сюда попадают только
// id/date вехи "photo-checkpoint", никогда filename/URL.
import { useMemo, useState } from "react";
import { useToast } from "./toast";
import {
  buildAutomaticMilestones, groupMilestonesByMonth, filterMilestonesByCategory, buildMonthOverview, findNewAutomaticMilestone,
  type Milestone, type MilestoneCategory,
} from "../lib/milestones";

function localIso(d: Date) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }

const CATEGORIES: MilestoneCategory[] = ["тело", "тренировки", "состояние", "этапы", "личное"];
const INITIAL_VISIBLE = 20;

function manualToMilestone(row: { id: number; occurredAt: string; title: string; note: string; category: MilestoneCategory }): Milestone {
  return {
    id: `manual-${row.id}`, kind: "manual", occurredAt: row.occurredAt, title: row.title, summary: row.note,
    sourceIds: [`milestone:${row.id}`], sourceRevision: "manual", automatic: false, category: row.category,
  };
}

export function useMilestones(data: any) {
  const today = localIso(new Date());
  return useMemo(() => {
    const automatic = buildAutomaticMilestones({
      workouts: data.workouts || [],
      strengthLogs: data.strengthLogs || [],
      measurements: data.measurements || [],
      programStages: (data.programStages || []).map((s: any) => ({ id: s.id, title: s.title, endDate: s.endDate })),
      photos: (data.photos || []).map((p: any) => ({ id: p.id, date: p.date })),
      anchor: today,
    });
    const manual = (data.milestones || []).map(manualToMilestone);
    return [...automatic, ...manual].sort((a, b) => (a.occurredAt === b.occurredAt ? a.id.localeCompare(b.id) : b.occurredAt.localeCompare(a.occurredAt)));
  }, [data.workouts, data.strengthLogs, data.measurements, data.programStages, data.photos, data.milestones, today]);
}

// Единственная веха на главной (docs/MILESTONES.md: "Главная страница
// показывает максимум одну актуальную ссылку/веху, не всю ленту.")
export function LatestMilestoneCard({ data, onOpen }: { data: any; onOpen: () => void }) {
  const milestones = useMilestones(data);
  const latest = milestones[0] || null;
  return (
    <section className="milestone-cta card">
      <span className="milestone-cta-icon">🏁</span>
      <div className="milestone-cta-copy">
        <p className="eyebrow">ВЕХИ</p>
        <h3>{latest ? latest.title : "Пока нет вех"}</h3>
      </div>
      <button type="button" onClick={onOpen}>Моя история →</button>
    </section>
  );
}

const KIND_ICON: Record<string, string> = {
  "first-workout": "🎬", "workout-count": "🔁", "personal-record": "💪", "new-min-weight": "⚖️",
  "program-stage-completed": "🧭", "best-month-regularity": "📅", "photo-checkpoint": "📷", manual: "✦",
};

const CELEBRATION_EMOJI: Record<string, string> = {
  "personal-record": "🎉", "new-min-weight": "🎉", "workout-count": "🏆",
  "first-workout": "🎬", "program-stage-completed": "🧭", "best-month-regularity": "📅", manual: "✦",
};

// AI Sprint 6, п.5 — небольшое поздравление на главной при НОВОЙ автоматической
// вехе (не при каждом заходе). "Увидено" хранится курсором last_seen_milestone_id
// в уже существующей таблице settings (см. app/api/fitness/route.ts) — без
// новой таблицы/миграции. После просмотра сообщение исчезает (mark seen).
export function NewMilestoneBanner({ data, refresh }: { data: any; refresh: () => void }) {
  const milestones = useMilestones(data);
  const newMilestone = findNewAutomaticMilestone(milestones, data.lastSeenMilestoneId ?? null);
  if (!newMilestone) return null;
  const dismiss = () => {
    fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "markMilestoneSeen", id: newMilestone.id }) })
      .then(() => refresh()).catch(() => {});
  };
  return (
    <section className="milestone-celebration card">
      <span className="milestone-celebration-icon">{CELEBRATION_EMOJI[newMilestone.kind] || "✨"}</span>
      <div className="milestone-celebration-copy"><p className="eyebrow">Поздравляем!</p><h3>{newMilestone.title}</h3></div>
      <button type="button" onClick={dismiss} aria-label="Скрыть">×</button>
    </section>
  );
}

export function MilestonesSection({ data, refresh }: { data: any; refresh: () => void }) {
  const notify = useToast();
  const milestones = useMilestones(data);
  const [category, setCategory] = useState<MilestoneCategory | null>(null);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const filtered = useMemo(() => filterMilestonesByCategory(milestones, category), [milestones, category]);
  const grouped = useMemo(() => groupMilestonesByMonth(filtered.slice(0, visible)), [filtered, visible]);
  const today = localIso(new Date());
  const monthOverview = useMemo(() => buildMonthOverview(today.slice(0, 7), {
    workouts: data.workouts || [], strengthLogs: data.strengthLogs || [], measurements: data.measurements || [],
    programStages: (data.programStages || []).map((s: any) => ({ id: s.id, title: s.title, endDate: s.endDate })),
    photos: (data.photos || []).map((p: any) => ({ id: p.id, date: p.date })), anchor: today,
  }), [data.workouts, data.strengthLogs, data.measurements, data.programStages, data.photos, today]);

  // "AI Summary" (AI Sprint 6, п.4): переиспользует существующий чат Coach —
  // никакой новой LLM-инфраструктуры. Вопрос жёстко зафиксирован и ссылается
  // только на уже показанный детерминированный список "Главных событий месяца"
  // (monthOverview.milestones) — LLM не считает числа и даты заново, только
  // комментирует то, что уже видно на экране (тот же контекст с вехами уже
  // приходит Coach'у через lib/ai-context.ts).
  const explainMonth = async () => {
    setAiBusy(true); setAiError(""); setAiSummary(null);
    try {
      const r = await fetch("/api/coach-chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, question: "Кратко (2-3 предложения) прокомментируй главные события этого месяца по моим вехам — без выдуманных цифр, только на основе уже посчитанных фактов." }),
      });
      const j = await r.json();
      if (!r.ok) setAiError(j.error || "Не удалось получить комментарий");
      else setAiSummary(j.answer);
    } catch { setAiError("Не удалось получить комментарий") }
    finally { setAiBusy(false) }
  };

  const addMilestone = async (e: any) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "addMilestone", ...b }) });
    notify(r.ok ? "Веха добавлена" : "Не удалось сохранить веху", r.ok ? "good" : "warn");
    if (r.ok) { setFormOpen(false); refresh() }
  };
  const saveEdit = async (e: any, id: number) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateMilestone", id, ...b }) });
    notify(r.ok ? "Веха обновлена" : "Не удалось сохранить", r.ok ? "good" : "warn");
    if (r.ok) { setEditingId(null); refresh() }
  };
  const removeMilestone = async (id: number) => {
    if (!confirm("Удалить эту веху? Действие необратимо.")) return;
    const r = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deleteMilestone", id }) });
    notify(r.ok ? "Веха удалена" : "Не удалось удалить", r.ok ? "good" : "warn");
    if (r.ok) refresh();
  };

  return (
    <div className="milestones-section">
      <div className="section-head">
        <div><p className="eyebrow">ИТОГИ МЕСЯЦА</p><h3>{overviewOpen ? "Lite-обзор" : "Как прошёл месяц"}</h3></div>
        <button type="button" className="ghost-btn" onClick={() => setOverviewOpen(v => !v)}>{overviewOpen ? "Свернуть" : "Открыть"}</button>
      </div>
      {overviewOpen && (
        monthOverview.hasEnoughData ? (
          <section className="digest-card card">
            <div className="digest-grid">
              <article><b>{monthOverview.workoutsCount}</b><span>тренировок в этом месяце</span></article>
              <article><b>{monthOverview.weightChange != null ? `${monthOverview.weightChange > 0 ? "+" : ""}${monthOverview.weightChange} кг` : "—"}</b><span>изменение веса</span></article>
              <article><b>{monthOverview.personalRecords.length}</b><span>новых рекордов</span></article>
              <article><b>{monthOverview.stagesCompleted.length}</b><span>завершённых этапов</span></article>
            </div>
            {monthOverview.milestones.length > 0 && (
              <div className="milestone-month-highlights">
                <p className="coach-insights-head">Главные события месяца</p>
                <ul className="evening-patterns">
                  {monthOverview.milestones.map(m => <li key={m.id} className="evening-pattern-row"><span>{KIND_ICON[m.kind] || "✦"} {m.title}</span><small>{m.occurredAt}</small></li>)}
                </ul>
              </div>
            )}
            <button type="button" className="ghost-btn" onClick={explainMonth} disabled={aiBusy}>{aiBusy ? "Спрашиваю тренера…" : "Объяснить месяц"}</button>
            {aiSummary && <p className="detail-lead ai-month-summary">{aiSummary}</p>}
            {aiError && <p className="food-error">{aiError}</p>}
          </section>
        ) : (
          <p className="detail-lead">Пока недостаточно данных за этот месяц для обзора.</p>
        )
      )}

      <div className="section-head"><div><p className="eyebrow">ВРЕМЕННАЯ ШКАЛА</p><h3>Вехи</h3></div>
        <button type="button" className={formOpen ? "ghost-btn" : "add-measurement-btn"} onClick={() => setFormOpen(v => !v)}>{formOpen ? "Закрыть" : "+ Личная веха"}</button>
      </div>

      {formOpen && (
        <form className="activity-entry card" onSubmit={addMilestone}>
          <label>Дата<input type="date" name="occurredAt" defaultValue={today} max={today} required /></label>
          <label>Заголовок<input type="text" name="title" maxLength={80} required placeholder="Например: Первый забег 5 км" /></label>
          <label>Категория<select name="category" defaultValue="личное">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <label>Заметка (необязательно)<textarea name="note" maxLength={300} rows={3} /></label>
          <button type="submit">Сохранить</button>
        </form>
      )}

      <div className="metric-tabs" role="group" aria-label="Фильтр по категории вех">
        <button type="button" className={category === null ? "active" : ""} onClick={() => setCategory(null)}>Все</button>
        {CATEGORIES.map(c => <button key={c} type="button" className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}
      </div>

      {!filtered.length ? (
        <p className="detail-lead">Пока нет вех в этой категории. Они появятся по мере тренировок, замеров и этапов — или добавь личную веху вручную.</p>
      ) : (
        <div className="history-grouped">
          {grouped.map(y => (
            <div key={y.year} className="history-year">
              <h4>{y.year}</h4>
              {y.months.map(mo => (
                <div key={mo.key} className="history-month">
                  <small>{mo.label}</small>
                  <div className="milestone-timeline">
                    {mo.items.map(m => {
                      const manualId = m.kind === "manual" ? Number(m.id.replace("manual-", "")) : null;
                      const isEditing = manualId != null && editingId === manualId;
                      if (isEditing) return (
                        <form key={m.id} className="mood-edit-form" onSubmit={e => saveEdit(e, manualId!)}>
                          <input type="date" name="occurredAt" defaultValue={m.occurredAt} max={today} required />
                          <input type="text" name="title" defaultValue={m.title} maxLength={80} required />
                          <select name="category" defaultValue={m.category}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                          <textarea name="note" defaultValue={m.summary} maxLength={300} rows={2} />
                          <div className="mood-edit-actions"><button type="button" className="ghost-btn" onClick={() => setEditingId(null)}>Отмена</button><button type="submit">Сохранить</button></div>
                        </form>
                      );
                      return (
                        <div key={m.id} className="milestone-row">
                          <span className="milestone-icon" aria-hidden="true">{KIND_ICON[m.kind] || "✦"}</span>
                          <button type="button" className="milestone-main" onClick={() => setOpenNoteId(v => v === m.id ? null : m.id)}>
                            <b>{m.title}</b><small>{m.occurredAt}</small>
                          </button>
                          {manualId != null && <div className="milestone-actions">
                            <button type="button" onClick={() => setEditingId(manualId)}>Изменить</button>
                            <button type="button" className="danger" onClick={() => removeMilestone(manualId)}>Удалить</button>
                          </div>}
                          {openNoteId === m.id && m.summary && <p className="milestone-note">{m.summary}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filtered.length > visible && <button type="button" className="ghost-btn load-more" onClick={() => setVisible(v => v + INITIAL_VISIBLE)}>Показать ещё</button>}
        </div>
      )}
    </div>
  );
}
