"use client";
// Sprint AI-3 — адаптивный вечерний чек-ин. Презентационная обёртка вокруг
// чистой модели lib/evening-checkin.ts: сама не считает длительность сна, не
// нормализует воду/алкоголь и не решает, какие шаги показывать — только
// собирает пользовательский ввод и передаёт его в чистые функции.
import { useMemo, useState } from "react";
import { useToast } from "./toast";
import { MOOD_OPTIONS } from "../lib/mood";
import {
  buildCheckinSteps, deriveKnownState, buildInitialCheckinState, validateCheckinState, buildCheckinSummary,
  computeSleepWindow, formatSleepRange, WATER_QUICK_OPTIONS, ALCOHOL_TYPE_PRESETS, DAY_FACTOR_OPTIONS,
  type CheckinFormState, type CheckinStepId, type CheckinExistingData,
} from "../lib/evening-checkin";

const STEP_TITLES: Record<CheckinStepId, string> = {
  sleep: "Сон", water: "Вода", alcohol: "Алкоголь", mood: "Настроение",
  dinner: "Ужин", wellness: "Самочувствие", dayFactor: "Главный фактор дня",
};

function findExisting(data: any, date: string): CheckinExistingData {
  const activity = (data.activity || []).find((a: any) => a.date === date) || null;
  const moodLogs = (data.moodLogs || []).filter((m: any) => m.date === date);
  const latestMoodToday = moodLogs.length ? [...moodLogs].sort((a: any, b: any) => b.id - a.id)[0] : null;
  const wellnessToday = (data.wellnessLogs || []).find((w: any) => w.date === date) || null;
  return {
    date,
    activityRow: activity && {
      sleepStart: activity.sleepStart, sleepEnd: activity.sleepEnd, sleepQuality: activity.sleepQuality,
      waterLiters: activity.waterLiters, waterLogged: !!activity.waterLogged,
      alcoholLogged: !!activity.alcoholLogged, alcoholType: activity.alcoholType, alcoholServings: activity.alcoholServings,
      alcoholServingVolumeMl: activity.alcoholServingVolumeMl, firstDrinkTime: activity.firstDrinkTime,
      alcoholRelativeAmount: activity.alcoholRelativeAmount, dinner: !!activity.dinner,
      dayFactor: activity.dayFactor, dayFactorNote: activity.dayFactorNote,
    },
    latestMoodToday: latestMoodToday && { mood: latestMoodToday.mood, note: latestMoodToday.note },
    wellnessToday: wellnessToday && { energy: wellnessToday.energy, pain: wellnessToday.pain, painArea: wellnessToday.painArea, note: wellnessToday.note },
  };
}

