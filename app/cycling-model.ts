import { buildHomeWeek } from "./personal-data.ts";
import {
  buildWeekSchedule,
  isoWeekdayOf,
  sessionsForDay,
  weekRangeContaining,
  type HomeWeekSession,
  type WeekScheduleChange,
} from "./week-schedule-model.ts";
import {
  CYCLING_LOAD_FEEDBACK_VALUES,
  CYCLING_SLOT_ID,
  isCyclingSlot,
  isCyclingWorkoutRecord,
  type CyclingLoadFeedback,
} from "@/lib/cycling";
import { activatedPlanPosition, programWeekForDate } from "@/lib/training-program/registry";
import type { TrainingProgramIdentity } from "@/lib/training-program/types";

export type CyclingDraftStatus = "planned" | "active" | "awaiting_confirmation" | "completed" | "cancelled";
export type CyclingDraftRecord = {
  id: number;
  date: string;
  status: CyclingDraftStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  workoutId?: number | null;
  snapshot: {
    id?: string;
    type?: string;
    title?: string;
    exercises?: unknown[];
    origin?: "original" | "scheduled";
    scheduleChangeId?: number | null;
    programIdentity?: TrainingProgramIdentity;
  };
  confirmation?: Record<string, unknown>;
};
export type CyclingWorkoutRecord = {
  id: number;
  date: string;
  type?: string;
  title?: string;
  durationSeconds?: number;
  avgHeartRate?: number;
  distanceMeters?: number;
  avgSpeed?: number;
  calories?: number;
  metricsSource?: string;
  loadFeedback?: CyclingLoadFeedback;
};

export type CyclingResolution = {
  date: string;
  weekday: number;
  session: HomeWeekSession;
  optional: boolean;
  changed: boolean;
  scheduleChangeId: number | null;
  origin: "original" | "scheduled";
  status: "planned" | "active" | "awaiting_confirmation" | "completed";
  draft: CyclingDraftRecord | null;
  workout: CyclingWorkoutRecord | null;
  programWeek: number;
  mondayIso: string;
  sundayIso: string;
};

export type ResolveCyclingInput = {
  programStart?: string;
  trainingPlanV3StartedAt?: string | null;
  today: string;
  selectedDate?: string | null;
  weekScheduleChanges?: WeekScheduleChange[];
  workoutDrafts?: CyclingDraftRecord[];
  workouts?: CyclingWorkoutRecord[];
};

const draftStatusRank: Record<CyclingDraftStatus, number> = {
  awaiting_confirmation: 4,
  active: 3,
  planned: 2,
  completed: 1,
  cancelled: 0,
};

function sessionFromDraft(draft: CyclingDraftRecord): HomeWeekSession {
  const exercises = (Array.isArray(draft.snapshot.exercises) ? draft.snapshot.exercises : []).map((item: any, index) => {
    if (Array.isArray(item)) return item;
    const target = String(item?.target ?? "По плану");
    return [
      String(item?.name ?? `Этап ${index + 1}`),
      target,
      target,
    ];
  });
  return {
    id: draft.snapshot.id ?? CYCLING_SLOT_ID,
    type: String(draft.snapshot.type ?? "Cycling"),
    title: String(draft.snapshot.title ?? "Bike / Indoor Cycling"),
    time: "По сохранённому плану",
    rounds: 1,
    image: "",
    optional: true,
    exercises,
    programIdentity: draft.snapshot.programIdentity,
  };
}

function cyclingCandidates(input: ResolveCyclingInput, date: string) {
  const { mondayIso, sundayIso } = weekRangeContaining(date);
  const programWeek = activatedPlanPosition(input.trainingPlanV3StartedAt,date)?.weekIndex
    ?? programWeekForDate(input.programStart,date);
  const schedule = buildWeekSchedule(
    buildHomeWeek(input.programStart,input.trainingPlanV3StartedAt,date),
    input.weekScheduleChanges ?? [],
    mondayIso,
  );
  const candidates = schedule.flatMap((day) =>
    sessionsForDay(day.scheduled)
      .filter(isCyclingSlot)
      .map((session) => ({ day, session })),
  );
  return { mondayIso, sundayIso, programWeek, candidates };
}

