// Технический спринт — первый доменный модуль, выделенный из app/api/fitness/route.ts.
// Тренировка, силовые логи и предложения прогрессии сохраняются одной атомарной
// транзакцией; strength_logs всегда связаны с workout_logs через workout_id.

import { db } from "@/lib/db";
import { buildCoachSummary, decideCoach, type CoachAction } from "@/lib/coach";
import { buildExerciseProgression, shouldSuppressRepeat, type ProgressionAction, type ProgressionStatus } from "@/lib/progression-engine";
import { targetMaxRepsFor } from "@/app/exercise-catalog";

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const num = (x: any, min = 0, max = 100000) => { const n = Number(x); return Number.isFinite(n) && n >= min && n <= max ? n : null };
const text = (x: any, max = 120) => typeof x === "string" ? x.trim().slice(0, max) : "";

export type ActionResult = { ok: true; workoutId?: number } | { ok: false; error: string; status: number };

// AI-9 доработка — происхождение фактического результата по упражнению/подходу.
// "imported_metric" сюда не входит: это происхождение относится только к
// весу/повторам/факту выполнения, а метрики тренировки (пульс/калории/
// длительность) имеют собственное происхождение — см. metricsSource ниже.
export const WORKOUT_DETAIL_SOURCES = ["confirmed_as_planned","confirmed_as_previous","manually_edited","skipped","added"] as const;
export type WorkoutDetailSource = typeof WORKOUT_DETAIL_SOURCES[number];
// Записи, сохранённые до этого спринта, не содержат source вовсе — читаем их
// как "unknown", не приписывая задним числом происхождение, которого не было.
export type WorkoutDetailSourceOrUnknown = WorkoutDetailSource | "unknown";

export const METRICS_SOURCES = ["manual","imported_metric"] as const;
export type MetricsSource = typeof METRICS_SOURCES[number];

type WorkoutDetail = { key: string; name: string; originalName: string; value: number; weight: number; difficulty: string; unit: string; skipped:boolean; added:boolean; source:WorkoutDetailSourceOrUnknown };
type StrengthGroup = { weight: number; reps: number; difficulty: string };

// Записи без валидного source — это либо тренировки, сохранённые до этого
// спринта, либо строки, отредактированные через общую форму истории (которая
// не различает происхождение). Не приписываем им задним числом
// "confirmed_as_planned" — честно помечаем как "unknown".
function normalizeDetailSource(x:any):WorkoutDetailSourceOrUnknown{
 if((WORKOUT_DETAIL_SOURCES as readonly string[]).includes(x?.source))return x.source;
 if(x?.skipped===true)return "skipped";
 if(x?.added===true)return "added";
 return "unknown";
}

function parseDetails(raw: any): WorkoutDetail[] {
 return Array.isArray(raw) ? raw.slice(0, 200).map((x: any) => ({
  key: text(x.key, 40), name: text(x.name, 120), originalName: text(x.originalName, 120) || text(x.name, 120),
  value: num(x.value, 0, 100000) || 0, weight: num(x.weight, 0, 500) || 0,
  difficulty: ["Легко", "Нормально", "Тяжело", "Боль"].includes(x.difficulty) ? x.difficulty : "Нормально",
  unit: x.unit === "сек" ? "сек" : x.unit === "мин" ? "мин" : "повт.",
  skipped:x.skipped===true,added:x.added===true,
  source: normalizeDetailSource(x),
 })) : [];
}

function groupStrengthDetails(details: WorkoutDetail[]): Map<string, StrengthGroup> {
 const grouped = new Map<string, StrengthGroup>();
 const difficultyRank: Record<string, number> = { Легко: 0, Нормально: 1, Тяжело: 2, Боль: 3 };
 for (const item of details) {
  if(item.skipped)continue;
  const current = grouped.get(item.originalName);
  if (!current) grouped.set(item.originalName, { weight: item.weight, reps: item.value, difficulty: item.difficulty });
  else {
   current.weight = Math.max(current.weight, item.weight);
   current.reps = Math.max(current.reps, item.value);
   if (difficultyRank[item.difficulty] > difficultyRank[current.difficulty]) current.difficulty = item.difficulty;
  }
 }
 return grouped;
}

