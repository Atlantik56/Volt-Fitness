"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CloudUpload,
  Gauge,
  HeartPulse,
  Pause,
  Play,
  Route,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import AuthGate from "@/app/auth-gate";
import { createSubmissionGuard } from "@/app/submission-guard";
import {
  cyclingHomeSummary,
  cyclingSnapshotFor,
  resolveCyclingAssignment,
  type CyclingDraftRecord,
  type CyclingResolution,
  type CyclingWorkoutRecord,
} from "@/app/cycling-model";
import { CYCLING_LOAD_FEEDBACK_LABELS, type CyclingLoadFeedback } from "@/lib/cycling";
import { useToast } from "@/app/toast";
import { VoltGlobalNavigation } from "@/app/volt-global-navigation";

type FitnessData = {
  profile?: { programStart?: string };
  workouts?: CyclingWorkoutRecord[];
  workoutDrafts?: CyclingDraftRecord[];
  weekScheduleChanges?: any[];
};

type View = "home" | "details";

const localIso = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const dateLabel = (iso: string) => new Intl.DateTimeFormat("ru-RU", {
  weekday: "long", day: "numeric", month: "long",
}).format(new Date(`${iso}T12:00:00`));

const durationLabel = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes > 0 ? `${minutes} мин` : "—";
};

