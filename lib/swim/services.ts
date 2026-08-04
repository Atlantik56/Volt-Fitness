// Единственное место в lib/swim/, которое обращается к БД. program-engine.ts и
// workout-engine.ts остаются чистыми функциями — здесь они соединяются с
// реальными workout_drafts.
import { db } from "@/lib/db";
import { computeProgramProgress, getProgram, listPrograms } from "@/lib/swim/program-engine";
import type { SwimProgramProgress, SwimWorkoutProgress } from "@/lib/swim/types";

type OpenDraftStatus = "active" | "awaiting_confirmation";

function completedPlanKeys(): Set<string> {
  const rows = db.prepare("SELECT DISTINCT plan_key planKey FROM workout_drafts WHERE status='completed'").all() as { planKey: string }[];
  return new Set(rows.map((row) => row.planKey));
}

function openDraftsByPlanKey(): Map<string, { id: number; status: OpenDraftStatus }> {
  const rows = db.prepare("SELECT id,plan_key planKey,status FROM workout_drafts WHERE status IN ('active','awaiting_confirmation')").all() as { id: number; planKey: string; status: OpenDraftStatus }[];
  return new Map(rows.map((row) => [row.planKey, { id: row.id, status: row.status }]));
}

export function getProgramProgress(programId: string): SwimProgramProgress | null {
  const program = getProgram(programId);
  if (!program || program.status !== "available") return null;
  return computeProgramProgress(program, completedPlanKeys(), openDraftsByPlanKey());
}

export function listProgramsWithProgress(): SwimProgramProgress[] {
  const completed = completedPlanKeys();
  const open = openDraftsByPlanKey();
  return listPrograms().map((program) =>
    program.status === "available"
      ? computeProgramProgress(program, completed, open)
      : { program, completedCount: 0, totalCount: 0, currentWeekIndex: null, nextWorkout: null, workouts: [] },
  );
}

// Источник для SwimHero (главная страница /swim) — ближайшая незавершённая
// тренировка единственной доступной программы, либо null для честного empty
// state. Программ несколько станет в Sprint 3+ — тогда здесь появится выбор
// "активной" программы пользователя, а не первой доступной.
export function getNextSwimWorkout(): SwimWorkoutProgress | null {
  const program = listPrograms().find((p) => p.status === "available");
  if (!program) return null;
  return getProgramProgress(program.id)?.nextWorkout ?? null;
}
