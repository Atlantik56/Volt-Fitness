"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Play, X } from "lucide-react";

function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readableDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function SwimPlanStartAction({ onStarted, compact = false }: { onStarted: (startedAt: string) => void; compact?: boolean }) {
  const today = localIso(new Date());
  const [open, setOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/swim/plan-start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startedAt }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error || "Не удалось начать план");
        return;
      }
      setOpen(false);
      onStarted(json.startedAt);
    } catch {
      setError("Не удалось начать план. Проверьте соединение.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`swim-plan-start-copy${compact ? " compact" : ""}`}>
        <div className="swim-plan-start-icon"><CalendarDays size={compact ? 20 : 26} /></div>
        <div>
          <h2>Подключите Foundation к Plan v2</h2>
          <p>Выберите дату активации. Week 4 и календарь придут из общего плана RITMOVIS; история останется без изменений.</p>
        </div>
        <button type="button" className="swim-plan-primary-action" onClick={() => { setStartedAt(today); setError(null); setOpen(true); }}>
          <Play size={15} fill="currentColor" /> Начать план
        </button>
      </div>

      {open && createPortal(
        <div className="swim-plan-start-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
          <section className="swim-home-card swim-plan-start-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
            <button type="button" className="swim-plan-start-close" aria-label="Закрыть" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button>
            <span className="swim-goal-pill">FOUNDATION · PLAN V2</span>
            <h2 id={titleId}>Начать план плавания?</h2>
            <p id={descriptionId}>Foundation подключится к общей программе с effective Week 4. Выбранная дата активирует Swim, но не создаёт отдельную нумерацию недель.</p>
            <label className="swim-plan-start-date">
              <span>Дата старта</span>
              <input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} disabled={busy} autoFocus />
              <small>{startedAt ? `${readableDate(startedAt)} · активация Plan v2` : "Выберите дату"}</small>
            </label>
            {error && <p className="swim-plan-start-error" role="alert">{error}</p>}
            <div className="swim-plan-start-actions">
              <button type="button" className="swim-plan-secondary-action" onClick={() => setOpen(false)} disabled={busy}>Отмена</button>
              <button type="button" className="swim-plan-primary-action" onClick={() => void start()} disabled={busy || !startedAt}>
                {busy ? "Начинаем…" : `Начать с ${readableDate(startedAt)}`}
              </button>
            </div>
          </section>
        </div>
      , document.body)}
    </>
  );
}
