// Sprint AI-2 — единый серверный загрузчик данных для AI Coach chat, MCP и
// будущих отчётов. Единственное место, где для этих потребителей выполняются
// SQL-запросы к SQLite: chat/MCP/отчёты больше не собирают свои наборы полей
// вручную. Возвращает только сырые/ограниченные строки — нормализация и
// компактная LLM-проекция находятся в lib/ai-context.ts.
import type Database from "better-sqlite3";
import { buildAutomaticMilestones, type Milestone } from "./milestones.ts";

// Поля отмечены опциональными, а не строго обязательными: сама БД (lib/db.ts)
// хранит их с NOT NULL DEFAULT и всегда возвращает значение, но buildAiCoachContext
// принимает этот же тип и от вызовов с частично заполненными фикстурами (тесты,
// ручные вызовы) — как и раньше делал CoachInput. Опциональность здесь про гибкость
// входа, а не про то, что в БД бывает NULL.
export type ProfileRow = {
  name?: string;
  height?: number;
  startWeight?: number;
  targetWeight?: number;
  programStart?: string;
} | null;

// weight/waist/... в measurements — единственные по-настоящему nullable колонки
// среди используемых здесь таблиц (в БД без NOT NULL).
export type MeasurementRow = { date: string; weight: number | null };
export type FoodLogRow = { date: string; calories?: number; protein?: number };
export type WorkoutRow = { date: string; type?: string; title?: string; effort?: string; painAfter?: number | null };
export type WellnessRow = { date: string; energy?: number; pain?: number; painArea?: string; note?: string };
export type ActivityRow = {
  date: string;
  steps?: number;
  activeMinutes?: number;
  calories?: number;
  beers?: number;
  sleepHours?: number;
  workEndTime?: string;
  firstDrinkTime?: string;
  dinner?: number;
  walk?: number;
  waterLiters?: number;
};
export type MoodRow = { date: string; mood: string; note?: string };

// Личный рекорд по упражнению — лучший вес за всю историю до анкорной даты,
// а не только за ограниченное окно недавних записей (см. loadPersonalRecords).
export type PersonalRecordRow = { exercise: string; weight: number; reps: number; date: string; isRecord: boolean };

export type StageKind = "start" | "home" | "pool" | "gym" | "custom";
export type ProgramStageRow = {
  id: number;
  kind: StageKind;
  title: string;
  startDate: string;
  endDate: string | null;
  note: string;
  goal: string;
};

// Тот же локальный тип формы, что chat/progression уже передают в контекст —
// не завязан на схему БД, поэтому его можно передать напрямую с клиента.
export type PlanInput = { title: string; type: string } | null;

export type AiCoachContextData = {
  date: string;
  ready?: boolean;
  plan?: PlanInput;
  profile?: ProfileRow;
  measurements?: MeasurementRow[];
  foodLogs?: FoodLogRow[];
  workouts?: WorkoutRow[];
  wellnessLogs?: WellnessRow[];
  activity?: ActivityRow[];
  moodLogs?: MoodRow[];
  personalRecords?: PersonalRecordRow[];
  programStages?: ProgramStageRow[];
  lastPhotoDate?: string | null;
  // AI Sprint 6 — уже готовые детерминированные вехи (автоматические + ручные),
  // не сырые таблицы. Coach только читает этот список, ничего не пересчитывает.
  milestones?: Milestone[];
};

export type LoadAiCoachContextDataOptions = {
  date: string;
  plan?: PlanInput;
  // Календарное окно в ДНЯХ (не число строк) для measurements/foodLogs/activity/
  // moodLogs/wellnessLogs — от (date - (historyDays-1)) до date включительно.
  // Несколько записей за один день не сокращают охваченный период, потому что
  // окно определяется датами, а не LIMIT. 0 — явно отключает эти массивы (пустые []).
  historyDays?: number;
  // Отдельный safety-limit на число строк ВНУТРИ календарного окна — защита от
  // патологического объёма (сотни записей в один день), а не замена окна датами.
  historyRowsLimit?: number;
  workoutsLimit?: number;
  // Верхняя граница числа личных рекордов (по одному на упражнение), не окно истории.
  personalRecordsLimit?: number;
};