export function EveningCheckinWizard({ data, date, onClose, onSaved }: { data: any; date: string; onClose: () => void; onSaved: () => void }) {
  const notify = useToast();
  const existing = useMemo(() => findExisting(data, date), [data, date]);
  const workoutDone = (data.workouts || []).some((w: any) => w.date === date);
  const dinnerLoggedInFoodLogs = (data.foodLogs || []).some((f: any) => f.date === date && f.mealType === "Ужин");

  const known = useMemo(() => deriveKnownState({
    activityRow: existing.activityRow && { sleepStart: existing.activityRow.sleepStart, sleepEnd: existing.activityRow.sleepEnd, waterLogged: existing.activityRow.waterLogged, alcoholLogged: existing.activityRow.alcoholLogged, dinner: existing.activityRow.dinner, dayFactor: existing.activityRow.dayFactor },
    latestMoodToday: existing.latestMoodToday,
    dinnerLoggedInFoodLogs,
    wellnessToday: existing.wellnessToday,
  }), [existing, dinnerLoggedInFoodLogs]);
  const steps = useMemo(() => buildCheckinSteps(known), [known]);

  const [state, setState] = useState<CheckinFormState>(() => buildInitialCheckinState(existing));
  const [stepIndex, setStepIndex] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const patch = <K extends keyof CheckinFormState>(key: K, value: CheckinFormState[K]) => {
    setDirty(true);
    setState(s => ({ ...s, [key]: value }));
  };

  const validated = useMemo(() => validateCheckinState(state), [state]);
  const summaryLines = validated.ok ? buildCheckinSummary(validated.payload, workoutDone) : [];

  const currentStep = steps[stepIndex];

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
    else setSummaryOpen(true);
  };
  const goBack = () => {
    if (summaryOpen) setSummaryOpen(false);
    else if (stepIndex > 0) setStepIndex(i => i - 1);
  };
  const jumpTo = (id: CheckinStepId) => {
    const idx = steps.findIndex(s => s.id === id);
    setSummaryOpen(false);
    if (idx >= 0) setStepIndex(idx);
  };

  const requestClose = () => {
    if (dirty && !window.confirm("Закрыть без сохранения? Введённые данные будут потеряны.")) return;
    onClose();
  };

  const save = async () => {
    if (saving) return;
    if (!validated.ok) { setError(validated.errors[0]?.message || "Проверьте введённые данные"); return; }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/fitness", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "eveningCheckin", ...state }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "Не удалось сохранить"); setSaving(false); return; }
      notify("Спасибо за честную запись");
      onSaved();
    } catch {
      setError("Сетевая ошибка — данные остались в форме, попробуйте сохранить ещё раз");
      setSaving(false);
    }
  };

  const total = steps.length;
  const progressLabel = summaryOpen ? "Сводка" : `Шаг ${stepIndex + 1} из ${total}`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Вечерний чек-ин">
      <section className="workout-modal checkin-modal">
        <header>
          <div><p className="eyebrow">ЗАВЕРШИТЬ ДЕНЬ</p><h2>{summaryOpen ? "Проверь и сохрани" : STEP_TITLES[currentStep?.id]}</h2></div>
          <button type="button" aria-label="Закрыть" onClick={requestClose}>×</button>
        </header>

        <div className="checkin-progress" aria-live="polite">{progressLabel}</div>

        {!summaryOpen && currentStep && (
          <div className="checkin-step">
            {currentStep.id === "sleep" && <SleepStep date={date} value={state.sleep} onChange={v => patch("sleep", v)} />}
            {currentStep.id === "water" && <WaterStep value={state.water} onChange={v => patch("water", v)} />}
            {currentStep.id === "alcohol" && <AlcoholStep value={state.alcohol} onChange={v => patch("alcohol", v)} />}
            {currentStep.id === "mood" && <MoodStep value={state.mood} onChange={v => patch("mood", v)} />}
            {currentStep.id === "dinner" && <DinnerStep value={state.dinner} onChange={v => patch("dinner", v)} />}
            {currentStep.id === "wellness" && <WellnessStep value={state.wellness} onChange={v => patch("wellness", v)} />}
            {currentStep.id === "dayFactor" && <DayFactorStep value={state.dayFactor} onChange={v => patch("dayFactor", v)} />}
          </div>
        )}

        {summaryOpen && (
          <div className="checkin-summary">
            <p className="detail-lead">Только подтверждаемые факты — без общей оценки дня.</p>
            <div className="checkin-summary-list">
              {summaryLines.map(line => (
                <div key={line.step} className="checkin-summary-row">
                  <div><b>{line.label}</b><span>{line.value}</span></div>
                  {line.editable && <button type="button" className="ghost-btn" onClick={() => jumpTo(line.step as CheckinStepId)}>Изменить</button>}
                </div>
              ))}
              {!validated.ok && <p className="checkin-error" role="alert">{validated.errors[0]?.message}</p>}
            </div>
          </div>
        )}

        {error && <p className="checkin-error" role="alert">{error}</p>}

        <footer>
          <button type="button" className="ghost-btn" onClick={goBack} disabled={stepIndex === 0 && !summaryOpen}>Назад</button>
          {summaryOpen
            ? <button type="button" onClick={save} disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
            : <button type="button" onClick={goNext}>{stepIndex === total - 1 ? "К сводке" : "Далее"}</button>}
        </footer>
      </section>
    </div>
  );
}