// Sprint 6.12 — коуч-решение на дату уже сохранённой тренировки, для проверки,
// не щадящее ли оно (reduce/replace/rest блокируют увеличение нагрузки).
function computeCoachActionForDate(date: string, plan: { title: string; type: string }): CoachAction | null {
 const profile = db.prepare("SELECT name,height,start_weight startWeight,target_weight targetWeight FROM profile WHERE id=1").get() as any;
 const measurements = db.prepare("SELECT date,weight FROM measurements WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
 const foodLogs = db.prepare("SELECT date,calories,protein,fat,carbs FROM food_logs WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
 const workouts = db.prepare("SELECT date,type,title,effort,pain_after painAfter FROM workout_logs WHERE date<=? ORDER BY date DESC,id DESC LIMIT 20").all(date) as any[];
 const wellnessRow = db.prepare("SELECT energy,pain,pain_area painArea FROM wellness_logs WHERE date=?").get(date) as any;
 const activityRow = db.prepare("SELECT steps,active_minutes activeMinutes,sleep_hours sleepHours FROM daily_activity WHERE date=?").get(date) as any;
 const summary = buildCoachSummary({
  date, plan, profile, measurements, foodLogs, workouts,
  wellnessLogs: wellnessRow ? [{ date, ...wellnessRow }] : [],
  activity: activityRow ? [{ date, ...activityRow }] : [],
 });
 return decideCoach(summary)?.action ?? null;
}

type ProgressionDecisionRow = {
 status: ProgressionStatus; action: ProgressionAction; reasonCode: string;
 fromWeight: number; fromReps: number; toWeight: number; toReps: number;
};

// Строит и сохраняет предложения прогрессии по каждому силовому упражнению только что
// сохранённой тренировки. Само предложение считается детерминированно в
// lib/progression-engine.ts; здесь — только сборка входных данных и запись в БД.
// Вызывается внутри той же транзакции, что и сохранение тренировки (см. saveWorkout).
function generateProgressionProposals(params: {
 workoutId: number; date: string; plan: { title: string; type: string };
 painAfter: number; effort: string; workoutComplete: boolean;
 exercises: Map<string, StrengthGroup>;
}) {
 const coachAction = computeCoachActionForDate(params.date, params.plan);
 const insertDecision = db.prepare(`INSERT INTO progression_decisions
  (workout_id,exercise,action,reason_code,reason,used_signals,limited_data,from_weight,from_reps,to_weight,to_reps,pain_after,effort,workout_complete,coach_action,target_max_reps,status)
  VALUES (@workoutId,@exercise,@action,@reasonCode,@reason,@usedSignals,@limitedData,@fromWeight,@fromReps,@toWeight,@toReps,@painAfter,@effort,@workoutComplete,@coachAction,@targetMaxReps,'pending')`);
 for (const exercise of params.exercises.keys()) {
  const history = db.prepare("SELECT date,weight,reps,difficulty FROM strength_logs WHERE exercise=? ORDER BY date DESC,id DESC LIMIT 10").all(exercise) as { date: string; weight: number; reps: number; difficulty: string }[];
  const targetMaxReps = targetMaxRepsFor(exercise);
  const proposal = buildExerciseProgression({
   exercise, painAfter: params.painAfter, effort: params.effort, workoutComplete: params.workoutComplete,
   coachAction, history, targetMaxReps,
  });
  if (proposal.action === "no-change") continue;
  const previous = db.prepare("SELECT status,action,reason_code reasonCode,from_weight fromWeight,from_reps fromReps,to_weight toWeight,to_reps toReps FROM progression_decisions WHERE exercise=? ORDER BY id DESC LIMIT 1").get(exercise) as ProgressionDecisionRow | undefined;
  const previousDecision = previous ? {
   status: previous.status, action: previous.action, reasonCode: previous.reasonCode,
   from: { weight: previous.fromWeight, reps: previous.fromReps }, to: { weight: previous.toWeight, reps: previous.toReps },
  } : null;
  if (shouldSuppressRepeat(previousDecision, proposal)) continue;
  insertDecision.run({
   workoutId: params.workoutId, exercise, action: proposal.action, reasonCode: proposal.reasonCode, reason: proposal.reason,
   usedSignals: JSON.stringify(proposal.usedSignals), limitedData: proposal.limitedData ? 1 : 0,
   fromWeight: proposal.from.weight, fromReps: proposal.from.reps, toWeight: proposal.to.weight, toReps: proposal.to.reps,
   painAfter: params.painAfter, effort: params.effort, workoutComplete: params.workoutComplete ? 1 : 0,
   coachAction: coachAction || "", targetMaxReps: targetMaxReps,
  });
 }
}

export function saveWorkout(b: any): ActionResult {
 const duration = num(b.durationSeconds, 0, 86400), rest = num(b.restSeconds, 0, 86400), minHr = num(b.minHeartRate, 0, 250), avgHr = num(b.avgHeartRate, 0, 250), maxHr = num(b.maxHeartRate, 0, 250), calories = num(b.calories, 0, 10000), distance = num(b.distanceMeters, 0, 1000000), speed = num(b.avgSpeed, 0, 200), details = parseDetails(b.details);
 if (!dateOk(b.date) || !text(b.title) || !Array.isArray(b.completed) || duration === null || rest === null) return { ok: false, error: "Некорректная тренировка", status: 400 };
 const workoutType = text(b.type, 40), painAfter = num(b.painAfter, 0, 10) || 0, effort = ["Легко", "Нормально", "Тяжело", "Боль"].includes(b.effort) ? b.effort : "";
 const metricsSource:MetricsSource = (METRICS_SOURCES as readonly string[]).includes(b.metricsSource) ? b.metricsSource : "manual";
 const notes = text(b.notes, 600);
 let workoutId=0;
 db.transaction(() => {
  const workout = db.prepare("INSERT INTO workout_logs (date,type,title,completed,rounds,duration_seconds,rest_seconds,details) VALUES (?,?,?,?,?,?,?,?)").run(b.date, workoutType, text(b.title), JSON.stringify(b.completed.slice(0, 200)), num(b.rounds, 1, 20) || 1, duration, rest, JSON.stringify(details));
  workoutId = Number(workout.lastInsertRowid);
  db.prepare("UPDATE workout_logs SET min_heart_rate=?,avg_heart_rate=?,max_heart_rate=?,calories=?,distance_meters=?,avg_speed=?,effort=?,pain_after=?,metrics_source=?,notes=? WHERE id=?").run(minHr || 0, avgHr || 0, maxHr || 0, calories || 0, distance || 0, speed || 0, effort, painAfter, metricsSource, notes, workoutId);
  if (workoutType === "Силовая") {
   const grouped = groupStrengthDetails(details);
   const insert = db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps,difficulty,workout_id) VALUES (?,?,?,?,?,?)");
   for (const [exercise, item] of grouped) insert.run(b.date, exercise, item.weight, item.reps, item.difficulty, workoutId);
   generateProgressionProposals({
    workoutId, date: b.date, plan: { title: text(b.title), type: workoutType },
    painAfter, effort, workoutComplete: !details.some(item=>item.skipped),
    exercises: grouped,
   });
  }
 })();
 return { ok: true, workoutId };
}

function parseJsonArray(raw: any): any[] {
 try { const value = JSON.parse(raw); return Array.isArray(value) ? value : [] } catch { return [] }
}

// Удаляет progression_decisions, посчитанные для прежней версии тренировки, и
// exercise_load_overrides, созданные из этих решений (у override нет FK на decision,
// поэтому порядок важен: сперва overrides, потом decisions). Используется и при
// редактировании (updateWorkout), и при удалении (deleteWorkout) тренировки.
function purgeProgressionForWorkout(workoutId: number) {
 const staleIds = (db.prepare("SELECT id FROM progression_decisions WHERE workout_id=?").all(workoutId) as { id: number }[]).map(r => r.id);
 if (!staleIds.length) return;
 const placeholders = staleIds.map(() => "?").join(",");
 db.prepare(`DELETE FROM exercise_load_overrides WHERE source_decision_id IN (${placeholders})`).run(...staleIds);
 db.prepare(`DELETE FROM progression_decisions WHERE id IN (${placeholders})`).run(...staleIds);
}

export function updateWorkout(b: any): ActionResult {
 const id = Number(b.id), duration = num(b.durationSeconds, 0, 86400), rest = num(b.restSeconds, 0, 86400), rounds = num(b.rounds, 1, 20), minHr = num(b.minHeartRate, 0, 250), avgHr = num(b.avgHeartRate, 0, 250), maxHr = num(b.maxHeartRate, 0, 250), calories = num(b.calories, 0, 10000), distance = num(b.distanceMeters, 0, 1000000), speed = num(b.avgSpeed, 0, 200), details = parseDetails(b.details);
 if (!Number.isSafeInteger(id) || id < 1 || !dateOk(b.date) || !text(b.title) || duration === null || rest === null || rounds === null) return { ok: false, error: "Некорректные данные тренировки", status: 400 };
 const workoutType = text(b.type, 40);
 let changed = 0;
 db.transaction(() => {
  const result = db.prepare("UPDATE workout_logs SET date=?,type=?,title=?,rounds=?,duration_seconds=?,rest_seconds=?,details=?,min_heart_rate=?,avg_heart_rate=?,max_heart_rate=?,calories=?,distance_meters=?,avg_speed=? WHERE id=?").run(b.date, workoutType, text(b.title), rounds, duration, rest, JSON.stringify(details), minHr || 0, avgHr || 0, maxHr || 0, calories || 0, distance || 0, speed || 0, id);
  changed = result.changes;
  if (!changed) return;
  // Силовые логи пересобираются заново из отредактированных данных, чтобы не
  // расходиться с ними (были не связаны с тренировкой вовсе до этого спринта).
  db.prepare("DELETE FROM strength_logs WHERE workout_id=?").run(id);
  // Предложения прогрессии, посчитанные для старой версии тренировки, больше не
  // отражают отредактированные данные — удаляем их и пересчитываем заново ниже.
  purgeProgressionForWorkout(id);
  if (workoutType === "Силовая") {
   const grouped = groupStrengthDetails(details);
   const insert = db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps,difficulty,workout_id) VALUES (?,?,?,?,?,?)");
   for (const [exercise, item] of grouped) insert.run(b.date, exercise, item.weight, item.reps, item.difficulty, id);
   // completed/effort/painAfter не редактируются формой UI — берём исходные
   // сохранённые значения тренировки, а не подставляем пустые/нулевые.
   const existing = db.prepare("SELECT completed,effort,pain_after painAfter FROM workout_logs WHERE id=?").get(id) as { completed: string; effort: string; painAfter: number };
   generateProgressionProposals({
    workoutId: id, date: b.date, plan: { title: text(b.title), type: workoutType },
    painAfter: existing.painAfter, effort: existing.effort, workoutComplete: parseJsonArray(existing.completed).length >= details.length,
    exercises: grouped,
   });
  }
 })();
 if (!changed) return { ok: false, error: "Тренировка не найдена", status: 404 };
 return { ok: true };
}