const metric = (value: unknown, suffix = "") => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}${suffix}` : "—";
};

function parseDbTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

const elapsedFrom = (start: string | null | undefined) =>
  Math.max(0, Math.round((Date.now() - (parseDbTime(start)?.getTime() ?? Date.now())) / 1000));

function plannedMinutes(resolution: CyclingResolution) {
  const values = String(resolution.session.time).match(/\d+/g)?.map(Number) ?? [];
  return values.at(-1) ?? 30;
}

export function CyclingClient({ initialDate, backgroundSrc }: { initialDate: string | null; backgroundSrc: string }) {
  const notify = useToast();
  const today = localIso(new Date());
  const [data, setData] = useState<FitnessData>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("home");
  const [draftOverride, setDraftOverride] = useState<CyclingDraftRecord | null>(null);
  const [pending, setPending] = useState(false);
  const guard = useRef(createSubmissionGuard());

  const load = async () => {
    try {
      const response = await fetch("/api/fitness", { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить данные VOLT");
      const json = await response.json();
      setData(json);
      setDraftOverride(null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные VOLT");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const drafts = useMemo(() => draftOverride
    ? [draftOverride, ...(data.workoutDrafts ?? []).filter((item) => item.id !== draftOverride.id)]
    : (data.workoutDrafts ?? []), [data.workoutDrafts, draftOverride]);
  const resolution = useMemo(() => resolveCyclingAssignment({
    programStart: data.profile?.programStart,
    today,
    selectedDate: initialDate,
    weekScheduleChanges: data.weekScheduleChanges,
    workoutDrafts: drafts,
    workouts: data.workouts,
  }), [data, drafts, initialDate, today]);
  const summary = useMemo(() => resolution
    ? cyclingHomeSummary(data.workouts ?? [], resolution.mondayIso, resolution.sundayIso)
    : null, [data.workouts, resolution]);

  const perform = async (body: Record<string, unknown>) => {
    setPending(true);
    try {
      const result = await guard.current.run(async () => {
        const response = await fetch("/api/fitness", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Не удалось сохранить тренировку");
        return json;
      });
      return result;
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Не удалось сохранить тренировку", "warn");
      return null;
    } finally {
      setPending(false);
    }
  };

  const start = async () => {
    if (!resolution || resolution.status === "completed") return;
    const result = await perform({
      action: "startWorkoutDraft",
      date: resolution.date,
      snapshot: cyclingSnapshotFor(resolution),
    });
    if (result?.draft) {
      setDraftOverride(result.draft);
      notify("Cycling-тренировка начата");
      void load();
    }
  };

  const finish = async () => {
    if (!resolution?.draft || resolution.status !== "active") return;
    const result = await perform({ action: "finishWorkoutDraft", id: resolution.draft.id, expectedStatus: "active" });
    if (result?.draft) {
      setDraftOverride(result.draft);
      notify("Заезд завершён — подтвердите результат", "info");
      void load();
    }
  };

  const cancel = async () => {
    if (!resolution?.draft || (resolution.status !== "active" && resolution.status !== "awaiting_confirmation")) return;
    const result = await perform({ action: "cancelWorkoutDraft", id: resolution.draft.id, expectedStatus: resolution.status });
    if (result?.draft) {
      setDraftOverride(null);
      setView("home");
      notify("Черновик Cycling отменён", "info");
      void load();
    }
  };

  const confirm = async (body: Record<string, unknown>) => {
    if (!resolution?.draft || resolution.status !== "awaiting_confirmation") return;
    const result = await perform({
      action: "confirmWorkoutDraft",
      id: resolution.draft.id,
      expectedStatus: "awaiting_confirmation",
      ...body,
    });
    if (result?.draft) {
      setDraftOverride(null);
      setView("home");
      notify("Заезд сохранён в общей истории VOLT");
      await load();
    }
  };

  const shellStyle = { "--cycling-bg": `url(${backgroundSrc})` } as CSSProperties;

  return <AuthGate><main className="cycling-shell" style={shellStyle}>
    <div className="cycling-page-shade" aria-hidden="true" />
    <VoltGlobalNavigation environment="cycling" />

    <div className="cycling-content">
      {!loaded ? <CyclingLoading /> : error ? <CyclingError message={error} onRetry={load} /> : !resolution || !summary
        ? <CyclingUnavailable />
        : resolution.status === "active"
          ? <CyclingActive resolution={resolution} pending={pending} onFinish={finish} onCancel={cancel} />
          : resolution.status === "awaiting_confirmation"
            ? <CyclingResult resolution={resolution} pending={pending} onConfirm={confirm} onCancel={cancel} onImported={load} />
            : view === "details"
              ? <CyclingDetails resolution={resolution} pending={pending} onBack={() => setView("home")} onStart={start} />
              : <CyclingHome resolution={resolution} summary={summary} onOpenDetails={() => setView("details")} />}
    </div>
  </main></AuthGate>;
}

function CyclingHome({ resolution, summary, onOpenDetails }: {
  resolution: CyclingResolution;
  summary: ReturnType<typeof cyclingHomeSummary>;
  onOpenDetails: () => void;
}) {
  const statusLabel = resolution.status === "completed" ? "Тренировка выполнена" : "Открыть тренировку";
  const feedback = summary.latestLoadFeedback ? CYCLING_LOAD_FEEDBACK_LABELS[summary.latestLoadFeedback] : "Пока нет feedback";
  return <div className="cycling-home">
    <section className="cycling-hero-copy">
      <p className="cycling-kicker">СПЕЦИАЛИЗИРОВАННЫЙ COCKPIT VOLT</p>
      <h1>VOLT <em>CYCLING</em></h1>
      <h2>Спокойная аэробная работа</h2>
      <p>Движение. Выносливость. Прогресс.</p>
    </section>

    <section className="cycling-next-card cycling-glass">
      <p className="cycling-section-label">СЛЕДУЮЩАЯ ТРЕНИРОВКА</p>
      <div className="cycling-next-meta"><CalendarDays size={17} /><b>{dateLabel(resolution.date)}</b>{resolution.optional && <span>Optional</span>}{resolution.changed && <span>План изменён</span>}</div>
      <h2>{resolution.session.title}</h2>
      <strong>{resolution.session.time}</strong>
      <ul>
        <li>Лёгкое сопротивление</li>
        <li>Ровное педалирование</li>
        <li>Без силовой работы</li>
      </ul>
      <button type="button" className={resolution.status === "completed" ? "cycling-complete-button" : "cycling-primary"} onClick={onOpenDetails}>
        {resolution.status === "completed" ? <Check size={18} /> : <Play size={17} fill="currentColor" />}{statusLabel}
      </button>
    </section>

    <section className="cycling-metrics" aria-label="Показатели Cycling за неделю">
      <Metric icon={<Clock3 />} label="Времени в седле" value={durationLabel(summary.durationSeconds)} />
      <Metric icon={<Bike />} label="Поездок" value={String(summary.rides)} />
      <Metric icon={<HeartPulse />} label="Средний пульс" value={metric(summary.averageHeartRate, " уд/мин")} danger />
      <Metric icon={<Gauge />} label="Средняя скорость" value={metric(summary.averageSpeed, " км/ч")} />
    </section>

    <section className="cycling-last cycling-glass">
      <div><p className="cycling-section-label">ПОСЛЕДНЯЯ ПОЕЗДКА</p>{summary.lastRide
        ? <><h3>{summary.lastRide.title}</h3><span>{dateLabel(summary.lastRide.date)} · {summary.lastRide.metricsSource === "imported_metric" ? "FIT / Garmin" : "Вручную"}</span></>
        : <><h3>Завершённых поездок пока нет</h3><span>Первая подтверждённая тренировка появится здесь.</span></>}</div>
      {summary.lastRide && <div className="cycling-last-values">
        <Value label="Время" value={durationLabel(Number(summary.lastRide.durationSeconds) || 0)} />
        <Value label="Дистанция" value={metric(Number(summary.lastRide.distanceMeters) / 1000, " км")} />
        <Value label="Средний пульс" value={metric(summary.lastRide.avgHeartRate)} />
      </div>}
    </section>

    <div className="cycling-lower-grid">
      <section className="cycling-program cycling-glass"><p className="cycling-section-label">ОБЩАЯ ПРОГРАММА VOLT</p><h3>Неделя {resolution.programWeek}</h3><p>Bike остаётся optional-сессией общего Plan. Прогресс идёт по длительности, без гонки за сопротивлением.</p><div><i style={{ width: `${Math.min(100, Math.max(12, resolution.programWeek * 7))}%` }} /></div></section>
      <section className={`cycling-feedback cycling-glass ${summary.latestLoadFeedback === "pain" ? "pain" : ""}`}><p className="cycling-section-label">КАК ПЕРЕНОСИТСЯ НАГРУЗКА?</p><h3>{feedback}</h3><p>Это субъективный тренировочный feedback, не медицинский вывод.</p></section>
    </div>

    <aside className="cycling-safety"><ShieldCheck size={20} /><p><b>Спокойный темп.</b> Увеличивайте прежде всего время, а не сопротивление. При боли завершите тренировку и ориентируйтесь на рекомендации специалиста.</p></aside>
  </div>;
}

function CyclingDetails({ resolution, pending, onBack, onStart }: { resolution: CyclingResolution; pending: boolean; onBack: () => void; onStart: () => void }) {
  const complete = resolution.status === "completed";
  return <section className="cycling-flow-card cycling-glass">
    <button type="button" className="cycling-back" onClick={onBack}><ArrowLeft size={16} />На Cycling Home</button>
    <p className="cycling-section-label">DETAILS · {dateLabel(resolution.date).toUpperCase()}</p>
    <h1>{resolution.session.title}</h1>
    <div className="cycling-details-meta"><span><Clock3 size={16} />{resolution.session.time}</span>{resolution.optional && <span><Check size={16} />Optional</span>}</div>
    <div className="cycling-phase-list">{resolution.session.exercises.map((exercise: any[], index: number) => <article key={`${exercise[0]}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{exercise[0]}</h3><p>{exercise[1]}</p><b>{exercise[2]}</b></div></article>)}</div>
    <div className="cycling-limits"><ShieldCheck size={20} /><div><b>Ограничения этой сессии</b><p>Лёгкое сопротивление · ровное педалирование · без силовой работы.</p></div></div>
    <button type="button" className={complete ? "cycling-complete-button" : "cycling-primary"} disabled={complete || pending} onClick={onStart}>{complete ? <Check size={18} /> : <Play size={18} fill="currentColor" />}{complete ? "Уже сохранено в VOLT" : pending ? "Запускаем…" : "Начать тренировку"}</button>
  </section>;
}

