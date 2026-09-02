import type { TrainingDiscipline, TrainingProgramIdentity, TrainingSessionRole, TrainingWorkoutReference } from "@/lib/training-program/types";

// AI-11 — Гибкая неделя. Чистые функции, без обращения к БД: разрешают
// "актуальный" (scheduled) план на дату из канонической программы (buildHomeWeek)
// и пользовательских изменений текущей недели (week_schedule_changes). Общий
// модуль для клиента (карточки/редактор) и сервера (AI Context Builder) —
// как app/training-analytics-model.ts.

export type HomeWeekDay = {
  id?: string;
  day: number; // 1 (Пн) .. 7 (Вс)
  d: string;
  type: string;
  title: string;
  time: string;
  rounds: number;
  image: string;
  exercises: any[];
  warmup?: any[];
  optional?: boolean;
  availability?: "planned";
  discipline?: TrainingDiscipline;
  role?: TrainingSessionRole;
  required?: boolean;
  workoutRef?: TrainingWorkoutReference;
  programIdentity?: TrainingProgramIdentity;
  // Непустой список делает слот гибким: дисциплину можно заменить на выбранную
  // дату, не трогая каноническую программу.
  alternatives?: HomeWeekAlternative[];
  sessions?: HomeWeekSession[];
};

// Альтернатива несёт готовое содержимое тренировки: модель расписания
// остаётся чистой и не обращается к каталогу упражнений.
export type HomeWeekAlternative = {
  id: string;
  discipline: TrainingDiscipline;
  role: TrainingSessionRole;
  title: string;
  time: string;
  type: string;
  rounds: number;
  image: string;
  exercises: any[];
  warmup?: any[];
  workoutRef: TrainingWorkoutReference;
};

export type HomeWeekSession = Omit<HomeWeekDay, "day" | "d" | "sessions"> & { day?: number; d?: string };

// Plan v2 добавляет несколько сессий внутри одного календарного дня. Старые
// дни остаются валидны и автоматически рассматриваются как одна сессия.
export function sessionsForDay(day: HomeWeekDay): HomeWeekSession[] {
  return day.sessions?.length ? day.sessions : [day];
}

export const WEEK_SCHEDULE_ACTIONS = ["replace", "swap", "rest"] as const;
export type WeekScheduleAction = (typeof WEEK_SCHEDULE_ACTIONS)[number];

// Причина изменения — необязательный контекст для Coach, не аналитика и не диагноз.
export const WEEK_SCHEDULE_REASON_CODES = ["mood", "fatigue", "pain", "no_equipment", "weather", "schedule", "other"] as const;
export type WeekScheduleReasonCode = (typeof WEEK_SCHEDULE_REASON_CODES)[number] | "";
export const WEEK_SCHEDULE_REASON_LABELS: Record<WeekScheduleReasonCode, string> = {
  "": "Без причины",
  mood: "Настроение",
  fatigue: "Усталость",
  pain: "Боль или дискомфорт",
  no_equipment: "Нет оборудования",
  weather: "Погода",
  schedule: "Расписание",
  other: "Другое",
};

export type WeekScheduleChange = {
  // Выбранная альтернатива гибкого слота, если дисциплину заменили.
  alternativeSessionId?: string | null;
  id: number;
  date: string;
  action: WeekScheduleAction;
  assignedSourceDay: number | null;
  swapWithDate: string | null;
  reasonCode: WeekScheduleReasonCode;
  createdAt: string;
  updatedAt: string;
};

