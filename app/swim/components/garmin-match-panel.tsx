"use client";
import { useRef, useState } from "react";
import { GlassPanel } from "./glass-panel";
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
      <GlassPanel style={{ padding: "16px 20px", marginBottom: 16 }}>
        <p className="swim-eyebrow" style={{ marginBottom: 8 }}>ГАРМИН / FIT</p>
        <p style={{ margin: "0 0 12px", color: "var(--swim-text-muted)", fontSize: 14 }}>
          Загрузите файл заплыва из часов — фактические длины, темп и паузы возьмём оттуда, а не из ручных отметок во время тренировки.
        </p>
        {error && <p style={{ color: "#ff8a8a", fontSize: 14, marginBottom: 10 }}>{error}</p>}
        <button type="button" className="swim-btn secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          {busy ? "Загружаем…" : "Загрузить FIT из Garmin"}
        </button>
        <input ref={fileInput} type="file" accept=".fit" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
      </GlassPanel>
    );
  }

  const match = matchLapsToIntervals(workout, result.workout.metadata.laps);
  const actualMeters = result.workout.metadata.distanceMeters ?? match.totalActualMeters;
  const actualSeconds = result.workout.duration || match.totalActualSeconds;

  return (
    <GlassPanel style={{ padding: "16px 20px", marginBottom: 16 }}>
      <p className="swim-eyebrow" style={{ marginBottom: 8 }}>
        ГАРМИН / FIT {result.duplicate ? "· уже импортирован" : "· импортирован"}
      </p>
      {error && <p style={{ color: "#ff8a8a", fontSize: 14, marginBottom: 10 }}>{error}</p>}

      <div className="swim-grid" style={{ marginBottom: 14 }}>
        <div>
          <p className="swim-metric-label">Факт (Garmin)</p>
          <p className="swim-metric-value">{formatMeters(actualMeters) ?? "Нет данных"}</p>
        </div>
        <div>
          <p className="swim-metric-label">Время</p>
          <p className="swim-metric-value">{formatDuration(actualSeconds) ?? "Нет данных"}</p>
        </div>
      </div>

      {match.perInterval ? (
        <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--swim-text-muted)" }}>
              <th style={{ padding: "4px 8px 4px 0" }}>Интервал</th>
              <th style={{ padding: "4px 8px" }}>План</th>
              <th style={{ padding: "4px 0" }}>Факт</th>
            </tr>
          </thead>
          <tbody>
            {match.perInterval.map((row) => (
              <tr key={row.interval.id} style={{ borderTop: "1px solid var(--swim-border)" }}>
                <td style={{ padding: "6px 8px 6px 0" }}>{row.exerciseName}</td>
                <td style={{ padding: "6px 8px" }}>{row.plannedMeters.toLocaleString("ru-RU")} м</td>
                <td style={{ padding: "6px 0" }}>{row.actualMeters !== null ? `${row.actualMeters.toLocaleString("ru-RU")} м` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "var(--swim-text-muted)", fontSize: 13, marginBottom: 14 }}>
          Число отрезков в FIT не совпало с планом — показан только общий итог.
        </p>
      )}

      <button
        type="button"
        className="swim-btn primary"
        disabled={applied}
        onClick={() => { onApply(actualMeters, actualSeconds); setApplied(true); }}
      >
        {applied ? "Данные Garmin применены" : "Использовать данные Garmin"}
      </button>
    </GlassPanel>
  );
}