const DEFAULT_HISTORY_DAYS = 60;
const DEFAULT_HISTORY_ROWS_LIMIT = 1000;
const DEFAULT_WORKOUTS_LIMIT = 20;
const DEFAULT_PERSONAL_RECORDS_LIMIT = 50;

// Первый день окна в 'YYYY-MM-DD', UTC-полночь — не зависит от Date.now(), локали
// или текущей таймзоны (тот же принцип, что lib/stats.ts daysBetween). При
// некорректном anchor (Date.parse даёt NaN) не бросает исключение — возвращает
// anchor как есть, что вырождает окно в один день вместо падения загрузчика.
function calendarWindowStart(anchor: string, days: number): string {
  const anchorMs = Date.parse(`${anchor}T00:00:00Z`);
  if (!Number.isFinite(anchorMs)) return anchor;
  const startMs = anchorMs - Math.max(0, days - 1) * 86400000;
  return new Date(startMs).toISOString().slice(0, 10);
}

export function loadAiCoachContextData(db: Database.Database, options: LoadAiCoachContextDataOptions): AiCoachContextData {
  const { date } = options;
  const historyDays = options.historyDays ?? DEFAULT_HISTORY_DAYS;
  const historyRowsLimit = options.historyRowsLimit ?? DEFAULT_HISTORY_ROWS_LIMIT;
  const workoutsLimit = options.workoutsLimit ?? DEFAULT_WORKOUTS_LIMIT;
  const personalRecordsLimit = options.personalRecordsLimit ?? DEFAULT_PERSONAL_RECORDS_LIMIT;

  const profile = (db.prepare(
    "SELECT name,height,start_weight startWeight,target_weight targetWeight,program_start programStart FROM profile WHERE id=1",
  ).get() ?? null) as ProfileRow;

  const windowStart = historyDays > 0 ? calendarWindowStart(date, historyDays) : null;

  const measurements = windowStart == null ? [] : db.prepare(
    "SELECT date,weight FROM measurements WHERE date>=? AND date<=? ORDER BY date DESC LIMIT ?",
  ).all(windowStart, date, historyRowsLimit) as MeasurementRow[];

  const foodLogs = windowStart == null ? [] : db.prepare(
    "SELECT date,calories,protein FROM food_logs WHERE date>=? AND date<=? ORDER BY date DESC LIMIT ?",
  ).all(windowStart, date, historyRowsLimit) as FoodLogRow[];

  const workouts = db.prepare(
    "SELECT date,type,title,effort,pain_after painAfter FROM workout_logs WHERE date<=? ORDER BY date DESC,id DESC LIMIT ?",
  ).all(date, workoutsLimit) as WorkoutRow[];

  // Полное окно истории, а не только сегодняшний день — lib/coach.ts считает
  // recentPainDays по последним 7 дням wellness и раньше получал 0 всегда, потому
  // что chat/MCP передавали только одну строку за текущую дату.
  const wellnessLogs = windowStart == null ? [] : db.prepare(
    "SELECT date,energy,pain,pain_area painArea,note FROM wellness_logs WHERE date>=? AND date<=? ORDER BY date DESC LIMIT ?",
  ).all(windowStart, date, historyRowsLimit) as WellnessRow[];

  const activity = windowStart == null ? [] : db.prepare(
    "SELECT date,steps,active_minutes activeMinutes,calories,beers,sleep_hours sleepHours,work_end_time workEndTime,first_drink_time firstDrinkTime,dinner,walk,water_liters waterLiters FROM daily_activity WHERE date>=? AND date<=? ORDER BY date DESC LIMIT ?",
  ).all(windowStart, date, historyRowsLimit) as ActivityRow[];

  const moodLogs = windowStart == null ? [] : db.prepare(
    "SELECT date,mood,note FROM mood_logs WHERE date>=? AND date<=? ORDER BY date DESC,id DESC LIMIT ?",
  ).all(windowStart, date, historyRowsLimit) as MoodRow[];

  const personalRecords = personalRecordsLimit > 0 ? loadPersonalRecords(db, date, personalRecordsLimit) : [];

  // Небольшой пользовательский журнал (сотни строк максимум за годы использования) —
  // всё равно ограничен явным LIMIT, а не читается «сколько бы ни было».
  const programStages = db.prepare(
    "SELECT id,kind,title,start_date startDate,end_date endDate,note,goal FROM program_stages ORDER BY start_date ASC,id ASC LIMIT 500",
  ).all() as ProgramStageRow[];

  // Только факт и дата — файл фото сюда не попадает и не должен.
  const lastPhoto = db.prepare(
    "SELECT date FROM photos WHERE date<=? ORDER BY date DESC,id DESC LIMIT 1",
  ).get(date) as { date: string } | undefined;

  const milestones = loadMilestonesForContext(db, date, programStages);

  return {
    date,
    ready: true,
    plan: options.plan ?? null,
    profile,
    measurements,
    foodLogs,
    workouts,
    wellnessLogs,
    activity,
    moodLogs,
    personalRecords,
    programStages,
    lastPhotoDate: lastPhoto?.date ?? null,
    milestones,
  };
}