export function resolveCyclingAssignment(input: ResolveCyclingInput): CyclingResolution | null {
  const openDraft = (input.workoutDrafts ?? [])
    .filter((draft) => draft.status !== "completed" && draft.status !== "cancelled" && isCyclingSlot(draft.snapshot))
    .slice()
    .sort((a, b) => draftStatusRank[b.status] - draftStatusRank[a.status] || b.id - a.id)[0];

  // An open draft is persisted state and therefore wins over the current
  // calendar week or a stale query parameter. This restores Active/Result
  // after refresh without creating a Cycling-specific calendar.
  if (openDraft) {
    const open = cyclingCandidates(input, openDraft.date);
    const restoredSession = sessionFromDraft(openDraft);
    return {
      date: openDraft.date,
      weekday: isoWeekdayOf(openDraft.date),
      session: restoredSession,
      optional: true,
      changed: openDraft.snapshot.origin === "scheduled",
      scheduleChangeId: openDraft.snapshot.scheduleChangeId ?? null,
      origin: openDraft.snapshot.origin === "scheduled" ? "scheduled" : "original",
      status: openDraft.status === "awaiting_confirmation" ? "awaiting_confirmation" : "active",
      draft: openDraft,
      workout: null,
      programWeek: open.programWeek,
      mondayIso: open.mondayIso,
      sundayIso: open.sundayIso,
    };
  }

  const selectedDate = input.selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(input.selectedDate)
    ? input.selectedDate
    : null;
  const anchorDate = selectedDate ?? input.today;
  const { mondayIso, sundayIso, programWeek, candidates } = cyclingCandidates(input, anchorDate);
  const selected = (selectedDate ? candidates.find(({ day }) => day.date === selectedDate) : null)
    ?? candidates.find(({ day }) => day.date >= input.today)
    ?? candidates[0];
  if (!selected) return null;

  const draft = (input.workoutDrafts ?? []).find((item) =>
    item.date === selected.day.date && item.status !== "cancelled" && isCyclingSlot(item.snapshot),
  ) ?? null;
  const workout = (input.workouts ?? []).find((item) =>
    item.date === selected.day.date && isCyclingWorkoutRecord(item),
  ) ?? null;
  const status = draft?.status === "awaiting_confirmation"
    ? "awaiting_confirmation"
    : draft?.status === "active"
      ? "active"
      : workout
        ? "completed"
        : "planned";

  return {
    date: selected.day.date,
    weekday: selected.day.weekday,
    session: selected.session,
    optional: selected.session.optional === true,
    changed: selected.day.changed,
    scheduleChangeId: selected.day.changeId,
    origin: selected.day.changed ? "scheduled" : "original",
    status,
    draft,
    workout,
    programWeek,
    mondayIso,
    sundayIso,
  };
}

export function cyclingSnapshotFor(resolution: CyclingResolution) {
  return {
    title: resolution.session.title,
    type: resolution.session.type,
    rounds: resolution.session.rounds || 1,
    origin: resolution.origin,
    scheduleChangeId: resolution.scheduleChangeId,
    programIdentity: resolution.session.programIdentity,
    exercises: resolution.session.exercises.map((exercise: any[]) => ({
      name: String(exercise[0] ?? "Этап тренировки"),
      target: String(exercise[2] ?? "По плану"),
      recommendedWeight: 0,
    })),
  };
}

export type CyclingHomeSummary = {
  rides: number;
  durationSeconds: number;
  averageHeartRate: number | null;
  averageSpeed: number | null;
  lastRide: CyclingWorkoutRecord | null;
  latestLoadFeedback: CyclingLoadFeedback;
};

const positive = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function cyclingHomeSummary(
  workouts: CyclingWorkoutRecord[],
  mondayIso: string,
  sundayIso: string,
): CyclingHomeSummary {
  const cycling = workouts
    .filter(isCyclingWorkoutRecord)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const week = cycling.filter((workout) => workout.date >= mondayIso && workout.date <= sundayIso);
  const heartRates = week.map((workout) => positive(workout.avgHeartRate)).filter((value): value is number => value !== null);
  const speeds = week.map((workout) => {
    const saved = positive(workout.avgSpeed);
    if (saved !== null) return saved;
    const distance = positive(workout.distanceMeters);
    const duration = positive(workout.durationSeconds);
    return distance !== null && duration !== null ? (distance / 1000) / (duration / 3600) : null;
  }).filter((value): value is number => value !== null);
  const latestWithFeedback = cycling.find((workout) =>
    Boolean(workout.loadFeedback) && (CYCLING_LOAD_FEEDBACK_VALUES as readonly string[]).includes(workout.loadFeedback ?? ""),
  );
  return {
    rides: week.length,
    durationSeconds: week.reduce((sum, workout) => sum + (positive(workout.durationSeconds) ?? 0), 0),
    averageHeartRate: heartRates.length ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length) : null,
    averageSpeed: speeds.length ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : null,
    lastRide: cycling[0] ?? null,
    latestLoadFeedback: latestWithFeedback?.loadFeedback ?? "",
  };
}
