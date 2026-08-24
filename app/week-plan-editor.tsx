"use client";

// AI-11 — Гибкая неделя. Модальный редактор плана на конкретную календарную
// дату: заменить тренировку, поменять местами с другим днём недели, назначить
// отдых, отменить изменение или сбросить всю неделю к исходному плану.
// Не перестраивает остальные дни автоматически — только явные действия пользователя.

import { useMemo, useState } from "react";
import { useToast } from "./toast";
import {
  WEEK_SCHEDULE_REASON_CODES, WEEK_SCHEDULE_REASON_LABELS,
  previewReplaceText, previewSwapText, previewRestText,
  type HomeWeekDay, type ResolvedDayPlan, type WeekScheduleReasonCode,
} from "./week-schedule-model";
import { trainingLabelRu } from "../lib/training-display";

type Mode = "replace" | "swap" | "rest";

const post = (body: Record<string, unknown>) =>
  fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function dayLabel(day: ResolvedDayPlan): string {
  const d = new Date(`${day.date}T00:00:00`);
  return `${day.original.d}, ${d.getDate()} ${["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"][d.getMonth()]}`;
}

export function WeekPlanEditor({ day, weekDays, homeWeek, onClose, refresh }: {
  day: ResolvedDayPlan;
  weekDays: ResolvedDayPlan[];
  homeWeek: HomeWeekDay[];
  onClose: () => void;
  refresh: () => void;
}) {
  const notify = useToast();
  const [mode, setMode] = useState<Mode | null>(null);
  const [reasonCode, setReasonCode] = useState<WeekScheduleReasonCode>("");
  const [targetDay, setTargetSourceDay] = useState<number>(homeWeek.find(x => x.type !== "Отдых" && x.day !== day.weekday)?.day ?? homeWeek[0].day);
  const [swapDate, setSwapDate] = useState<string>(weekDays.find(x => x.date !== day.date && !x.locked?.completed && !x.locked?.openDraft)?.date ?? "");
  const [busy, setBusy] = useState(false);

  // Каталог тренировок недели для замены — без дублей по названию, только
  // существующие в текущей программе (никаких новых тренировок).
  const catalog = useMemo(() => {
    const seen = new Set<string>();
    return homeWeek.filter(x => { if (seen.has(x.title)) return false; seen.add(x.title); return true; });
  }, [homeWeek]);

  const swapCandidates = weekDays.filter(x => x.date !== day.date);
  const locked = day.locked;

  const preview = mode === "replace"
    ? previewReplaceText(day.original.d, trainingLabelRu(catalog.find(x => x.day === targetDay)?.title ?? ""))
    : mode === "rest"
    ? previewRestText(day.original.d)
    : mode === "swap" && swapDate
    ? previewSwapText(trainingLabelRu(day.scheduled.title), dayLabel(weekDays.find(x => x.date === swapDate)!))
    : "";

  const save = async () => {
    if (!mode) return;
    setBusy(true);
    try {
      const body = mode === "replace" ? { action: "weekScheduleReplace", date: day.date, assignedSourceDay: targetDay, reasonCode }
        : mode === "rest" ? { action: "weekScheduleRest", date: day.date, reasonCode }
        : { action: "weekScheduleSwap", dateA: day.date, dateB: swapDate, reasonCode };
      const r = await post(body);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { notify(j.error || "Не удалось сохранить изменение", "warn"); return; }
      notify("План обновлён"); refresh(); onClose();
    } finally { setBusy(false); }
  };

  const cancelChange = async () => {
    setBusy(true);
    try {
      const r = await post({ action: "weekScheduleCancel", date: day.date });
      if (!r.ok) { const j = await r.json().catch(() => ({})); notify(j.error || "Не удалось отменить изменение", "warn"); return; }
      notify("Изменение отменено"); refresh(); onClose();
    } finally { setBusy(false); }
  };

  const resetWeek = async () => {
    if (!confirm("Вернуть всю неделю к исходному плану? Выполненные тренировки это не затронет.")) return;
    setBusy(true);
    try {
      const r = await post({ action: "weekScheduleReset" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); notify(j.error || "Не удалось сбросить неделю", "warn"); return; }
      notify("Неделя возвращена к исходному плану"); refresh(); onClose();
    } finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="workout-modal week-plan-editor" onClick={e => e.stopPropagation()}>
      <header><div><p className="eyebrow">ИЗМЕНИТЬ ПЛАН</p><h2>{day.original.d}</h2></div><button aria-label="Закрыть" onClick={onClose}>×</button></header>

      <div className="week-plan-editor-current">
        <span>Сейчас: <b>{day.scheduled.type === "Отдых" ? "Отдых" : trainingLabelRu(day.scheduled.title)}</b>{day.changed && <em className="plan-changed-badge">План изменён</em>}</span>
        {day.changed && <small>Исходно по программе: {day.original.type === "Отдых" ? "Отдых" : trainingLabelRu(day.original.title)}</small>}
      </div>

      {locked?.anyCompleted && <p className="week-plan-editor-locked">На этот день уже выполнена хотя бы одна сессия — план дня изменить нельзя.</p>}
      {!locked?.anyCompleted && locked?.openDraft && <p className="week-plan-editor-locked">На этот день есть незавершённый черновик тренировки. Сначала продолжите или отмените его на главной, потом возвращайтесь к изменению плана.</p>}

      {!locked?.anyCompleted && !locked?.openDraft && <>
        <div className="week-plan-editor-actions" role="group" aria-label="Действие">
          <button type="button" className={mode === "replace" ? "active" : ""} onClick={() => setMode("replace")}>Заменить тренировку</button>
          <button type="button" className={mode === "swap" ? "active" : ""} onClick={() => setMode("swap")}>Поменять с другим днём</button>
          <button type="button" className={mode === "rest" ? "active" : ""} onClick={() => setMode("rest")}>Назначить отдых</button>
        </div>

        {mode === "replace" && <label>Новая тренировка<select value={targetDay} onChange={e => setTargetSourceDay(Number(e.target.value))}>
          {catalog.filter(x => x.type !== "Отдых").map(x => <option key={x.day} value={x.day}>{trainingLabelRu(x.title)}</option>)}
        </select></label>}

        {mode === "swap" && <label>Поменять с<select value={swapDate} onChange={e => setSwapDate(e.target.value)}>
          {swapCandidates.map(x => <option key={x.date} value={x.date} disabled={x.locked?.completed || x.locked?.openDraft}>
            {dayLabel(x)} — {x.scheduled.type === "Отдых" ? "Отдых" : trainingLabelRu(x.scheduled.title)}{x.locked?.completed ? " (выполнено)" : x.locked?.openDraft ? " (есть черновик)" : ""}
          </option>)}
        </select></label>}

        {mode && <label>Причина (необязательно)<select value={reasonCode} onChange={e => setReasonCode(e.target.value as WeekScheduleReasonCode)}>
          {WEEK_SCHEDULE_REASON_CODES.concat("" as any).map(code => <option key={code || "none"} value={code}>{WEEK_SCHEDULE_REASON_LABELS[code as WeekScheduleReasonCode]}</option>)}
        </select></label>}

        {mode && preview && <p className="week-plan-editor-preview">{preview}</p>}

        <footer>
          <div className="week-plan-editor-secondary-actions">
            {day.changed && <button type="button" className="ghost-btn" disabled={busy} onClick={cancelChange}>Отменить это изменение</button>}
            <button type="button" className="ghost-btn" disabled={busy} onClick={resetWeek}>Сбросить всю неделю</button>
          </div>
          <button type="button" disabled={busy || !mode || (mode === "swap" && !swapDate)} onClick={save}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        </footer>
      </>}
    </section>
  </div>;
}