export function localIso(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function isoWeekdayOf(dateIso: string): number {
  const d = new Date(`${dateIso}T00:00:00`).getDay();
  return d === 0 ? 7 : d;
}

// Понедельник..воскресенье календарной недели, содержащей dateIso.
export function weekRangeContaining(dateIso: string): { mondayIso: string; sundayIso: string } {
  const weekday = isoWeekdayOf(dateIso);
  const base = new Date(`${dateIso}T00:00:00`);
  const monday = new Date(base);
  monday.setDate(base.getDate() - (weekday - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { mondayIso: localIso(monday), sundayIso: localIso(sunday) };
}

export function isDateInRange(dateIso: string, mondayIso: string, sundayIso: string): boolean {
  return dateIso >= mondayIso && dateIso <= sundayIso;
}

export function datesOfWeek(mondayIso: string): string[] {
  const monday = new Date(`${mondayIso}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localIso(d);
  });
}

function findDay(homeWeek: HomeWeekDay[], day: number): HomeWeekDay | null {
  return homeWeek.find((x) => x.day === day) ?? null;
}

// Отдых собирается из шаблона воскресенья программы (день 7 в buildHomeWeek —
// всегда "Полный отдых"), но с day/d актуальной даты, чтобы подпись дня в UI
// совпадала с календарной датой, а не с исходным днём недели плана.
function buildRestPlan(homeWeek: HomeWeekDay[], targetDay: number, targetLabel: string): HomeWeekDay {
  const template = findDay(homeWeek, 7);
  return {
    day: targetDay,
    d: targetLabel,
    type: "Отдых",
    title: "Полный отдых",
    time: "—",
    rounds: 0,
    image: "",
    exercises: template?.exercises ?? [["Восстановление", "Сон и заготовка еды на 2–3 дня", "По самочувствию"]],
  };
}

export type ResolvedDayPlan = {
  date: string;
  weekday: number;
  original: HomeWeekDay;
  scheduled: HomeWeekDay;
  changed: boolean;
  action: WeekScheduleAction | null;
  reasonCode: WeekScheduleReasonCode;
  swapWithDate: string | null;
  changeId: number | null;
  // Заполняется на клиенте (app/page.tsx) из workouts/workoutDrafts — чистая
  // модель здесь не знает о них, только о week_schedule_changes.
  locked?: { completed: boolean; anyCompleted?: boolean; openDraft: boolean; completedRequiredSessions?: number; requiredSessions?: number };
};

export function resolvePlanForDate(
  date: string,
  homeWeek: HomeWeekDay[],
  changesByDate: Map<string, WeekScheduleChange>,
): ResolvedDayPlan {
  const weekday = isoWeekdayOf(date);
  const original = findDay(homeWeek, weekday) ?? homeWeek[0];
  const change = changesByDate.get(date);
  if (!change) {
    return { date, weekday, original, scheduled: original, changed: false, action: null, reasonCode: "", swapWithDate: null, changeId: null };
  }
  if (change.action === "rest") {
    return {
      date, weekday, original,
      scheduled: buildRestPlan(homeWeek, weekday, original.d),
      changed: true, action: "rest", reasonCode: change.reasonCode, swapWithDate: null, changeId: change.id,
    };
  }
  // Замена дисциплины в гибком слоте: день остаётся на месте, меняется его
  // содержимое. Каноническая программа не трогается — выбор живёт только в
  // week_schedule_changes, как и переносы дней.
  const alternative = change.alternativeSessionId
    ? original.alternatives?.find((item) => item.id === change.alternativeSessionId) ?? null
    : null;
  if (alternative) {
    return {
      date, weekday, original,
      scheduled: {
        ...original,
        id: alternative.id, title: alternative.title, time: alternative.time, type: alternative.type,
        rounds: alternative.rounds, image: alternative.image, exercises: alternative.exercises,
        warmup: alternative.warmup, discipline: alternative.discipline, role: alternative.role,
        workoutRef: alternative.workoutRef,
      },
      changed: true, action: change.action, reasonCode: change.reasonCode,
      swapWithDate: null, changeId: change.id,
    };
  }
  const assignedDay = change.assignedSourceDay != null ? findDay(homeWeek, change.assignedSourceDay) : null;
  const scheduled = assignedDay ? { ...assignedDay, day: weekday, d: original.d } : original;
  return {
    date, weekday, original, scheduled,
    changed: assignedDay != null,
    action: change.action, reasonCode: change.reasonCode, swapWithDate: change.swapWithDate, changeId: change.id,
  };
}

export function changesByDateMap(changes: WeekScheduleChange[]): Map<string, WeekScheduleChange> {
  return new Map(changes.map((c) => [c.date, c]));
}

export function buildWeekSchedule(homeWeek: HomeWeekDay[], changes: WeekScheduleChange[], mondayIso: string): ResolvedDayPlan[] {
  const byDate = changesByDateMap(changes);
  return datesOfWeek(mondayIso).map((date) => resolvePlanForDate(date, homeWeek, byDate));
}

// Текст предпросмотра результата операции до сохранения (см. AI-11 UX).
export function previewReplaceText(targetLabel: string, assignedTitle: string): string {
  return `${targetLabel} — ${assignedTitle}`;
}
export function previewSwapText(fromTitle: string, toLabel: string): string {
  return `«${fromTitle}» перенесётся на ${toLabel}`;
}
export function previewRestText(targetLabel: string): string {
  return `${targetLabel} — отдых`;
}
