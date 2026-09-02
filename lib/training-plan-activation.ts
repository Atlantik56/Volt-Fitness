import { db } from "@/lib/db";
import {
  ACTIVE_PROGRAM_VERSION,
  PLAN_V3_PROGRAM_VERSION,
  VOLT_PROGRAM_ID,
} from "@/lib/training-program/definitions";
import { trainingProgramRegistry } from "@/lib/training-program/registry";
import type { TrainingPlanCycle } from "@/lib/training-program/types";

export type TrainingPlanActivation = {
  startedAt: string;
  alreadyStarted: boolean;
  cycleId: number;
  programId: string;
  programVersion: number;
  archivedCycleId: number | null;
  archivedCycleEndedAt: string | null;
};

export type TrainingPlanRestart = {
  ok: true;
  startedAt: string;
  cycleId: number;
  programId: string;
  programVersion: number;
  archivedCycleId: number;
  archivedCycleEndedAt: string;
  clearedWeekChanges: number;
  clearedScheduleOverrides: number;
  cancelledPlannedDrafts: number;
} | {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
};

type CycleRow = {
  id: number;
  programId: string;
  programVersion: number;
  startedAt: string;
  endedAt: string | null;
  restartedFromCycleId: number | null;
};

const selectCycles = `SELECT id,program_id programId,program_version programVersion,
  started_at startedAt,ended_at endedAt,restarted_from_cycle_id restartedFromCycleId
  FROM training_plan_cycles`;

const asCycle = (row: CycleRow): TrainingPlanCycle => ({ ...row });

export function moscowIsoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getTrainingPlanCycles(programId = VOLT_PROGRAM_ID): TrainingPlanCycle[] {
  return (db.prepare(`${selectCycles} WHERE program_id=? ORDER BY started_at ASC,id ASC`).all(programId) as CycleRow[]).map(asCycle);
}

export function getActiveTrainingPlanCycle(programId = VOLT_PROGRAM_ID): TrainingPlanCycle | null {
  const row = db.prepare(`${selectCycles} WHERE program_id=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1`).get(programId) as CycleRow | undefined;
  return row ? asCycle(row) : null;
}

export function getTrainingPlanCycleForDate(dateIso: string, programId = VOLT_PROGRAM_ID): TrainingPlanCycle | null {
  const row = db.prepare(`${selectCycles} WHERE program_id=? AND started_at<=? AND (ended_at IS NULL OR ended_at>=?)
    ORDER BY started_at DESC,id DESC LIMIT 1`).get(programId, dateIso, dateIso) as CycleRow | undefined;
  return row ? asCycle(row) : null;
}

/** Backwards-compatible historical field. It is not the active-plan source. */
export function getTrainingPlanV3StartedAt(): string | null {
  const row = db.prepare("SELECT training_plan_v3_started_at startedAt FROM profile WHERE id=1").get() as { startedAt?: string | null } | undefined;
  return row?.startedAt ?? null;
}

/** Backwards-compatible accessor for archived callers/tests. */
export function getActiveTrainingPlanV3Cycle(): TrainingPlanCycle | null {
  const row = db.prepare(`${selectCycles} WHERE program_id=? AND program_version=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1`)
    .get(VOLT_PROGRAM_ID, PLAN_V3_PROGRAM_VERSION) as CycleRow | undefined;
  return row ? asCycle(row) : null;
}

function activeDraftError(): string | null {
  const open = db.prepare("SELECT status FROM workout_drafts WHERE status IN ('active','awaiting_confirmation') ORDER BY id DESC LIMIT 1")
    .get() as { status: string } | undefined;
  if (!open) return null;
  return open.status === "awaiting_confirmation"
    ? "Сначала подтвердите или отмените завершённую тренировку"
    : "Сначала завершите или отмените активную тренировку";
}

function latestCompletedUsageDate(cycle: TrainingPlanCycle): string | null {
  const row = db.prepare(`SELECT MAX(date) usedAt FROM workout_drafts
    WHERE status='completed'
      AND json_extract(snapshot,'$.programIdentity.programId')=?
      AND CAST(json_extract(snapshot,'$.programIdentity.programVersion') AS INTEGER)=?
      AND CAST(json_extract(snapshot,'$.programIdentity.cycleId') AS INTEGER)=?`)
    .get(cycle.programId, cycle.programVersion, cycle.id) as { usedAt: string | null };
  return row.usedAt ?? null;
}

function transitionStartDate(active: TrainingPlanCycle, requestedAt: string): string {
  const usedAt = latestCompletedUsageDate(active);
  // Closing a cycle on the day before a new one starts must satisfy the CHECK
  // and must not place an already completed identity into the new version.
  return [requestedAt, addIsoDays(active.startedAt, 1), usedAt ? addIsoDays(usedAt, 1) : requestedAt]
    .sort((a, b) => b.localeCompare(a))[0];
}

