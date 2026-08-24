"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CheckCircle2, Play, ShieldCheck, X } from "lucide-react";
import { activatedPlanPosition } from "@/lib/training-program/registry";

const readableDate = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", year: "numeric",
}).format(new Date(`${value}T12:00:00`));

export function TrainingPlanStartAction({
  startedAt, today, todayTitle, nextTitle, onStarted,
}: {
  startedAt?: string | null;
  today: string;
  todayTitle: string;
  nextTitle: string | null;
  onStarted: (startedAt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverDate,setServerDate]=useState<string|null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const position = activatedPlanPosition(startedAt, today);

  useEffect(()=>{
    if(!open||serverDate)return;
    let cancelled=false;
    fetch("/api/training-plan/start",{cache:"no-store"}).then(async response=>{
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error||"Не удалось получить дату старта");
      if(!cancelled)setServerDate(json.date);
    }).catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:"Не удалось получить дату старта")})
      .finally(()=>{if(!cancelled)setBusy(false)});
    return()=>{cancelled=true};
  },[open,serverDate]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [open, busy]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/training-plan/start", { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { setError(json.error || "Не удалось начать новый план"); return; }
      setOpen(false);
      onStarted(json.startedAt);
    } catch {
      setError("Не удалось начать план. Проверьте соединение и повторите попытку.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <section className={`plan-activation-card${startedAt ? " active" : ""}`} aria-label="Запуск нового плана">
      <span className="plan-activation-icon" aria-hidden="true">{startedAt ? <CheckCircle2 size={24}/> : <CalendarDays size={24}/>}</span>
      <div className="plan-activation-copy">
        <p className="eyebrow">НОВЫЙ ЦИКЛ · 8 НЕДЕЛЬ</p>
        <h2>Новый план: зал, плавание и велосипед</h2>
        <p>Две силовые на тренажёрах и блоках, три плавания, спокойный велосипед и два дня восстановления.</p>
        <div className="plan-activation-badges"><span><ShieldCheck size={13}/>Без домашних гантелей</span><span>Щадящий режим для ТБС</span></div>
      </div>
      {startedAt && position ? <div className="plan-activation-status">
        <small>ПЛАН НАЧАТ</small><b>{readableDate(startedAt)}</b>
        <span>Неделя {position.weekIndex} · День {position.dayIndex}</span>
        <p>Сегодня: {todayTitle}</p>{nextTitle && <p>Дальше: {nextTitle}</p>}
      </div> : <button type="button" className="start-btn plan-activation-start" onClick={() => { setError(null);setServerDate(null);setBusy(true);setOpen(true); }}>
        <Play size={14} fill="currentColor"/>Начать новый план
      </button>}
    </section>

    {open && createPortal(<div className="plan-activation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section ref={dialogRef} className="plan-activation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <button type="button" className="plan-activation-close" aria-label="Закрыть" onClick={() => setOpen(false)} disabled={busy}><X size={18}/></button>
        <p className="eyebrow">НОВЫЙ ПЛАН · ПОДТВЕРЖДЕНИЕ</p>
        <h2 id={titleId}>Начать новый план сегодня?</h2>
        <p id={descriptionId}>Сервер зафиксирует {serverDate?readableDate(serverDate):"сегодняшнюю дату по Москве"} как День 1. Старый план перестанет назначать будущие тренировки, но вся история сохранится.</p>
        <div className="plan-activation-preview">
          <span><b>День 1</b>Зал A + плавание на технику</span>
          <span><b>Цикл</b>8 недель</span>
          <span><b>История</b>Останется без изменений</span>
        </div>
        {error && <p className="plan-activation-error" role="alert">{error}</p>}
        <footer><button type="button" className="ghost-btn" onClick={() => setOpen(false)} disabled={busy}>Отмена</button><button type="button" className="start-btn" onClick={() => void start()} disabled={busy||!serverDate}>{busy ? (serverDate?"Начинаем…":"Проверяем дату…") : "Начать план"}</button></footer>
      </section>
    </div>, document.body)}
  </>;
}
