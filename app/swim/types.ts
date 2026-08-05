// View models для главной страницы /swim. Доменная модель программ/упражнений
// теперь живёт в lib/swim/types.ts (Program/Week/Workout/Interval/Insight) —
// здесь только формы, которые собирает lib/swim-data.ts для Hero/карточек.
import type { SwimInsight } from "@/lib/swim/types";
export type SwimNextWorkoutStatus = "not_started" | "in_progress" | "awaiting_confirmation";

export type SwimNextWorkoutView = {
  status: SwimNextWorkoutStatus;
  programId: string;
  workoutId: string;
  title: string;
  goal: string;
  distanceMeters: number;
  estimatedMinutes: number;
  weekIndex: number;
  progressPercent: number;
  // Из общего расписания VOLT (lib/swim/schedule-sync.ts) — не дублируется
  // клиентом. calendarDate/isToday null, если дату не удалось спроецировать.
  calendarDate: string | null;
  weekday: number | null;
  isToday: boolean;
} | null;

export type SwimLastSwimView = {
  date: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  paceLabel: string | null;
  poolLengthMeters: number | null;
  source: "manual" | "imported_metric";
  notes: string | null;
} | null;

export type SwimWeeklyActivityView = {
  swimCount: number;
  totalDistanceMeters: number;
  goalMeters: number | null;
  totalDurationSeconds: number;
  totalCalories: number;
  avgHeartRate: number | null;
  dailyMeters: number[];
};

export type SwimRecentSessionView = {
  id: number;
  date: string;
  title: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  paceLabel: string | null;
  avgHeartRate: number | null;
  effort: string | null;
};

export type SwimEffortDistribution = { easy: number; aerobic: number; hard: number };

// История (Sprint 3) — тот же честный источник, что recentSwims/lastSwim
// (workout_logs, отфильтрованные isSwimActivity), без отдельной аналитики.
// route не null только когда лог удалось однозначно связать с конкретной
// тренировкой программы через plan_key (см. lib/swim-data.ts) — иначе
// "быстрый переход в детали" не показывается, а не ведёт в никуда.
export type SwimHistorySource = "manual" | "imported_metric";

export type SwimHistoryItem = {
  id: number;
  date: string;
  title: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  paceLabel: string | null;
  avgHeartRate: number | null;
  source: SwimHistorySource;
  effort: string | null;
  route: { programId: string; workoutId: string } | null;
};

export type SwimHistoryData = {
  items: SwimHistoryItem[];
  hasAnyHistory: boolean;
};

export type SwimMetricsView = {
  avgPaceLabel: string | null;
  swolf: number | null;
  avgHeartRate: number | null;
  calories: number | null;
};

export type SwimHomeData = {
  nextWorkout: SwimNextWorkoutView;
  lastSwim: SwimLastSwimView;
  weeklyActivity: SwimWeeklyActivityView;
  metrics: SwimMetricsView;
  hasAnySwimHistory: boolean;
  insights: SwimInsight[];
  recentSwims: SwimRecentSessionView[];
  monthRecord: SwimRecentSessionView | null;
  effortDistribution: SwimEffortDistribution;
};