function clearFutureState(active: TrainingPlanCycle, startedAt: string) {
  const clearedWeekChanges = db.prepare("DELETE FROM week_schedule_changes WHERE date>=?").run(startedAt).changes;
  const clearedScheduleOverrides = db.prepare("DELETE FROM schedule_overrides WHERE original_date>=? OR scheduled_date>=?")
    .run(startedAt, startedAt).changes;
  const cancelledPlannedDrafts = db.prepare(`UPDATE workout_drafts
      SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE status='planned' AND date>=?
        AND json_extract(snapshot,'$.programIdentity.programId')=?
        AND CAST(json_extract(snapshot,'$.programIdentity.programVersion') AS INTEGER)=?`)
    .run(startedAt, active.programId, active.programVersion).changes;
  return { clearedWeekChanges, clearedScheduleOverrides, cancelledPlannedDrafts };
}

function knownVersion(version: number): boolean {
  return trainingProgramRegistry.programs.some((program) => program.id === VOLT_PROGRAM_ID && program.version === version);
}

export function startTrainingPlan(version = ACTIVE_PROGRAM_VERSION, now = new Date()): TrainingPlanActivation | null {
  if (!knownVersion(version)) return null;
  const requestedAt = moscowIsoDate(now);
  return db.transaction(() => {
    const active = getActiveTrainingPlanCycle();
    if (active?.programVersion === version) {
      return {
        startedAt: active.startedAt, alreadyStarted: true, cycleId: active.id,
        programId: active.programId, programVersion: active.programVersion,
        archivedCycleId: null, archivedCycleEndedAt: null,
      };
    }
    if (!db.prepare("SELECT 1 FROM profile WHERE id=1").get()) return null;
    if (activeDraftError()) return null;

    const startedAt = active ? transitionStartDate(active, requestedAt) : requestedAt;
    const endedAt = active ? addIsoDays(startedAt, -1) : null;
    if (active) {
      const changed = db.prepare("UPDATE training_plan_cycles SET ended_at=? WHERE id=? AND ended_at IS NULL")
        .run(endedAt, active.id).changes;
      if (changed !== 1) return null;
      clearFutureState(active, startedAt);
    }
    const cycleId = Number(db.prepare(`INSERT INTO training_plan_cycles(program_id,program_version,started_at,restarted_from_cycle_id)
      VALUES(?,?,?,?)`).run(VOLT_PROGRAM_ID, version, startedAt, active?.id ?? null).lastInsertRowid);
    // Historical compatibility only. v4 deliberately does not rewrite the v3
    // field, which remains the immutable activation date of the archived plan.
    if (version === PLAN_V3_PROGRAM_VERSION) {
      db.prepare("UPDATE profile SET training_plan_v3_started_at=? WHERE id=1").run(startedAt);
    }
    return {
      startedAt, alreadyStarted: false, cycleId,
      programId: VOLT_PROGRAM_ID, programVersion: version,
      archivedCycleId: active?.id ?? null, archivedCycleEndedAt: endedAt,
    };
  })();
}

export function restartTrainingPlan(version: number, expectedStartedAt: string, now = new Date()): TrainingPlanRestart {
  if (!knownVersion(version)) return { ok: false, status: 400, error: "Неизвестная версия программы" };
  return db.transaction((): TrainingPlanRestart => {
    const active = getActiveTrainingPlanCycle();
    if (!active || active.programVersion !== version) return { ok: false, status: 404, error: "Активный план не найден" };
    if (active.startedAt !== expectedStartedAt) return { ok: false, status: 409, error: "План уже изменён. Обновите страницу и повторите." };
    if (moscowIsoDate(now) === active.startedAt) return { ok: false, status: 409, error: "Этот цикл уже начинается сегодня" };
    const draftError = activeDraftError();
    if (draftError) return { ok: false, status: 409, error: draftError };

    const startedAt = transitionStartDate(active, moscowIsoDate(now));
    if (startedAt === active.startedAt) return { ok: false, status: 409, error: "Этот цикл уже начинается сегодня" };
    const endedAt = addIsoDays(startedAt, -1);
    const ended = db.prepare("UPDATE training_plan_cycles SET ended_at=? WHERE id=? AND ended_at IS NULL")
      .run(endedAt, active.id).changes;
    if (ended !== 1) return { ok: false, status: 409, error: "План уже изменён. Обновите страницу и повторите." };
    const cycleId = Number(db.prepare(`INSERT INTO training_plan_cycles(program_id,program_version,started_at,restarted_from_cycle_id)
      VALUES(?,?,?,?)`).run(active.programId, version, startedAt, active.id).lastInsertRowid);
    const cleared = clearFutureState(active, startedAt);
    if (version === PLAN_V3_PROGRAM_VERSION) {
      db.prepare("UPDATE profile SET training_plan_v3_started_at=? WHERE id=1").run(startedAt);
    }
    return {
      ok: true, startedAt, cycleId, programId: active.programId, programVersion: version,
      archivedCycleId: active.id, archivedCycleEndedAt: endedAt, ...cleared,
    };
  })();
}

// Compatibility exports. Active application code uses the version-independent
// functions above; old tests and historical integrations keep their contract.
export const startTrainingPlanV3 = (now = new Date()) => {
  const result=startTrainingPlan(PLAN_V3_PROGRAM_VERSION, now);
  return result?{startedAt:result.startedAt,alreadyStarted:result.alreadyStarted,cycleId:result.cycleId}:null;
};
export const restartTrainingPlanV3 = (expectedStartedAt: string, now = new Date()) =>
  restartTrainingPlan(PLAN_V3_PROGRAM_VERSION, expectedStartedAt, now);