function CyclingActive({ resolution, pending, onFinish, onCancel }: { resolution: CyclingResolution; pending: boolean; onFinish: () => void; onCancel: () => void }) {
  const elapsed = useElapsedSeconds(resolution.draft?.startedAt);
  const total = plannedMinutes(resolution) * 60;
  const progress = Math.min(100, (elapsed / Math.max(1, total)) * 100);
  const phases = resolution.session.exercises;
  const phaseIndex = Math.min(phases.length - 1, Math.floor((progress / 100) * phases.length));
  return <section className="cycling-active-card cycling-glass">
    <p className="cycling-section-label">ACTIVE · СПОКОЙНЫЙ ЗАЕЗД</p>
    <div className="cycling-timer"><TimerReset size={27} /><b>{clock(elapsed)}</b><span>из ~{plannedMinutes(resolution)} мин</span></div>
    <div className="cycling-active-progress"><i style={{ width: `${progress}%` }} /></div>
    <article className="cycling-current-phase"><span>ТЕКУЩАЯ ФАЗА</span><h1>{phases[phaseIndex]?.[0] ?? "Спокойное педалирование"}</h1><p>{phases[phaseIndex]?.[1] ?? "Сохраняйте ровный разговорный темп."}</p></article>
    <div className="cycling-live-metrics"><Value label="План" value={resolution.session.time} /><Value label="Характер" value="Лёгкий" /><Value label="Метрики" value="После завершения" /></div>
    <p className="cycling-active-note"><Activity size={17} />Не нужно отмечать подходы или повторы. Фактические метрики можно добавить на следующем шаге.</p>
    <footer><button type="button" className="cycling-secondary danger" disabled={pending} onClick={onCancel}>Безопасно отменить</button><button type="button" className="cycling-primary" disabled={pending} onClick={onFinish}><Pause size={17} />{pending ? "Завершаем…" : "Завершить заезд"}</button></footer>
  </section>;
}

