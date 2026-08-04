"use client";
import Link from "next/link";
import { useRef } from "react";

// Импорт Garmin/FIT переиспользует существующий endpoint app/api/workout-imports
// (тот же, что и в силовых тренировках) — отдельная swim-специфичная интеграция
// не создаётся.
export function QuickActions({ onImported }: { onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement | null>(null);

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/workout-imports", { method: "POST", body: form });
    if (res.ok) onImported();
  };

  return (
    <section className="swim-section">
      <p className="swim-eyebrow" style={{ marginBottom: 10 }}>
        БЫСТРЫЕ ДЕЙСТВИЯ
      </p>
      <div className="swim-quick-actions">
        <Link href="/swim/workouts" className="swim-btn secondary">
          Открыть тренировки
        </Link>
        <button type="button" className="swim-btn secondary" disabled title="Добавление заплыва вручную появится в следующем спринте">
          Добавить заплыв вручную
        </button>
        <button type="button" className="swim-btn secondary" onClick={() => fileInput.current?.click()}>
          Импортировать из Garmin/FIT
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".fit"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
    </section>
  );
}
