// Хэш плана тренировки. Отдельный файл (не lib/active-workout-service.ts,
// который тянет за собой lib/db.ts/better-sqlite3) исключительно потому, что
// node:crypto нельзя бандлить в клиентские компоненты — lib/swim/workout-engine.ts
// импортирует normalizeSnapshot из соседнего lib/workout-snapshot.ts (без
// node-built-ins) для клиента, а planKey остаётся server-only (используется
// только из lib/swim/workout-plan-key.ts и lib/active-workout-service.ts).
import { createHash } from "node:crypto";
import type { WorkoutSnapshot } from "@/lib/workout-snapshot";

export function planKey(snapshot: WorkoutSnapshot) {
  return createHash("sha256").update(JSON.stringify({ title: snapshot.title, type: snapshot.type, exercises: snapshot.exercises.map((x) => x.name) })).digest("hex").slice(0, 32);
}