export function deleteWorkout(b: any): ActionResult {
 const id = Number(b.id);
 if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: "Некорректная тренировка", status: 400 };
 let changed = 0;
 db.transaction(() => {
  purgeProgressionForWorkout(id);
  db.prepare("DELETE FROM strength_logs WHERE workout_id=?").run(id);
  const result = db.prepare("DELETE FROM workout_logs WHERE id=?").run(id);
  changed = result.changes;
 })();
 if (!changed) return { ok: false, error: "Тренировка не найдена", status: 404 };
 return { ok: true };
}

export function insertStrengthLog(b: any): ActionResult {
 const weight = num(b.weight, 0, 500), reps = num(b.reps, 0, 200), difficulty = ["Легко", "Нормально", "Тяжело", "Боль"].includes(b.difficulty) ? b.difficulty : "Нормально";
 if (!dateOk(b.date) || !text(b.exercise) || weight === null) return { ok: false, error: "Укажите дату, упражнение и вес", status: 400 };
 db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps,difficulty) VALUES (?,?,?,?,?)").run(b.date, text(b.exercise, 120), weight, reps || 0, difficulty);
 return { ok: true };
}

export function deleteStrengthLog(b: any): ActionResult {
 const id = Number(b.id);
 if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: "Некорректная запись", status: 400 };
 db.prepare("DELETE FROM strength_logs WHERE id=?").run(id);
 return { ok: true };
}