// --- Шаги ------------------------------------------------------------------

function SleepStep({ date, value, onChange }: { date: string; value: CheckinFormState["sleep"]; onChange: (v: CheckinFormState["sleep"]) => void }) {
  const preview = value.startTime && value.endTime ? computeSleepWindow(date, value.startTime, value.endTime) : null;
  return (
    <div className="checkin-fields">
      <label>Отход ко сну<input type="time" aria-label="Время отхода ко сну" value={value.startTime} onChange={e => onChange({ ...value, startTime: e.target.value })} /></label>
      <label>Подъём<input type="time" aria-label="Время подъёма" value={value.endTime} onChange={e => onChange({ ...value, endTime: e.target.value })} /></label>
      {preview && (
        "error" in preview
          ? <p className="checkin-error" role="alert">{preview.error}</p>
          : <p className="checkin-preview">{formatSleepRange(preview.startIso, preview.endIso, preview.minutes)}</p>
      )}
      <label>Качество сна (необязательно)
        <select aria-label="Качество сна" value={value.quality ?? ""} onChange={e => onChange({ ...value, quality: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Не оценивать</option>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} из 5</option>)}
        </select>
      </label>
    </div>
  );
}

function WaterStep({ value, onChange }: { value: CheckinFormState["water"]; onChange: (v: CheckinFormState["water"]) => void }) {
  return (
    <div className="checkin-fields">
      <div className="checkin-quick-options" role="group" aria-label="Быстрый выбор воды">
        {WATER_QUICK_OPTIONS.map(q => (
          <button key={q} type="button" className={value.liters === q ? "active" : ""} onClick={() => onChange({ liters: q })}>{String(q).replace(".", ",")}</button>
        ))}
        <button type="button" className={value.liters != null && value.liters > 3 ? "active" : ""} onClick={() => onChange({ liters: 3 })}>3+</button>
      </div>
      <label>Точное значение, л<input type="number" step="0.25" min="0" max="10" aria-label="Вода в литрах" value={value.liters ?? ""} onChange={e => onChange({ liters: e.target.value === "" ? null : Number(e.target.value) })} /></label>
    </div>
  );
}

