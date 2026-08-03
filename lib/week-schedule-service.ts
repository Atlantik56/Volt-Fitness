// AI-11 — Гибкая неделя. Серверный слой над week_schedule_changes: валидация
// правил (только текущая неделя, не трогать выполненные дни и активные
// черновики) и идемпотентное применение изменений. Сама программа
// (app/personal-data.ts) не меняется — здесь только дельта поверх неё.

import { db } from "@/lib/db";
import {
  isoWeekdayOf, weekRangeContaining, isDateInRange, WEEK_SCHEDULE_REASON_CODES,
  type WeekScheduleChange, type WeekScheduleAction, type WeekScheduleReasonCode,
} from "@/app/week-schedule-model";

export type ActionResult = { ok: true } | { ok: false; error: string; status: number };

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const isValidReason = (x: any): x is WeekScheduleReasonCode => x === "" || (WEEK_SCHEDULE_REASON_CODES as readonly string[]).includes(x);
const isValidSourceDay = (x: any): x is number => Number.isInteger(x) && x >= 1 && x <= 7;

function rowToChange(row: any): WeekScheduleChange {
  return {
    id: row.id, date: row.date, action: row.action,
    assignedSourceDay: row.assignedSourceDay ?? null,
    swapWithDate: row.swapWithDate ?? null,
    reasonCode: row.reasonCode ?? "",
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

const selectChanges = `SELECT id,date,action,assigned_source_day assignedSourceDay,swap_with_date swapWithDate,reason_code reasonCode,created_at createdAt,updated_at updatedAt FROM week_schedule_changes`;

export function listWeekScheduleChanges(mondayIso: string, sundayIso: string): WeekScheduleChange[] {
  return (db.prepare(`${selectChanges} WHERE date BETWEEN ? AND ? ORDER BY date ASC`).all(mondayIso, sundayIso) as any[]).map(rowToChange);
}

function hasCompletedWorkout(date: string): boolean {
  return !!db.prepare("SELECT 1 FROM workout_logs WHERE date=? LIMIT 1").get(date);
}
function hasOpenDraft(date: string): boolean {
  return !!db.prepare("SELECT 1 FROM workout_drafts WHERE date=? AND status IN ('planned','active','awaiting_confirmation') LIMIT 1").get(date);
}

// Возвращает текст ошибки, если дату сейчас редактировать нельзя, иначе null.
function editabilityError(date: string, todayIso: string): string | null {
  const { mondayIso, sundayIso } = weekRangeContaining(todayIso);
  if (!isDateInRange(date, mondayIso, sundayIso)) return "Редактировать можно только текущую календарную неделю";
  if (hasCompletedWorkout(date)) return "Эта тренировка уже выполнена — изменить план на этот день нельзя";
  if (hasOpenDraft(date)) return "На этот день есть незавершённый черновик тренировки — сначала продолжите или отмените его";
  return null;
}

// Разрывает существующий обмен, если дата раньше была одной из его сторон:
// партнёр возвращается к своему исходному плану, а не остаётся с "битой" ссылкой.
function breakExistingSwapPairing(date: string) {
  const row = db.prepare("SELECT action,swap_with_date swapWithDate FROM week_schedule_changes WHERE date=?").get(date) as any;
  if (row?.action === "swap" && row.swapWithDate) db.prepare("DELETE FROM week_schedule_changes WHERE date=?").run(row.swapWithDate);
}

const upsertChange = db.prepare(`INSERT INTO week_schedule_changes(date,action,assigned_source_day,swap_with_date,reason_code)
 VALUES(@date,@action,@assignedSourceDay,@swapWithDate,@reasonCode)
 ON CONFLICT(date) DO UPDATE SET action=excluded.action,assigned_source_day=excluded.assigned_source_day,
  swap_with_date=excluded.swap_with_date,reason_code=excluded.reason_code,updated_at=CURRENT_TIMESTAMP`);

export function applyReplace(params: { date: string; assignedSourceDay: number; reasonCode?: string; todayIso: string }): ActionResult {
  if (!dateOk(params.date) || !dateOk(params.todayIso)) return { ok: false, error: "Некорректная дата", status: 400 };
  if (!isValidSourceDay(params.assignedSourceDay)) return { ok: false, error: "Некорректная тренировка для замены", status: 400 };
  const reasonCode = params.reasonCode ?? "";
  if (!isValidReason(reasonCode)) return { ok: false, error: "Некорректная причина", status: 400 };
  const error = editabilityError(params.date, params.todayIso);
  if (error) return { ok: false, error, status: 409 };
  db.transaction(() => {
    breakExistingSwapPairing(params.date);
    upsertChange.run({ date: params.date, action: "replace" as WeekScheduleAction, assignedSourceDay: params.assignedSourceDay, swapWithDate: null, reasonCode });
  })();
  return { ok: true };
}

export function applyRest(params: { date: string; reasonCode?: string; todayIso: string }): ActionResult {
  if (!dateOk(params.date) || !dateOk(params.todayIso)) return { ok: false, error: "Некорректная дата", status: 400 };
  const reasonCode = params.reasonCode ?? "";
  if (!isValidReason(reasonCode)) return { ok: false, error: "Некорректная причина", status: 400 };
  const error = editabilityError(params.date, params.todayIso);
  if (error) return { ok: false, error, status: 409 };
  db.transaction(() => {
    breakExistingSwapPairing(params.date);
    upsertChange.run({ date: params.date, action: "rest" as WeekScheduleAction, assignedSourceDay: null, swapWithDate: null, reasonCode });
  })();
  return { ok: true };
}

export function applySwap(params: { dateA: string; dateB: string; reasonCode?: string; todayIso: string }): ActionResult {
  if (!dateOk(params.dateA) || !dateOk(params.dateB) || !dateOk(params.todayIso)) return { ok: false, error: "Некорректная дата", status: 400 };
  if (params.dateA === params.dateB) return { ok: false, error: "Выберите два разных дня", status: 400 };
  const reasonCode = params.reasonCode ?? "";
  if (!isValidReason(reasonCode)) return { ok: false, error: "Некорректная причина", status: 400 };
  const errorA = editabilityError(params.dateA, params.todayIso);
  if (errorA) return { ok: false, error: errorA, status: 409 };
  const errorB = editabilityError(params.dateB, params.todayIso);
  if (errorB) return { ok: false, error: errorB, status: 409 };
  const weekdayA = isoWeekdayOf(params.dateA), weekdayB = isoWeekdayOf(params.dateB);
  db.transaction(() => {
    breakExistingSwapPairing(params.dateA);
    breakExistingSwapPairing(params.dateB);
    upsertChange.run({ date: params.dateA, action: "swap" as WeekScheduleAction, assignedSourceDay: weekdayB, swapWithDate: params.dateB, reasonCode });
    upsertChange.run({ date: params.dateB, action: "swap" as WeekScheduleAction, assignedSourceDay: weekdayA, swapWithDate: params.dateA, reasonCode });
  })();
  return { ok: true };
}

// Отмена одного изменения. Для обмена отменяет обе стороны сразу — иначе
// вторая дата осталась бы со ссылкой на партнёра, у которого изменения уже нет.
export function cancelChange(params: { date: string }): ActionResult {
  if (!dateOk(params.date)) return { ok: false, error: "Некорректная дата", status: 400 };
  db.transaction(() => {
    breakExistingSwapPairing(params.date);
    db.prepare("DELETE FROM week_schedule_changes WHERE date=?").run(params.date);
  })();
  return { ok: true };
}

// Возврат всей текущей недели к исходному плану. Не трогает workout_logs —
// уже выполненные тренировки остаются в истории как есть.
export function resetWeek(params: { todayIso: string }): ActionResult {
  if (!dateOk(params.todayIso)) return { ok: false, error: "Некорректная дата", status: 400 };
  const { mondayIso, sundayIso } = weekRangeContaining(params.todayIso);
  db.prepare("DELETE FROM week_schedule_changes WHERE date BETWEEN ? AND ?").run(mondayIso, sundayIso);
  return { ok: true };
}
