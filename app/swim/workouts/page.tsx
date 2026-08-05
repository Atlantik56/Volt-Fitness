"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SwimNavigation } from "../swim-navigation";
import { SwimPlanScreen } from "../components/swim-plan-screen";

type ProgramSummary = { id: string; status: "available" | "coming_soon" };

// Канонический маршрут «План тренировок» (docs/volt-swim/SCREEN_ARCHITECTURE.md
// §2). Сам экран не завязан на конкретную программу — здесь только
// разрешение id единственной доступной программы, чтобы не плодить отдельный
// экран-список программ, которого нет в утверждённой архитектуре.
export default function SwimWorkoutsPage() {
  const [programId, setProgramId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/swim/programs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: { programs: ProgramSummary[] }) => {
        const available = json.programs.find((p) => p.status === "available");
        if (!available) {
          setNotFound(true);
          return;
        }
        setProgramId(available.id);
      })
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="swim-plan">
        <header className="swim-plan-header">
          <div>
            <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>План тренировок</b></p>
            <h1>План тренировок</h1>
          </div>
        </header>
        <SwimNavigation />
        <div className="swim-plan-empty" role="alert">
          <h4>Не удалось загрузить план тренировок</h4>
          <p>Проверьте соединение и обновите страницу.</p>
        </div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="swim-plan">
        <header className="swim-plan-header">
          <div>
            <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>План тренировок</b></p>
            <h1>План тренировок</h1>
          </div>
        </header>
        <SwimNavigation />
        <div className="swim-plan-empty">
          <h4>Программа пока недоступна</h4>
          <p>Активная программа тренировок появится здесь, как только будет открыта.</p>
        </div>
      </div>
    );
  }
  if (!programId) {
    return (
      <div className="swim-plan">
        <header className="swim-plan-header">
          <div>
            <p className="swim-breadcrumb">VOLT / Тренировки / Swim / <b>План тренировок</b></p>
            <h1>План тренировок</h1>
          </div>
        </header>
        <SwimNavigation />
        <div className="swim-plan-loading" aria-busy="true">
          <Loader2 className="swim-spin" size={22} />
        </div>
      </div>
    );
  }

  return <SwimPlanScreen programId={programId} />;
}
