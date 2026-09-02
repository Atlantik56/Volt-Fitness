// Чистая (без обращения к БД/node-built-ins) часть формата снапшота
// тренировки, вынесенная из lib/active-workout-service.ts, чтобы её можно
// было безопасно импортировать из клиентских компонентов VOLT Swim
// (lib/swim/workout-engine.ts собирает WorkoutSnapshot в браузере перед
// отправкой в /api/fitness). lib/active-workout-service.ts переэкспортирует
// эти же имена — существующие импортёры не меняются.
export type SnapshotExercise = { name: string; order: number; target: string; recommendedWeight: number; sets: number | null; repMin: number | null; repMax: number | null; unit: string };
export type WorkoutSnapshotOrigin = "original" | "scheduled";
import type { TrainingProgramIdentity } from "@/lib/training-program/types";

export type WorkoutSnapshot = {
  title:string;type:string;rounds:number;exercises:SnapshotExercise[];origin:WorkoutSnapshotOrigin;
  scheduledFor:string|null;scheduleChangeId:number|null;changeReasonCode:string;
  programIdentity?:TrainingProgramIdentity;
};

const text = (x: unknown, max = 160) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const finite = (x: unknown, min: number, max: number) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

function parseTarget(target: string) {
  const normalized = target.replace(/[–—]/g, "-");
  const setsMatch = normalized.match(/(\d+)(?:\s*-\s*\d+)?\s*[×xх]/i);
  const values = [...normalized.matchAll(/\d+/g)].map((m) => Number(m[0]));
  const after = setsMatch ? normalized.slice((setsMatch.index || 0) + setsMatch[0].length) : normalized;
  const reps = [...after.matchAll(/\d+/g)].map((m) => Number(m[0]));
  const unit = /сек/i.test(target) ? "сек" : /мин/i.test(target) ? "мин" : /м(?:\s|$)/i.test(target) ? "м" : "повт.";
  return { sets: setsMatch ? values[0] : null, repMin: reps[0] ?? null, repMax: reps[1] ?? reps[0] ?? null, unit };
}

export function normalizeSnapshot(raw: any): WorkoutSnapshot | null {
  const title = text(raw?.title), type = text(raw?.type, 40), rounds = finite(raw?.rounds ?? 1, 1, 20);
  if (!title || !type || rounds === null || !Array.isArray(raw?.exercises) || raw.exercises.length < 1 || raw.exercises.length > 100) return null;
  const exercises: SnapshotExercise[] = [];
  for (let i = 0; i < raw.exercises.length; i++) {
    const item = raw.exercises[i], name = text(item?.name), target = text(item?.target, 120), weight = finite(item?.recommendedWeight ?? 0, 0, 500);
    if (!name || !target || weight === null) return null;
    exercises.push({ name, order: i, target, recommendedWeight: weight, ...parseTarget(target) });
  }
  const origin: WorkoutSnapshotOrigin = raw?.origin === "scheduled" ? "scheduled" : "original";
  const scheduledFor=typeof raw?.scheduledFor==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(raw.scheduledFor)?raw.scheduledFor:null;
  const scheduleChangeId = Number.isSafeInteger(raw?.scheduleChangeId) && raw.scheduleChangeId > 0 ? raw.scheduleChangeId : null;
  const allowedReasons=new Set(["mood","fatigue","pain","no_equipment","weather","schedule","other"]);
  const changeReasonCode=allowedReasons.has(raw?.changeReasonCode)?String(raw.changeReasonCode):"";
  const identity = raw?.programIdentity;
  const programIdentity = identity && text(identity.programId, 80) && Number.isInteger(identity.programVersion) && identity.programVersion > 0
    && Number.isInteger(identity.weekIndex) && identity.weekIndex > 0 && text(identity.sessionId, 100)
    ? { programId: text(identity.programId, 80), programVersion: identity.programVersion, weekIndex: identity.weekIndex, sessionId: text(identity.sessionId, 100),
        ...(Number.isInteger(identity.cycleId) && identity.cycleId > 0 ? { cycleId: identity.cycleId } : {}) }
    : null;
  const normalized={title,type,rounds,exercises,origin,scheduledFor,scheduleChangeId,changeReasonCode};
  return programIdentity?{...normalized,programIdentity}:normalized;
}
