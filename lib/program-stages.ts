// Sprint 7 — этапы программы: пользовательский журнал реальных периодов (старт,
// домашний этап, бассейн, зал, свой этап), отдельный от статичного плана-расписания
// (app/personal-data.ts, phases). Чистая метадата поверх program_stages — не трогает
// workout_logs/measurements, поэтому редактирование этапа не переписывает историю.
import { db } from "@/lib/db";

const KINDS = ["start", "home", "pool", "gym", "custom"] as const;
export type StageKind = typeof KINDS[number];

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const text = (x: any, max = 400) => typeof x === "string" ? x.trim().slice(0, max) : "";

export type ActionResult = { ok: true } | { ok: false; error: string; status: number };

function validate(b: any): { kind: StageKind; title: string; startDate: string; endDate: string | null; note: string; goal: string } | null {
 if (!KINDS.includes(b.kind)) return null;
 const title = text(b.title, 80);
 if (!title || !dateOk(b.startDate)) return null;
 const endDate = b.endDate == null || b.endDate === "" ? null : dateOk(b.endDate) ? b.endDate : undefined;
 if (endDate === undefined) return null;
 if (endDate !== null && endDate < b.startDate) return null;
 return { kind: b.kind, title, startDate: b.startDate, endDate, note: text(b.note, 300), goal: text(b.goal, 200) };
}

export function createStage(b: any): ActionResult {
 const parsed = validate(b);
 if (!parsed) return { ok: false, error: "Проверьте данные этапа", status: 400 };
 db.prepare("INSERT INTO program_stages (kind,title,start_date,end_date,note,goal) VALUES (?,?,?,?,?,?)")
  .run(parsed.kind, parsed.title, parsed.startDate, parsed.endDate, parsed.note, parsed.goal);
 return { ok: true };
}

export function updateStage(b: any): ActionResult {
 const id = Number(b.id);
 if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: "Некорректный этап", status: 400 };
 const parsed = validate(b);
 if (!parsed) return { ok: false, error: "Проверьте данные этапа", status: 400 };
 const result = db.prepare("UPDATE program_stages SET kind=?,title=?,start_date=?,end_date=?,note=?,goal=? WHERE id=?")
  .run(parsed.kind, parsed.title, parsed.startDate, parsed.endDate, parsed.note, parsed.goal, id);
 if (!result.changes) return { ok: false, error: "Этап не найден", status: 404 };
 return { ok: true };
}

export function deleteStage(b: any): ActionResult {
 const id = Number(b.id);
 if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: "Некорректный этап", status: 400 };
 const result = db.prepare("DELETE FROM program_stages WHERE id=?").run(id);
 if (!result.changes) return { ok: false, error: "Этап не найден", status: 404 };
 return { ok: true };
}
