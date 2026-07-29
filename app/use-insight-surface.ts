"use client";
// AI-5 — общий клиентский хук для трёх поверхностей показа инсайтов
// (card/evening/mood). Каждый компонент, использующий его, монтируется только
// при реальном открытии соответствующего экрана (app/page.tsx: CoachCard —
// только на вкладке "Сегодня", EveningProgressPage/MoodSection — только на
// своих вкладках) — поэтому один fetch на mount и есть тот самый "фактический
// показ", который отмечает /api/insights на сервере. Пересчёт/ре-рендер уже
// смонтированного компонента не должен повторно дёргать fetch — это не новый
// показ, а тот же самый.
import { useEffect, useRef, useState } from "react";
import type { Insight } from "../lib/insights/types";

export type InsightSurface = "card" | "evening" | "mood";

export function useInsightSurface(surface: InsightSurface, date: string) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${surface}:${date}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;
    fetch(`/api/insights?surface=${surface}&date=${date}`)
      .then(r => (r.ok ? r.json() : { insights: [] }))
      .then(d => setInsights(d.insights || []))
      .catch(() => {});
  }, [surface, date]);

  const dismiss = (insight: Insight) => {
    setInsights(prev => prev.filter(i => i.id !== insight.id));
    fetch("/api/insights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "dismiss", insightId: insight.id, evidenceHash: insight.evidenceHash, sourceRevision: insight.sourceRevision }),
    }).catch(() => {});
  };

  return { insights, dismiss };
}
