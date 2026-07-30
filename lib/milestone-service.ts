// AI-6 — CRUD ручных вех (docs/MILESTONES.md "Ручные вехи"). Только то, что
// невозможно восстановить из существующих источников: дата, заголовок, заметка,
// категория. Никакая автоматическая веха здесь не хранится — см. lib/milestones.ts.
import { db } from "@/lib/db";
import type { MilestoneCategory } from "@/lib/milestones";

const CATEGORIES = ["тело", "тренировки", "состояние", "этапы", "личное"] as const;
const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const text = (x: any, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

export type ActionResult = { ok: true } | { ok: false; error: string; status: number };

export type ManualMilestoneRow = { id: number; occurredAt: string; title: string; note: string; category: MilestoneCategory };

function validate(b: any): { occurredAt: string; title: string; note: string; category: MilestoneCategory } | null {
  if (!dateOk(b?.occurredAt)) return null;
  const title = text(b.title, 80);
  if (!title) return null;
  const category = CATEGORIES.includes(b.category) ? b.category : "личное";
  return { occurredAt: b.occurredAt, title, note: text(b.note, 300), category };
}

export function listManualMilestones(): ManualMilestoneRow[] {
  return db.prepare("SELECT id,occurred_at occurredAt,title,note,category FROM milestones ORDER BY occurred_at DESC, id DESC").all() as ManualMilestoneRow[];
}

export function createManualMilestone(b: any): ActionResult {
  const parsed = validate(b);
  if (!parsed) return { ok: false, error: "Укажите дату и заголовок вехи", status: 400 };
  db.prepare("INSERT INTO milestones (occurred_at,title,note,category) VALUES (?,?,?,?)")
    .run(parsed.occurredAt, parsed.title, parsed.note, parsed.category);
  return { ok: true };
}

export function updateManualMilestone(b: any): ActionResult {
  const id = Number(b?.id);
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: "Некорректная веха", status: 400 };
  const parsed = validate(b);
  if (!parsed) return { ok: false, error: "Укажите дату и заголовок вехи", status: 400 };
  const result = db.prepare("UPDATE milestones SET occurred_at=?,title=?,note=?,category=? WHERE id=?")
    .run(parsed.occurredAt, parsed.title, parsed.note, parsed.category, id);
  if (!result.changes) return { ok: false, error: "Веха не найдена", status: 404 };
  return { ok: true };
}

export function deleteManualMilestone(id: any): ActionResult {
  const parsedId = Number(id);
  if (!Number.isSafeInteger(parsedId) || parsedId < 1) return { ok: false, error: "Некорректная веха", status: 400 };
  const result = db.prepare("DELETE FROM milestones WHERE id=?").run(parsedId);
  if (!result.changes) return { ok: false, error: "Веха не найдена", status: 404 };
  return { ok: true };
}
