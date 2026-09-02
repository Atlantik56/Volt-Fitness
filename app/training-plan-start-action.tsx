"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CheckCircle2, Play, ShieldCheck, X } from "lucide-react";
import { resolveActiveProgramPosition } from "@/lib/training-program/registry";
import { ACTIVE_PROGRAM_VERSION } from "@/lib/training-program/definitions";
import type { TrainingPlanCycle } from "@/lib/training-program/types";

const readableDate = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", year: "numeric",
}).format(new Date(`${value}T12:00:00`));

export function TrainingPlanStartAction({
  cycle, today, todayTitle, nextTitle, onStarted,
}: {
  cycle?: TrainingPlanCycle | null;
  today: string;
  todayTitle: string;
  nextTitle: string | null;
  onStarted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [intent,setIntent]=useState<"start"|"restart">("start");
  const [busy, setBusy] = useState(false);
  const [serverDate,setServerDate]=useState<string|null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isTargetCycle=cycle?.programVersion===ACTIVE_PROGRAM_VERSION;
  const position = isTargetCycle?resolveActiveProgramPosition(cycle, today):null;

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

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/training-plan/start", {
        method: "POST",headers:{"content-type":"application/json"},
        body:JSON.stringify(intent==="restart"?{action:"restart",expectedStartedAt:cycle?.startedAt}:{action:"start"}),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { setError(json.error || "Не удалось начать новый план"); return; }
      setOpen(false);
      onStarted();
    } catch {
      setError("Не удалось начать план. Проверьте соединение и повторите попытку.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <section className={`plan-activation-card${isTargetCycle ? " active" : ""}`} aria-label="Запуск нового плана">
      <span className="plan-activation-icon" aria-hidden="true">{isTargetCycle ? <CheckCircle2 size={24}/> : <CalendarDays size={24}/>}</span>
      <div className="plan-activation-copy">
        <p className="eyebrow">НОВЫЙ ЦИКЛ · 8 НЕДЕЛЬ</p>
        <h2>Новый план: зал, плавание и велосипед</h2>
        <p>Две силовые, два плавания и два заезда. Интервалы и длинная база выполняются сидя; пятничный Swim меняется на Bike только вручную.</p>
        <div className="plan-activation-badges"><span><ShieldCheck size={13}/>Без домашних гантелей</span><span>Щадящий режим для ТБС</span></div>
      </div>
      {isTargetCycle&&cycle ? <div className="plan-activation-status">
        <small>{position?"ПЛАН 4.0 НАЧАТ":"ПЛАН 4.0 НАЧНЁТСЯ"}</small><b>{readableDate(cycle.startedAt)}</b>
        {position&&<span>Неделя {position.weekIndex} · День {position.dayIndex}</span>}
        <p>Сегодня: {todayTitle}</p>{nextTitle && <p>Дальше: {nextTitle}</p>}
        {position&&<button type="button" className="ghost-btn plan-activation-restart" onClick={()=>{setIntent("restart");setError(null);setServerDate(null);setBusy(true);setOpen(true)}}>Начать цикл заново</button>}
      </div> : <button type="button" className="start-btn plan-activation-start" onClick={() => { setIntent("start");setError(null);setServerDate(null);setBusy(true);setOpen(true); }}>
        <Play size={14} fill="currentColor"/>{cycle?"Перейти на Plan 4.0":"Начать новый план"}
      </button>}
    </section>

    {open && createPortal(<div className="plan-activation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section ref={dialogRef} className="plan-activation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <button type="button" className="plan-activation-close" aria-label="Закрыть" onClick={() => setOpen(false)} disabled={busy}><X size={18}/></button>
        <p className="eyebrow">{intent==="restart"?"НОВЫЙ ЦИКЛ · ПОДТВЕРЖДЕНИЕ":"НОВЫЙ ПЛАН · ПОДТВЕРЖДЕНИЕ"}</p>
        <h2 id={titleId}>{intent==="restart"?"Начать цикл заново?":"Начать новый план сегодня?"}</h2>
        <p id={descriptionId}>{intent==="restart"
          ?<>После подтверждения сервер создаст новый цикл Plan 4.0 не раньше {serverDate?readableDate(serverDate):"текущей даты по Москве"}. Календарные дни сохранятся; история и старые identity не изменятся.</>
          :<>Сервер архивирует прежний цикл и создаст отдельный Plan 4.0. Если сегодня уже есть завершённая сессия старой версии, новый цикл безопасно начнётся на следующий день. История и plan_key не переписываются.</>}</p>
        <div className="plan-activation-preview">
          <span><b>Плавание</b>Понедельник · пятница (аэробное / выносливость по неделям)</span>
          <span><b>Вело</b>Среда · обязательная длинная суббота</span>
          <span><b>Цикл</b>8 недель</span>
          <span><b>История</b>Тренировки и метрики останутся без изменений</span>
          {intent==="restart"&&<span><b>Расписание</b>Будущие переносы начнутся с чистого листа</span>}
        </div>
        {error && <p className="plan-activation-error" role="alert">{error}</p>}
        <footer><button type="button" className="ghost-btn" onClick={() => setOpen(false)} disabled={busy}>Отмена</button><button type="button" className={`start-btn${intent==="restart"?" danger-btn":""}`} onClick={() => void submit()} disabled={busy||!serverDate}>{busy ? (serverDate?"Начинаем…":"Проверяем дату…") : intent==="restart"?"Да, начать заново":"Начать план"}</button></footer>
      </section>
    </div>, document.body)}
  </>;
}
