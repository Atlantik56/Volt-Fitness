import { TRAINING_PROGRAMS } from "@/lib/training-program/definitions";
import type {
  ResolvedTrainingWeek,
  TrainingProgramDefinition,
  TrainingProgramIdentity,
  TrainingSessionDefinition,
  TrainingWeekDefinition,
} from "@/lib/training-program/types";

function assertProgram(program: TrainingProgramDefinition): void {
  if (!program.id || !Number.isInteger(program.version) || program.version < 1) throw new Error("Training program requires stable id/version");
  if (!Number.isInteger(program.effectiveFromWeek) || program.effectiveFromWeek < 1) throw new Error("Training program requires effectiveFromWeek >= 1");
  const weekIndexes = new Set<number>();
  for (const week of program.weeks) {
    if (weekIndexes.has(week.index)) throw new Error(`Duplicate week ${week.index} in ${program.id}@${program.version}`);
    weekIndexes.add(week.index);
    const sessionKeys = new Set<string>();
    for (const session of week.sessions) {
      if (session.day < 1 || session.day > 7) throw new Error(`Invalid day for ${session.id}`);
      const key = `${session.day}:${session.id}`;
      if (sessionKeys.has(key)) throw new Error(`Duplicate session ${key} in week ${week.index}`);
      sessionKeys.add(key);
    }
  }
}

export class TrainingProgramRegistry {
  readonly programs: readonly TrainingProgramDefinition[];

  constructor(programs: readonly TrainingProgramDefinition[]) {
    const identities = new Set<string>();
    for (const program of programs) {
      assertProgram(program);
      const identity = `${program.id}@${program.version}`;
      if (identities.has(identity)) throw new Error(`Duplicate training program ${identity}`);
      identities.add(identity);
    }
    this.programs = [...programs].sort((a, b) => a.effectiveFromWeek - b.effectiveFromWeek || a.version - b.version);
  }

  resolveWeek(weekIndex: number): ResolvedTrainingWeek {
    const normalizedWeek = Math.max(1, Math.floor(weekIndex));
    const program = [...this.programs]
      .filter((candidate) => candidate.effectiveFromWeek <= normalizedWeek)
      .sort((a, b) => b.effectiveFromWeek - a.effectiveFromWeek || b.version - a.version)[0];
    if (!program) throw new Error(`No effective training program for week ${normalizedWeek}`);
    const exact = program.weeks.find((week) => week.index === normalizedWeek);
    if (exact) return { program, week: exact };
    if (!program.continuationWeek) throw new Error(`No week ${normalizedWeek} in ${program.id}@${program.version}`);
    return { program, week: { ...program.continuationWeek, index: normalizedWeek } };
  }

  identityFor(program: TrainingProgramDefinition, week: TrainingWeekDefinition, session: TrainingSessionDefinition): TrainingProgramIdentity {
    return { programId: program.id, programVersion: program.version, weekIndex: week.index, sessionId: session.id };
  }

  resolveIdentity(identity: TrainingProgramIdentity): { program: TrainingProgramDefinition; week: TrainingWeekDefinition; session: TrainingSessionDefinition } | null {
    const program = this.programs.find((candidate) => candidate.id === identity.programId && candidate.version === identity.programVersion);
    if (!program) return null;
    const week = program.weeks.find((candidate) => candidate.index === identity.weekIndex)
      ?? (program.continuationWeek ? { ...program.continuationWeek, index: identity.weekIndex } : null);
    if (!week) return null;
    const session = week.sessions.find((candidate) => candidate.id === identity.sessionId);
    return session ? { program, week, session } : null;
  }

  identityForSwimWorkout(programId: string, programVersion: number, workoutId: string): TrainingProgramIdentity | null {
    for (const program of this.programs) {
      for (const week of program.weeks) {
        const session = week.sessions.find((candidate) => candidate.workoutRef.kind === "swim"
          && candidate.workoutRef.programId === programId && candidate.workoutRef.programVersion === programVersion
          && candidate.workoutRef.workoutId === workoutId);
        if (session) return this.identityFor(program, week, session);
      }
    }
    return null;
  }
}

export const trainingProgramRegistry = new TrainingProgramRegistry(TRAINING_PROGRAMS);

export function resolveTrainingWeek(weekIndex: number): ResolvedTrainingWeek {
  return trainingProgramRegistry.resolveWeek(weekIndex);
}

export function programWeekForDate(programStart: string | undefined, dateIso: string): number {
  if (!programStart) return 1;
  const start = new Date(`${programStart}T00:00:00`);
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(date.getTime())) return 1;
  const monday = (value: Date) => {
    const result = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
    return result;
  };
  const diffDays = Math.round((monday(date).getTime() - monday(start).getTime()) / 86_400_000);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

export function programWeekMonday(programStart: string, weekIndex: number): string {
  const start = new Date(`${programStart}T00:00:00`);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + (Math.max(1, weekIndex) - 1) * 7);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}