// AI Sprint 6 — вехи для Coach. lib/milestones.ts (buildAutomaticMilestones)
// не изменён — только вызывается здесь с ПОЛНОЙ историей (не windowStart-окном
// остальных полей выше): окно в 60 дней обрезало бы более старые личные рекорды
// и минимумы веса, из-за чего они ложно показались бы "новыми". Объём данных
// одного пользователя мал (сотни/тысячи строк за годы), поэтому широкий LIMIT —
// подстраховка от патологии, а не реальное окно.
const MILESTONES_ROWS_LIMIT = 5000;

function loadMilestonesForContext(db: Database.Database, date: string, programStages: ProgramStageRow[]): Milestone[] {
  const workouts = db.prepare(
    "SELECT id,date FROM workout_logs WHERE date<=? ORDER BY date ASC,id ASC LIMIT ?",
  ).all(date, MILESTONES_ROWS_LIMIT) as { id: number; date: string }[];
  const strengthLogs = db.prepare(
    "SELECT id,date,exercise,weight FROM strength_logs WHERE date<=? ORDER BY date ASC,id ASC LIMIT ?",
  ).all(date, MILESTONES_ROWS_LIMIT) as { id: number; date: string; exercise: string; weight: number }[];
  const allMeasurements = db.prepare(
    "SELECT id,date,weight FROM measurements WHERE date<=? ORDER BY date ASC,id ASC LIMIT ?",
  ).all(date, MILESTONES_ROWS_LIMIT) as { id: number; date: string; weight: number | null }[];
  // Только id+date — то же ограничение, что и lastPhotoDate выше (никогда filename/content_type).
  const photos = db.prepare(
    "SELECT id,date FROM photos WHERE date<=? ORDER BY date ASC,id ASC LIMIT ?",
  ).all(date, MILESTONES_ROWS_LIMIT) as { id: number; date: string }[];

  const automatic = buildAutomaticMilestones({
    workouts, strengthLogs, measurements: allMeasurements,
    programStages: programStages.map(s => ({ id: s.id, title: s.title, endDate: s.endDate })),
    photos, anchor: date,
  });

  // Ручные вехи — только безопасные поля таблицы milestones (не sourceIds, их и
  // нет у ручных вех; note остаётся как есть — toLlmSafeMilestone в lib/ai-context.ts
  // обрежет длину при формировании LLM-проекции).
  const manualRows = db.prepare(
    "SELECT id,occurred_at occurredAt,title,note,category FROM milestones WHERE occurred_at<=? ORDER BY occurred_at ASC,id ASC LIMIT ?",
  ).all(date, MILESTONES_ROWS_LIMIT) as { id: number; occurredAt: string; title: string; note: string; category: Milestone["category"] }[];
  const manual: Milestone[] = manualRows.map(r => ({
    id: `manual-${r.id}`, kind: "manual", occurredAt: r.occurredAt, title: r.title, summary: r.note,
    sourceIds: [`milestone:${r.id}`], sourceRevision: "manual", automatic: false, category: r.category,
  }));

  return [...automatic, ...manual].sort((a, b) => (a.occurredAt === b.occurredAt ? a.id.localeCompare(b.id) : a.occurredAt.localeCompare(b.occurredAt)));
}

