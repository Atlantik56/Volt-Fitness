"use client";
import { useState } from "react";
import { GlassPanel } from "./glass-panel";
import { formatDuration, formatMeters } from "@/lib/swim-metrics";

const EFFORT_VALUES = ["Легко", "Нормально", "Тяжело", "Боль"] as const;

export function WorkoutSummaryForm({
  distanceMeters,
  durationSeconds,
  intervalCount,
  busy,
  onSubmit,
}: {
  distanceMeters: number;
  durationSeconds: number;
  intervalCount: number;
  busy: boolean;
  onSubmit: (effort: (typeof EFFORT_VALUES)[number], painAfter: number, notes: string) => void;
}) {
  const [effort, setEffort] = useState<(typeof EFFORT_VALUES)[number]>("Нормально");
  const [painAfter, setPainAfter] = useState("0");
  const [notes, setNotes] = useState("");

  return (
    <GlassPanel variant="raised" style={{ padding: "clamp(20px, 4vw, 32px)" }}>
      <p className="swim-eyebrow" style={{ marginBottom: 8 }}>
        ТРЕНИРОВКА ЗАВЕРШЕНА
      </p>
      <h2 style={{ margin: "0 0 20px" }}>Как прошёл заплыв?</h2>

      <div className="swim-grid" style={{ marginBottom: 24 }}>
        <div>
          <p className="swim-metric-label">Дистанция</p>
          <p className="swim-metric-value">{formatMeters(distanceMeters) ?? "Нет данных"}</p>
        </div>
        <div>
          <p className="swim-metric-label">Время</p>
          <p className="swim-metric-value">{formatDuration(durationSeconds) ?? "Нет данных"}</p>
        </div>
        <div>
          <p className="swim-metric-label">Интервалов</p>
          <p className="swim-metric-value">{intervalCount}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(effort, Math.max(0, Math.min(10, Number(painAfter) || 0)), notes);
        }}
      >
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 18px" }}>
          <legend className="swim-eyebrow" style={{ marginBottom: 10 }}>
            Нагрузка (RPE)
          </legend>
          <div className="swim-quick-actions">
            {EFFORT_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={`swim-btn ${effort === value ? "primary" : "secondary"}`}
                aria-pressed={effort === value}
                onClick={() => setEffort(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <label style={{ display: "block", marginBottom: 18 }}>
          <span className="swim-eyebrow" style={{ display: "block", marginBottom: 8 }}>
            Боль в суставах после, 0–10
          </span>
          <input
            type="number"
            min={0}
            max={10}
            inputMode="numeric"
            value={painAfter}
            onChange={(e) => setPainAfter(e.target.value)}
            style={{ width: 90, background: "var(--swim-surface-raised)", border: "1px solid var(--swim-border)", borderRadius: "var(--swim-radius-sm)", color: "var(--swim-text)", padding: "10px 12px" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 20 }}>
          <span className="swim-eyebrow" style={{ display: "block", marginBottom: 8 }}>
            Заметки
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 600))}
            rows={3}
            placeholder="Как себя чувствовал, что получилось, что стоит изменить в следующий раз"
            style={{ width: "100%", resize: "vertical", background: "var(--swim-surface-raised)", border: "1px solid var(--swim-border)", borderRadius: "var(--swim-radius-sm)", color: "var(--swim-text)", padding: "10px 12px", fontFamily: "inherit" }}
          />
        </label>

        <button type="submit" className="swim-btn primary" disabled={busy}>
          {busy ? "Сохраняем…" : "Подтвердить тренировку"}
        </button>
      </form>
    </GlassPanel>
  );
}