function CyclingResult({ resolution, pending, onConfirm, onCancel, onImported }: {
  resolution: CyclingResolution;
  pending: boolean;
  onConfirm: (body: Record<string, unknown>) => void;
  onCancel: () => void;
  onImported: () => Promise<void>;
}) {
  const confirmation = resolution.draft?.confirmation as any;
  const imported = confirmation?.source === "Garmin";
  const initialDuration = Math.max(1, Math.round((Number(confirmation?.duration) || plannedMinutes(resolution) * 60) / 60));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const body: Record<string, unknown> = {
      durationSeconds: Math.round(Number(raw.durationMinutes) * 60),
      effort: raw.effort,
      painAfter: Number(raw.painAfter),
      loadFeedback: raw.loadFeedback as CyclingLoadFeedback,
    };
    if (raw.distanceKm !== "") body.distanceMeters = Number(raw.distanceKm) * 1000;
    if (raw.avgHeartRate !== "") body.avgHeartRate = Number(raw.avgHeartRate);
    if (raw.avgSpeed !== "") body.avgSpeed = Number(raw.avgSpeed);
    if (raw.calories !== "") body.calories = Number(raw.calories);
    onConfirm(body);
  };
  return <form className="cycling-result-card cycling-glass" onSubmit={submit}>
    <p className="cycling-section-label">RESULT · ПОДТВЕРЖДЕНИЕ</p>
    <h1>Как прошёл заезд?</h1>
    <p className="cycling-result-source">Источник метрик: <b>{imported ? "FIT / Garmin" : "ручной ввод"}</b>{imported && " · Импортированные метрики защищены от случайного изменения."}</p>
    {resolution.draft && <CyclingFitImport draftId={resolution.draft.id} imported={imported} onImported={onImported} />}
    <div className="cycling-result-fields" key={imported ? "garmin" : "manual"}>
      <label>Фактическое время, мин<input required readOnly={imported} name="durationMinutes" type="number" min="1" max="1440" step="1" defaultValue={initialDuration} /></label>
      <label>Дистанция, км<input readOnly={imported} name="distanceKm" type="number" min="0" max="1000" step="0.01" defaultValue={confirmation?.distanceMeters ? Number(confirmation.distanceMeters) / 1000 : ""} placeholder="—" /></label>
      <label>Средний пульс<input readOnly={imported} name="avgHeartRate" type="number" min="20" max="250" defaultValue={confirmation?.averageHeartRate ?? ""} placeholder="—" /></label>
      <label>Средняя скорость, км/ч<input readOnly={imported} name="avgSpeed" type="number" min="0" max="200" step="0.1" defaultValue={confirmation?.averageSpeed ?? ""} placeholder="—" /></label>
      <label>Калории<input readOnly={imported} name="calories" type="number" min="0" max="10000" defaultValue={confirmation?.calories ?? ""} placeholder="—" /></label>
      <label>Субъективная нагрузка<select name="effort" defaultValue="Нормально"><option>Легко</option><option>Нормально</option><option>Тяжело</option><option>Боль</option></select></label>
      <label>Боль после, 0–10<input name="painAfter" type="number" min="0" max="10" defaultValue="0" /></label>
    </div>
    <fieldset className="cycling-feedback-picker"><legend>Как переносится нагрузка?</legend>{(["calm", "discomfort", "pain"] as const).map((value) => <label key={value} className={value === "pain" ? "pain" : ""}><input required type="radio" name="loadFeedback" value={value} /><span>{CYCLING_LOAD_FEEDBACK_LABELS[value]}</span></label>)}</fieldset>
    <p className="cycling-result-hint">Пустые HR, distance, speed и calories сохраняются как отсутствующие и будут показаны знаком «—».</p>
    <div className="cycling-result-actions">
      <button className="cycling-secondary danger" disabled={pending} type="button" onClick={onCancel}>Отменить тренировку</button>
      <button className="cycling-primary" disabled={pending} type="submit"><Check size={18} />{pending ? "Сохраняем…" : "Подтвердить и сохранить в VOLT"}</button>
    </div>
  </form>;
}

