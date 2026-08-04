"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { SwimNavigation } from "../../swim-navigation";
import { GlassPanel } from "../../components/glass-panel";
import { WorkoutCard } from "../../components/workout-card";
import { totalDistanceMeters } from "@/lib/swim/workout-engine";
import type { SwimProgramProgress } from "@/lib/swim/types";

export default function SwimProgramPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = use(params);
  const [progress, setProgress] = useState<SwimProgramProgress | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/swim/programs/${programId}`, { cache: "no-store" })
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error("request failed");
        return r.json();
      })
      .then((json: { progress: SwimProgramProgress } | null) => {
        if (json) setProgress(json.progress);
      })
      .catch(() => setNotFound(true));
  }, [programId]);

  return (
    <>
      <header className="swim-page-header">
        <div>
          <p className="swim-eyebrow">VOLT SWIM</p>
          <h1>{progress ? progress.program.name : "Программа"}</h1>
          {progress && <p>{progress.program.description}</p>}
        </div>
      </header>

      <SwimNavigation />

      {notFound ? (
        <GlassPanel className="swim-empty">
          <h4>Программа недоступна</h4>
          <p>
            Эта программа ещё не открыта. Вернитесь к{" "}
            <Link href="/swim/workouts" style={{ color: "var(--swim-aqua)" }}>
              списку тренировок
            </Link>
            .
          </p>
        </GlassPanel>
      ) : !progress ? (
        <div className="swim-grid">
          {[0, 1].map((i) => (
            <GlassPanel key={i} style={{ padding: 18, height: 120 }}>
              <div className="swim-loading-line" style={{ width: "50%" }} />
            </GlassPanel>
          ))}
        </div>
      ) : (
        progress.program.weeks.map((week) => {
          const workoutsThisWeek = week.days.filter((day) => day.workout);
          if (workoutsThisWeek.length === 0) return null;
          return (
            <section className="swim-section" key={week.weekIndex}>
              <p className="swim-eyebrow" style={{ marginBottom: 10 }}>
                НЕДЕЛЯ {week.weekIndex}
              </p>
              <div className="swim-grid">
                {workoutsThisWeek.map((day) => {
                  const workout = day.workout!;
                  const workoutProgress = progress.workouts.find((w) => w.workout.id === workout.id);
                  return (
                    <WorkoutCard
                      key={workout.id}
                      programId={progress.program.id}
                      workoutId={workout.id}
                      title={workout.title}
                      goal={workout.goal}
                      distanceMeters={totalDistanceMeters(workout)}
                      estimatedMinutes={workout.estimatedMinutes}
                      intervalCount={workout.intervals.length}
                      level={workout.level}
                      status={workoutProgress?.status ?? "not_started"}
                    />
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
