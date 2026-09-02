// VOLT Swim — доменные типы программ, упражнений и AI Coach контракта.
// Единственный источник структуры программ/упражнений для Sprint 2+; компоненты
// не должны определять собственные формы этих данных.

export type SwimStroke = "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "kick" | "drill" | "mixed";
export type ExerciseCategory = "stroke" | "drill" | "kick" | "pull" | "technique";
export type ExerciseDifficulty = "beginner" | "intermediate" | "advanced";

export type SwimExercise = {
  id: string;
  name: string;
  description: string;
  category: ExerciseCategory;
  stroke: SwimStroke;
  equipment: string[];
  difficulty: ExerciseDifficulty;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  tags: string[];
  futureVideoId: string | null;
};

export type SwimIntervalType = "warmup" | "main_set" | "cooldown" | "drill" | "recovery" | "sprint" | "easy" | "technique";

export type SwimInterval = {
  id: string;
  type: SwimIntervalType;
  exerciseId: string;
  // Дистанция одного повтора; итоговый объём = distanceMeters * repeats.
  distanceMeters: number;
  repeats: number;
  description: string;
  restSeconds: number | null;
  restSecondsMax?: number | null;
  targetPaceSecondsPer100: number | null;
  equipment: string[];
};

export type SwimWorkoutLevel = "beginner" | "intermediate" | "advanced";

export type SwimWorkoutDef = {
  id: string;
  title: string;
  goal: string;
  level: SwimWorkoutLevel;
  // Авторская оценка длительности (та же роль, что `time:"~30–35 мин"` в
  // app/personal-data.ts) — не вычисляемая "точная" цифра, честная ~оценка.
  estimatedMinutes: number;
  intervals: SwimInterval[];
};

export type SwimDay = {
  dayIndex: number; // 1..7, как homeWeek в app/personal-data.ts
  workout: SwimWorkoutDef | null; // null — день отдыха
};

export type SwimWeekDef = {
  weekIndex: number; // 1-based
  title?: string;
  plannedDistanceMeters?: number;
  days: SwimDay[];
};

export type SwimProgramStatus = "available" | "coming_soon";

export type SwimProgramDef = {
  id: string;
  name: string;
  description: string;
  level: SwimWorkoutLevel;
  status: SwimProgramStatus;
  // Версия попадает в snapshot.type (см. lib/swim/workout-engine.ts) — правка
  // программы не должна переписывать planKey уже пройденных тренировок.
  version: number;
  weeks: SwimWeekDef[];
};

// --- AI Coach контракт (архитектура, Sprint 2 сервис возвращает []) ---
export type SwimInsightPriority = "low" | "medium" | "high";
export type SwimInsightSource = "pace" | "volume" | "consistency" | "recovery" | "program";

export type SwimInsight = {
  id: string;
  title: string;
  description: string;
  priority: SwimInsightPriority;
  source: SwimInsightSource;
  createdAt: string;
};

// --- Прогресс программы (вычисляется, не хранится) ---
export type SwimWorkoutProgressStatus = "not_started" | "in_progress" | "awaiting_confirmation" | "completed";

export type SwimWorkoutActual = {
  distanceMeters: number;
  durationSeconds: number;
  calories: number;
  // Реальная дата подтверждённого workout_log — источник истины для
  // календарной синхронизации (lib/swim/schedule-sync.ts), а не для метрик.
  date: string;
};

// --- Синхронизация с основным расписанием VOLT (app/week-schedule-model.ts) ---
// Единственное место, где решается "в какой день у меня плавание": слот
// плавания в Foundation получает дату не из собственной нумерации дней
// программы, а из итогового расписания VOLT (buildHomeWeek + week_schedule_
// changes). См. lib/swim/schedule-sync.ts.
export type SwimCalendarOrigin = "completed" | "active" | "projected";

export type SwimCalendarSlot = {
  date: string;
  weekday: number; // 1..7, Пн..Вс
  isToday: boolean;
  origin: SwimCalendarOrigin;
  scheduleChangeId: number | null;
};

// Разрешённый вид одного календарного дня в горизонте программы (используется
// для отображения всех 7 дней недели на экране плана, не только тех, где
// назначено плавание) — "итоговый вид активности" и "статус слота" из API.
export type SwimCalendarDay = {
  date: string;
  weekday: number;
  isToday: boolean;
  isSwimSlot: boolean;
  activityType: string;
  activityTitle: string;
  scheduleChangeId: number | null;
};

export type SwimWorkoutProgress = {
  workout: SwimWorkoutDef;
  weekIndex: number;
  dayIndex: number;
  status: SwimWorkoutProgressStatus;
  planKey: string;
  draftId: number | null;
  // Дата активного/ожидающего подтверждения черновика (workout_drafts.date),
  // если он есть — используется как "закреплённая" дата слота, см. schedule-sync.
  draftDate: string | null;
  actual: SwimWorkoutActual | null;
  // Итоговая календарная привязка тренировки (null, только если не удалось
  // спроецировать в пределах горизонта — не должно происходить на практике).
  calendar: SwimCalendarSlot | null;
};

export type SwimProgramProgress = {
  program: SwimProgramDef;
  // Одноразовая дата активации Swim внутри общего плана VOLT. Это не отдельный
  // Week 1 anchor: effective week и календарь приходят из training program.
  startedAt: string | null;
  // Current common VOLT plan cycle. Null is retained for legacy/Foundation.
  planCycleId: number | null;
  completedCount: number;
  totalCount: number;
  currentWeekIndex: number | null;
  nextWorkout: SwimWorkoutProgress | null;
  workouts: SwimWorkoutProgress[];
  // Разрешённый календарь всей программы (8 недель × 7 дней, начиная с
  // startedAt) — единственный источник дат/дней недели для UI, клиент по нему
  // больше не считает расписание сам.
  calendarDays: SwimCalendarDay[];
};

// --- Общий resolver "какая тренировка Swim назначена этой дате" ---
// Единственный источник ответа на этот вопрос для всех поверхностей VOLT
// (глобальная Главная, /swim, /swim/workouts) — см.
// lib/swim/services.ts:resolveScheduledSwimWorkout. Null — дата вообще не
// Swim-слот по основному плану VOLT (там отдых/другая активность).
export type ResolvedSwimSlot =
  | {
      kind: "workout";
      calendarDate: string;
      weekday: number;
      isToday: boolean;
      programId: string;
      workoutId: string;
      // Полное определение назначенной тренировки из программы VOLT Swim.
      // Поверхности общего VOLT используют его для превью без собственной
      // копии состава тренировки и без второго клиентского resolver-а.
      workout: SwimWorkoutDef;
      status: SwimWorkoutProgressStatus;
      draftId: number | null;
      scheduleChangeId: number | null;
      origin: SwimCalendarOrigin;
      // Дата, на которую программа сама назначила эту тренировку, если она не
      // совпадает с запрошенным днём. Заполняется, когда план VOLT говорит
      // «сегодня бассейн», а календарь Foundation на этот день ничего не
      // назначил: тогда подставляется ближайшая по программе тренировка, и
      // интерфейс обязан показать, что это не расписание сегодняшнего дня.
      scheduledFor: string | null;
      route: string;
    }
  | {
      // Swim-слот в основном плане VOLT существует, но связать его с
      // конкретной тренировкой Foundation не удалось (программа недоступна
      // или все тренировки Foundation уже распределены по другим датам).
      kind: "unresolved";
      calendarDate: string;
      weekday: number;
      isToday: boolean;
      scheduleChangeId: number | null;
    };
