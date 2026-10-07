"use client";
import { useMemo, useState } from "react";
import { useToast } from "./toast";
import { PERIODS, PERIOD_LABELS, type Period } from "./progress-model";
import {
  MOOD_OPTIONS, filterMoodByPeriod, groupMoodByMonth, latestMood,
  type MoodLog,
} from "../lib/mood";
import { useInsightSurface } from "./use-insight-surface";

function localIso(d: Date) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
function dayLabel(iso: string, today: string) {
  if (iso === today) return "Сегодня";
  const yesterday = localIso(new Date(Date.now() - 86400000));
  if (iso === yesterday) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${iso}T00:00:00`));
}

const MOOD_COLOR: Record<string, string> = { "😊": "var(--lime)", "🙂": "#8bbf16", "😐": "#545e68", "😔": "#c9944f", "😢": "#8a5a3a", "😡": "#8a5a3a" };

export function MoodSummaryCard({ data, onOpen }: { data: any; onOpen: () => void }) {
  const last = latestMood(data.moodLogs || []);
  const today = localIso(new Date());
  return (
    <section className="mood-cta card">
      <span className="mood-cta-icon">{last ? last.mood : "🙂"}</span>
      <div className="mood-cta-copy">
        <p className="eyebrow">КАК ТЫ СЕЙЧАС</p>
        <h3>{last ? `Последняя запись: ${dayLabel(last.date, today)}` : "Пока нет ни одной записи"}</h3>
      </div>
      <button type="button" onClick={onOpen}>Отметить состояние</button>
    </section>
  );
}

export function MoodSection({ data, refresh }: { data: any; refresh: () => void }) {
  const notify = useToast();
  const today = localIso(new Date());
  const moodLogs: MoodLog[] = data.moodLogs || [];

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(30);
  const [period, setPeriod] = useState<Period>("ALL");
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Memory (AI-5): реальная поверхность показа — через /api/insights (отфильтрованы
  // Memory, показ отмечается сервером при mount этого раздела истории).
  const { insights: moodInsights, dismiss: dismissMoodInsight } = useInsightSurface("mood", today);
  const sorted = useMemo(() => [...moodLogs].sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date))), [moodLogs]);
  const recent = sorted.slice(0, 5);

  const filtered = useMemo(() => {
    let list = filterMoodByPeriod(sorted, period, new Date());
    if (moodFilter) list = list.filter(l => l.mood === moodFilter);
    return list;
  }, [sorted, period, moodFilter]);
  const grouped = useMemo(() => groupMoodByMonth(filtered), [filtered]);

  const heatDays = useMemo(() => {
    const byDate = new Map<string, MoodLog>();
    for (const l of sorted) if (!byDate.has(l.date)) byDate.set(l.date, l);
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (34 - i));
      const iso = localIso(d);
      return { iso, log: byDate.get(iso) || null };
    });
  }, [sorted]);

  const log = async (mood: string) => {
    setSaving(true);
    await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "mood", date: today, mood, note }) });
    setNote(""); setSaving(false); notify("Состояние отмечено"); refresh();
  };
  const remove = async (id: number) => {
    if (!confirm("Удалить эту запись?")) return;
    await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deleteMood", id }) });
    notify("Запись удалена"); refresh();
  };
  const saveEdit = async (e: any, id: number) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateMood", id, ...b }) });
    setEditingId(null); notify("Запись обновлена"); refresh();
  };

  return (
    <div className="mood-section">
      <section className="mood-card card">
        <div className="section-head"><div><p className="eyebrow">КАК ТЫ СЕЙЧАС</p><h3>Отметь состояние</h3></div></div>
        <div className="mood-picker">{MOOD_OPTIONS.map(m => <button key={m} type="button" disabled={saving} onClick={() => log(m)}>{m}</button>)}</div>
        <input className="mood-note" placeholder="Коротко, если хочешь (необязательно)" value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
      </section>

      <section className="mood-card card mood-heatmap-card">
        <div className="section-head"><div><p className="eyebrow">ПОСЛЕДНИЕ 5 НЕДЕЛЬ</p><h3>Календарь настроения</h3></div></div>
        <div className="mood-heatmap">
          {heatDays.map(d => (
            <div
              key={d.iso}
              className="mood-heat-cell"
              title={d.log ? `${d.iso}: ${d.log.mood}` : `${d.iso}: нет записи`}
              style={{ background: d.log ? MOOD_COLOR[d.log.mood] || "#2a2e30" : "#1a1d1f" }}
            />
          ))}
        </div>
      </section>

      <section className="mood-card card">
        <div className="section-head"><div><p className="eyebrow">ЧТО ЗАМЕТИЛ VOLT</p><h3>Закономерности настроения</h3></div></div>
        {moodInsights.length ? (
          <ul className="evening-patterns">{moodInsights.map(i => <li key={i.id} className="evening-pattern-row"><span>{i.isUpdate&&<span className="insight-updated-badge">Обновлено</span>}{i.summary}</span><button type="button" className="coach-insight-dismiss" aria-label="Скрыть этот вывод" onClick={()=>dismissMoodInsight(i)}>×</button></li>)}</ul>
        ) : (
          <p className="detail-lead">
            {moodLogs.length < 5
              ? "Пока мало записей, чтобы делать выводы — это не диагноз, а просто недостаток данных. Продолжай отмечать состояние."
              : "Пока не нашлось явных закономерностей. Это нормально — не каждое настроение объясняется тренировками или сном."}
          </p>
        )}
      </section>

      <section className="mood-card card">
        <div className="section-head"><div><p className="eyebrow">ПОСЛЕДНИЕ ЗАПИСИ</p><h3>{sorted.length ? `${Math.min(5, sorted.length)} из ${sorted.length}` : "Пока нет записей"}</h3></div>
          {sorted.length > 5 && <button type="button" className="ghost-btn" onClick={() => setHistoryOpen(v => !v)}>{historyOpen ? "Свернуть" : "Вся история"}</button>}
        </div>
        {!historyOpen && <MoodTimeline entries={recent} today={today} onDelete={remove} onEdit={setEditingId} editingId={editingId} onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} />}

        {historyOpen && <>
          <div className="metric-tabs" role="group" aria-label="Фильтр по настроению">
            <button type="button" className={moodFilter === null ? "active" : ""} onClick={() => setMoodFilter(null)}>Все</button>
            {MOOD_OPTIONS.map(m => <button key={m} type="button" className={moodFilter === m ? "active" : ""} onClick={() => setMoodFilter(m)}>{m}</button>)}
          </div>
          <div className="period-tabs" role="group" aria-label="Период истории">
            {PERIODS.map(p => <button key={p} type="button" className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{PERIOD_LABELS[p]}</button>)}
          </div>
          {filtered.length === 0 ? <p className="detail-lead">Нет записей за выбранный период.</p> : (
            <div className="history-grouped">
              {grouped.map(y => (
                <div key={y.year} className="history-year">
                  <h4>{y.year}</h4>
                  {y.months.map(mo => (
                    <div key={mo.key} className="history-month">
                      <small>{mo.label}</small>
                      <MoodTimeline entries={mo.entries.slice(0, historyVisible)} today={today} onDelete={remove} onEdit={setEditingId} editingId={editingId} onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} />
                    </div>
                  ))}
                </div>
              ))}
              {filtered.length > historyVisible && <button type="button" className="ghost-btn load-more" onClick={() => setHistoryVisible(v => v + 30)}>Показать ещё</button>}
            </div>
          )}
        </>}
      </section>
    </div>
  );
}

function MoodTimeline({ entries, today, onDelete, onEdit, editingId, onSaveEdit, onCancelEdit }: {
  entries: MoodLog[]; today: string; onDelete: (id: number) => void; onEdit: (id: number) => void;
  editingId: number | null; onSaveEdit: (e: any, id: number) => void; onCancelEdit: () => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  if (!entries.length) return <p className="detail-lead">Записей пока нет.</p>;
  return (
    <div className="mood-timeline">
      {entries.map(entry => editingId === entry.id ? (
        <form key={entry.id} className="mood-edit-form" onSubmit={e => onSaveEdit(e, entry.id)}>
          <div className="mood-edit-picker">{MOOD_OPTIONS.map(m => <label key={m}><input type="radio" name="mood" value={m} defaultChecked={entry.mood === m} />{m}</label>)}</div>
          <textarea name="note" defaultValue={entry.note} maxLength={300} placeholder="Заметка (необязательно)" />
          <div className="mood-edit-actions"><button type="button" className="ghost-btn" onClick={onCancelEdit}>Отмена</button><button type="submit">Сохранить</button></div>
        </form>
      ) : (
        <div key={entry.id} className="mood-timeline-row">
          <button type="button" className="mood-timeline-main" onClick={() => setOpenId(v => v === entry.id ? null : entry.id)}>
            <span className="mood-timeline-emoji">{entry.mood}</span>
            <span className="mood-timeline-date">{dayLabel(entry.date, today)}</span>
            {entry.note && <span className="mood-timeline-hint">есть заметка</span>}
          </button>
          <div className="mood-timeline-actions">
            <button type="button" onClick={() => onEdit(entry.id)}>Изменить</button>
            <button type="button" className="danger" onClick={() => onDelete(entry.id)}>Удалить</button>
          </div>
          {openId === entry.id && entry.note && <p className="mood-timeline-note">{entry.note}</p>}
        </div>
      ))}
    </div>
  );
}
