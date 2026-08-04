// Server-only: считает planKey тренировки программы. Отделён от
// lib/swim/workout-engine.ts (который импортируется и клиентом), потому что
// planKey использует node:crypto (lib/plan-key.ts) — этот файл не должен
// импортироваться ни одной клиентской страницей.
import { planKey } from "@/lib/plan-key";
import { buildSwimSnapshot } from "@/lib/swim/workout-engine";
import type { SwimProgramDef, SwimWorkoutDef } from "@/lib/swim/types";

export function swimWorkoutPlanKey(program: SwimProgramDef, workout: SwimWorkoutDef): string | null {
  const snapshot = buildSwimSnapshot(program, workout);
  return snapshot ? planKey(snapshot) : null;
}