function AlcoholStep({ value, onChange }: { value: CheckinFormState["alcohol"]; onChange: (v: CheckinFormState["alcohol"]) => void }) {
  return (
    <div className="checkin-fields">
      <div className="checkin-quick-options" role="group" aria-label="Был ли алкоголь">
        <button type="button" className={value.drank === false ? "active" : ""} onClick={() => onChange({ ...value, drank: false })}>Не пил(а)</button>
        <button type="button" className={value.drank === true ? "active" : ""} onClick={() => onChange({ ...value, drank: true, type: value.type || "Пиво", servingVolumeMl: value.servingVolumeMl || 450 })}>Пил(а)</button>
      </div>
      {value.drank === true && (
        <>
          <div className="checkin-quick-options" role="group" aria-label="Тип напитка">
            {ALCOHOL_TYPE_PRESETS.map(p => (
              <button key={p.type} type="button" className={value.type === p.type ? "active" : ""} onClick={() => onChange({ ...value, type: p.type, servingVolumeMl: value.servingVolumeMl || p.defaultVolumeMl || null })}>{p.type}</button>
            ))}
          </div>
          <label>Количество порций<input type="number" min="1" max="60" aria-label="Количество порций" value={value.servings ?? ""} onChange={e => onChange({ ...value, servings: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label>Объём одной порции, мл<input type="number" min="1" max="5000" aria-label="Объём порции в мл" value={value.servingVolumeMl ?? ""} onChange={e => onChange({ ...value, servingVolumeMl: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label>Время первого напитка<input type="time" aria-label="Время первого напитка" disabled={value.firstDrinkUnknown} value={value.firstDrinkTime} onChange={e => onChange({ ...value, firstDrinkTime: e.target.value })} /></label>
          <label className="evening-checkbox"><input type="checkbox" checked={value.firstDrinkUnknown} onChange={e => onChange({ ...value, firstDrinkUnknown: e.target.checked, firstDrinkTime: e.target.checked ? "" : value.firstDrinkTime })} /> Не помню время</label>
          <div className="checkin-quick-options" role="group" aria-label="Относительно обычного">
            {([["less", "Меньше обычного"], ["usual", "Как обычно"], ["more", "Больше обычного"]] as const).map(([v, l]) => (
              <button key={v} type="button" className={value.relativeAmount === v ? "active" : ""} onClick={() => onChange({ ...value, relativeAmount: value.relativeAmount === v ? "" : v })}>{l}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MoodStep({ value, onChange }: { value: CheckinFormState["mood"]; onChange: (v: CheckinFormState["mood"]) => void }) {
  return (
    <div className="checkin-fields">
      <div className="mood-picker" role="group" aria-label="Настроение">
        {MOOD_OPTIONS.map(m => <button key={m} type="button" className={value.mood === m ? "active" : ""} onClick={() => onChange({ ...value, mood: m })}>{m}</button>)}
      </div>
      <label>Заметка (необязательно)<input className="mood-note" maxLength={300} value={value.note} onChange={e => onChange({ ...value, note: e.target.value })} /></label>
    </div>
  );
}

function DinnerStep({ value, onChange }: { value: CheckinFormState["dinner"]; onChange: (v: CheckinFormState["dinner"]) => void }) {
  return (
    <div className="checkin-fields">
      <div className="checkin-quick-options" role="group" aria-label="Был ли ужин">
        <button type="button" className={value.dinner === true ? "active" : ""} onClick={() => onChange({ dinner: true })}>Ужин был</button>
        <button type="button" className={value.dinner === false ? "active" : ""} onClick={() => onChange({ dinner: false })}>Не было</button>
      </div>
    </div>
  );
}

function WellnessStep({ value, onChange }: { value: CheckinFormState["wellness"]; onChange: (v: CheckinFormState["wellness"]) => void }) {
  return (
    <div className="checkin-fields">
      <label>Энергия
        <select aria-label="Энергия" value={value.energy ?? ""} onChange={e => onChange({ ...value, energy: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Пропустить</option>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} из 5</option>)}
        </select>
      </label>
      <label>Боль
        <select aria-label="Боль" value={value.pain ?? ""} onChange={e => onChange({ ...value, pain: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Пропустить</option>
          {Array.from({ length: 11 }, (_, n) => n).map(n => <option key={n} value={n}>{n} из 10</option>)}
        </select>
      </label>
      {value.pain != null && value.pain > 0 && (
        <label>Область боли (необязательно)<input maxLength={80} value={value.painArea} onChange={e => onChange({ ...value, painArea: e.target.value })} /></label>
      )}
      <label>Заметка о самочувствии (необязательно)<input maxLength={300} value={value.note} onChange={e => onChange({ ...value, note: e.target.value })} /></label>
    </div>
  );
}

function DayFactorStep({ value, onChange }: { value: CheckinFormState["dayFactor"]; onChange: (v: CheckinFormState["dayFactor"]) => void }) {
  return (
    <div className="checkin-fields">
      <div className="checkin-quick-options" role="group" aria-label="Главный фактор дня">
        {DAY_FACTOR_OPTIONS.map(f => (
          <button key={f} type="button" className={value.factor === f ? "active" : ""} onClick={() => onChange({ ...value, factor: value.factor === f ? "" : f })}>{f}</button>
        ))}
      </div>
      <label>Короткая заметка (необязательно)<input maxLength={200} value={value.note} onChange={e => onChange({ ...value, note: e.target.value })} /></label>
    </div>
  );
}
