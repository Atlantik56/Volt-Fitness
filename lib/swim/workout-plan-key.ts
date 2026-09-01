// Server-only: считает planKey тренировки программы. Отделён от
// lib/swim/workout-engine.ts (который импортируется и клиентом), потому что
// planKey использует node:crypto (lib/plan-key.ts) — этот файл не должен
// импортироваться ни одной клиентской страницей.
import { planKey } from "@/lib/plan-key";
import { buildSwimSnapshot } from "@/lib/swim/workout-engine";
import type { SwimProgramDef, SwimWorkoutDef } from "@/lib/swim/types";

export function swimWorkoutPlanKey(program: SwimProgramDef, workout: SwimWorkoutDef, cycleId?:number|null): string | null {
  const snapshot = buildSwimSnapshot(program, workout,cycleId);
  return snapshot ? planKey(snapshot) : null;
}

export function swimWorkoutPlanKeyCandidates(program: SwimProgramDef, workout: SwimWorkoutDef, cycleId?:number|null,includeUnscoped=true): string[] {
  const snapshot = buildSwimSnapshot(program, workout,cycleId);
  if (!snapshot) return [];
  const current = planKey(snapshot);
  if (!snapshot.programIdentity) return [current];
  if(!includeUnscoped)return [current];
  const unscoped=cycleId?buildSwimSnapshot(program,workout):snapshot;
  if(!unscoped)return [current];
  const unscopedKey=planKey(unscoped);
  const legacySnapshot = { ...unscoped };
  delete legacySnapshot.programIdentity;
  const legacy = planKey(legacySnapshot);
  return Array.from(new Set([current,unscopedKey,legacy]));
}
