"use client";
import { useRef, useState } from "react";
import { CloudUpload } from "lucide-react";
import { matchLapsToIntervals } from "@/lib/swim/fit-match";
import { formatDuration, formatMeters } from "@/lib/swim-metrics";
import type { SwimWorkoutDef } from "@/lib/swim/types";

type ImportedWorkout = {
  duration: number;
  metadata: { distanceMeters: number | null; laps: { distanceMeters: number; durationSeconds: number; numLengths: number | null }[] };
};
type ImportResult = { ok: true; id: number; workout: ImportedWorkout; draftId: number | null; duplicate: boolean; autoLinked: boolean };

// Экран подтверждения после активной тренировки: фактические длины, темп и
// паузы подтверждаются постфактум из Garmin/FIT, а не ручным чек-ином во время
// заплыва (см. lib/swim/fit-match.ts). Ручной ввод (WorkoutSummaryForm) при
// этом никуда не девается — импорт лишь предзаполняет его данными Гармина.
// Визуально — вспомогательная карточка (тот же дизайн-контракт, что и на
// Главной/Плане, .swim-home-card), а не отдельная финальная — ей остаётся
// WorkoutSummaryForm ниже.
export function GarminMatchPanel({ draftId, workout, onApply }: { draftId: number; workout: SwimWorkoutDef; onApply: (meters: number, seconds: number) => void }) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [applied, setApplied] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/workout-imports", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error || "Не удалось разобрать FIT-файл");
      const imported: ImportResult = json;
      setResult(imported);
      if (imported.draftId !== draftId) {
        const linkRes = await fetch("/api/workout-imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "link", importId: imported.id, draftId }) });
        if (!linkRes.ok) {
          const linkJson = await linkRes.json().catch(() => ({}));
          setError(linkJson.error || "Импорт разобран, но не удалось связать его с этой тренировкой");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  if (!result) {
    return (
      <section className="swim-home-card swim-garmin-panel">
        <p className="swim-eyebrow">Гармин / FIT</p>
        <p className="swim-garmin-hint">
          Загрузите файл заплыва из часов — фактические длины, темп и паузы возьмём оттуда, а не из ручных отметок во время тренировки.
        </p>
        {error && <p className="swim-garmin-error">{error}</p>}
        <button type="button" className="swim-btn secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          <CloudUpload size={15} /> {busy ? "Загружаем…" : "Загрузить FIT из Garmin"}
        </button>
        <input ref={fileInput} type="file" accept=".fit" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
      </section>
    );
  }

  const match = matchLapsToIntervals(workout, result.workout.metadata.laps);
  const actualMeters = result.workout.metadata.distanceMeters ?? match.totalActualMeters;
  const actualSeconds = result.workout.duration || match.totalActualSeconds;

  return (
    <section className="swim-home-card swim-garmin-panel">
      <p className="swim-eyebrow">Гармин / FIT {result.duplicate ? "· уже импортирован" : "· импортирован"}</p>
      {error && <p className="swim-garmin-error">{error}</p>}

      <div className="swim-garmin-totals">
        <div><small>Факт (Garmin)</small><strong>{formatMeters(actualMeters) ?? "Нет данных"}</strong></div>
        <div><small>Время</small><strong>{formatDuration(actualSeconds) ?? "Нет данных"}</strong></div>
      </div>

      {match.perInterval ? (
        <div className="swim-garmin-rows">
          <div className="swim-garmin-row head"><span>Интервал</span><span>План</span><span>Факт</span></div>
          {match.perInterval.map((row) => (
            <div className="swim-garmin-row" key={row.interval.id}>
              <span>{row.exerciseName}</span>
              <span>{row.plannedMeters.toLocaleString("ru-RU")} м</span>
              <span>{row.actualMeters !== null ? `${row.actualMeters.toLocaleString("ru-RU")} м` : "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="swim-garmin-hint">Число отрезков в FIT не совпало с планом — показан только общий итог.</p>
      )}

      <button
        type="button"
        className="swim-btn secondary"
        disabled={applied}
        onClick={() => { onApply(actualMeters, actualSeconds); setApplied(true); }}
      >
        {applied ? "Данные Garmin применены" : "Использовать данные Garmin"}
      </button>
    </section>
  );
}