function CyclingFitImport({ draftId, imported, onImported }: { draftId: number; imported: boolean; onImported: () => Promise<void> }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(imported ? "Данные Garmin связаны с этой тренировкой." : "");

  const upload = async (file: File) => {
    setBusy(true);
    setStatus("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("expectedActivityType", "bike");
      form.append("draftId", String(draftId));
      form.append("expectedDraftStatus", "awaiting_confirmation");
      const response = await fetch("/api/workout-imports", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось импортировать FIT");
      if (result.workout?.activityType !== "bike" || Number(result.draftId) !== draftId) throw new Error("Сервер не подтвердил безопасную связь FIT с этим заездом");

      setStatus(result.duplicate ? "Этот FIT уже был импортирован и связан с заездом." : "FIT импортирован. Метрики Garmin применены к результату.");
      notify("FIT Garmin связан с Cycling-тренировкой");
      await onImported();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось импортировать FIT";
      setStatus(message);
      notify(message, "warn");
    } finally {
      setBusy(false);
    }
  };

  return <section className={`cycling-fit-import${imported ? " imported" : ""}`}>
    <div><CloudUpload size={21} /><span><b>{imported ? "Garmin FIT подключён" : "Добавить Garmin FIT"}</b><small>{imported ? "Объективные метрики загружены из файла" : "Загрузите велотренировку .fit до 10 МБ"}</small></span></div>
    {!imported && <label className="cycling-fit-button">{busy ? "Проверяем…" : "Выбрать FIT"}<input disabled={busy} type="file" accept=".fit,application/octet-stream" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void upload(file);
    }} /></label>}
    {status && <p role="status">{status}</p>}
  </section>;
}

function Metric({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return <article className={`cycling-metric cycling-glass${danger ? " danger" : ""}`}><span>{icon}</span><div><b>{value}</b><small>{label}</small></div></article>;
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><b>{value}</b></div>;
}

function useElapsedSeconds(start: string | null | undefined) {
  const [seconds, setSeconds] = useState(() => elapsedFrom(start));
  useEffect(() => {
    const id = window.setInterval(() => setSeconds(elapsedFrom(start)), 1000);
    return () => window.clearInterval(id);
  }, [start]);
  return seconds;
}

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

function CyclingLoading() { return <section className="cycling-state cycling-glass" aria-busy="true"><Bike size={34} /><h1>Загружаем Cycling cockpit…</h1></section>; }
function CyclingError({ message, onRetry }: { message: string; onRetry: () => void }) { return <section className="cycling-state cycling-glass"><h1>{message}</h1><button className="cycling-primary" onClick={onRetry}>Повторить</button></section>; }
function CyclingUnavailable() { return <section className="cycling-state cycling-glass"><Route size={34} /><h1>Cycling не назначен на текущую неделю</h1><p>Расписание остаётся в общем Plan VOLT. Когда там появится Bike-slot, он автоматически будет доступен здесь.</p><Link href="/?section=План">Открыть общий Plan <ChevronRight size={16} /></Link></section>; }
