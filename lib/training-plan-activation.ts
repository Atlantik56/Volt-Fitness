import { db } from "@/lib/db";

export type TrainingPlanActivation = {
  startedAt: string;
  alreadyStarted: boolean;
};

export function moscowIsoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getTrainingPlanV3StartedAt(): string | null {
  const row = db.prepare("SELECT training_plan_v3_started_at startedAt FROM profile WHERE id=1").get() as { startedAt?: string | null } | undefined;
  return row?.startedAt ?? null;
}

export function startTrainingPlanV3(now = new Date()): TrainingPlanActivation | null {
  const startedAt = moscowIsoDate(now);
  const changed = db.prepare(
    "UPDATE profile SET training_plan_v3_started_at=? WHERE id=1 AND training_plan_v3_started_at IS NULL",
  ).run(startedAt).changes;
  if (changed === 1) return { startedAt, alreadyStarted: false };
  const existing = getTrainingPlanV3StartedAt();
  return existing ? { startedAt: existing, alreadyStarted: true } : null;
}
