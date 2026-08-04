"use client";
import { useEffect, useState } from "react";
import { SwimNavigation } from "../swim-navigation";
import { ProgramCard, type ProgramSummary } from "../components/program-card";
import { GlassPanel } from "../components/glass-panel";

export default function SwimWorkoutsPage() {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/swim/programs", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("request failed");
        return r.json();
      })
      .then((json: { programs: ProgramSummary[] }) => setPrograms(json.programs))
      .catch(() => setError(true));
  }, []);

  return (
    <>
      <header className="swim-page-header">
        <div>
          <p className="swim-eyebrow">VOLT SWIM</p>
          <h1>Тренировки</h1>
          <p>Программы плавания VOLT Swim: выберите доступную программу и пройдите тренировку по интервалам.</p>
        </div>
      </header>

      <SwimNavigation />

      {error ? (
        <GlassPanel className="swim-empty" role="alert">
          <h4>Не удалось загрузить программы</h4>
          <p>Проверьте соединение и обновите страницу.</p>
        </GlassPanel>
      ) : !programs ? (
        <div className="swim-grid">
          {[0, 1, 2, 3].map((i) => (
            <GlassPanel key={i} style={{ padding: 20, height: 140 }}>
              <div className="swim-loading-line" style={{ width: "60%", marginBottom: 10 }} />
              <div className="swim-loading-line" style={{ width: "90%" }} />
            </GlassPanel>
          ))}
        </div>
      ) : (
        <div className="swim-grid">
          {programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
    </>
  );
}