// Лучший вес по каждому упражнению за ВСЮ историю до анкорной даты — вычисляется
// агрегированным SQL, а не из ограниченного окна последних строк strength_logs
// (иначе старый настоящий рекорд может «потеряться» за более новыми записями).
// При равном максимальном весе выбирается самая ранняя дата его достижения —
// та же семантика тай-брейка, что app/training-analytics-model.ts computeStrengthRecords
// (sorted ascending by date, keep first occurrence of the running max).
function loadPersonalRecords(db: Database.Database, date: string, limit: number): PersonalRecordRow[] {
  const rows = db.prepare(`
    WITH best AS (
      SELECT exercise, MAX(weight) AS weight, COUNT(*) AS cnt
      FROM strength_logs
      WHERE date<=?
      GROUP BY exercise
    )
    SELECT
      b.exercise AS exercise,
      b.weight AS weight,
      b.cnt AS cnt,
      (
        SELECT sl.reps FROM strength_logs sl
        WHERE sl.exercise=b.exercise AND sl.weight=b.weight AND sl.date<=?
        ORDER BY sl.date ASC, sl.id ASC LIMIT 1
      ) AS reps,
      (
        SELECT sl.date FROM strength_logs sl
        WHERE sl.exercise=b.exercise AND sl.weight=b.weight AND sl.date<=?
        ORDER BY sl.date ASC, sl.id ASC LIMIT 1
      ) AS date
    FROM best b
    ORDER BY b.weight DESC
    LIMIT ?
  `).all(date, date, date, limit) as { exercise: string; weight: number; cnt: number; reps: number; date: string }[];
  return rows.map((r) => ({ exercise: r.exercise, weight: r.weight, reps: r.reps, date: r.date, isRecord: r.cnt > 1 }));
}

// Настоящая календарная дата, а не только похожая на ISO строка: отсекает
// невозможные месяц/день (например "2026-13-01" или "2026-02-30") и корректно
// учитывает високосные годы через собственный календарь Date.UTC.
function isValidIsoDate(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

// Этап 6: выбор актуального этапа программы для даты.
// Политика: фактическая запись program_stages, покрывающая дату, имеет приоритет
// над статичным планом (app/personal-data.ts). Статичный план — fallback для дат
// до первой записи, в «зазорах» между этапами и когда записей нет вовсе.
//
// Пересечения/неоднозначность (несколько записей покрывают одну дату) — записи
// не защищены уникальным ограничением в БД на уровне схемы, только валидацией
// формы (start_date<=end_date) в lib/program-stages.ts. Детерминированный
// тай-брейк: этап с более поздней start_date считается более актуальным решением
// пользователя (он либо создан позже, либо намеренно переопределяет более старый
// диапазон); при равенстве start_date — более поздний id (создан позже).
// Некорректные записи (не прошедшие проверку реальной календарной даты, включая
// невозможные месяц/день и високосные годы) отбрасываются — они не должны
// приводить к выдуманному этапу, а не сравниваются наравне с валидными. Если сама
// anchor-дата некорректна, функция не выбирает этап по строковому сравнению —
// сразу возвращает null (безопасный fallback на статичный план).
export function selectActiveProgramStage(stages: ProgramStageRow[], date: string): ProgramStageRow | null {
  if (!isValidIsoDate(date)) return null;
  const valid = stages.filter(
    (s) => s && isValidIsoDate(s.startDate) && (s.endDate == null || (isValidIsoDate(s.endDate) && s.endDate >= s.startDate)),
  );
  const covering = valid.filter((s) => s.startDate <= date && (s.endDate == null || s.endDate >= date));
  if (!covering.length) return null;
  return [...covering].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id)[0];
}
