import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-week-schedule-"));
const { db } = await import("@/lib/db.ts");
const service = await import("@/lib/week-schedule-service.ts");

// Неделя 2026-06-01 (Пн) .. 2026-06-07 (Вс); "сегодня" сервиса — явный параметр,
// не системные часы, поэтому тест не зависит от реальной даты запуска.
const TODAY = "2026-06-01";
const MON = "2026-06-01", TUE = "2026-06-02", WED = "2026-06-03", SUN = "2026-06-07";
const NEXT_WEEK_MON = "2026-06-08";

function changesFor(mondayIso = MON, sundayIso = SUN) {
  return service.listWeekScheduleChanges(mondayIso, sundayIso);
}

test("замена сохраняется и читается обратно", () => {
  const result = service.applyReplace({ date: MON, assignedSourceDay: 2, reasonCode: "no_equipment", todayIso: TODAY });
  assert.equal(result.ok, true);
  const rows = changesFor();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, MON);
  assert.equal(rows[0].action, "replace");
  assert.equal(rows[0].assignedSourceDay, 2);
  assert.equal(rows[0].reasonCode, "no_equipment");
});

test("повторное применение того же изменения идемпотентно — без дублей", () => {
  service.applyReplace({ date: MON, assignedSourceDay: 2, reasonCode: "no_equipment", todayIso: TODAY });
  service.applyReplace({ date: MON, assignedSourceDay: 2, reasonCode: "no_equipment", todayIso: TODAY });
  const count = (db.prepare("SELECT COUNT(*) n FROM week_schedule_changes WHERE date=?").get(MON) as any).n;
  assert.equal(count, 1);
});

test("некорректная причина отклоняется", () => {
  const result = service.applyReplace({ date: TUE, assignedSourceDay: 1, reasonCode: "not-a-real-reason", todayIso: TODAY });
  assert.equal(result.ok, false);
});

test("обмен создаёт две симметричные записи без дублей при повторе", () => {
  const first = service.applySwap({ dateA: MON, dateB: WED, reasonCode: "schedule", todayIso: TODAY });
  assert.equal(first.ok, true);
  service.applySwap({ dateA: MON, dateB: WED, reasonCode: "schedule", todayIso: TODAY });
  const rows = changesFor();
  const forMon = rows.filter(r => r.date === MON), forWed = rows.filter(r => r.date === WED);
  assert.equal(forMon.length, 1);
  assert.equal(forWed.length, 1);
  assert.equal(forMon[0].swapWithDate, WED);
  assert.equal(forWed[0].swapWithDate, MON);
});

test("переназначение даты, ранее участвовавшей в обмене, освобождает партнёра", () => {
  service.applySwap({ dateA: MON, dateB: WED, reasonCode: "", todayIso: TODAY });
  // Теперь понедельник заменяется независимо — среда должна вернуться к своему исходному плану.
  const result = service.applyReplace({ date: MON, assignedSourceDay: 2, reasonCode: "", todayIso: TODAY });
  assert.equal(result.ok, true);
  const rows = changesFor();
  assert.equal(rows.find(r => r.date === WED), undefined);
  assert.equal(rows.find(r => r.date === MON)?.action, "replace");
});

test("отдых вместо тренировки", () => {
  const result = service.applyRest({ date: TUE, reasonCode: "pain", todayIso: TODAY });
  assert.equal(result.ok, true);
  const row = changesFor().find(r => r.date === TUE);
  assert.equal(row?.action, "rest");
  assert.equal(row?.assignedSourceDay, null);
});

test("отмена отдельного изменения удаляет только его", () => {
  service.applyReplace({ date: TUE, assignedSourceDay: 1, reasonCode: "", todayIso: TODAY });
  service.applyRest({ date: WED, reasonCode: "", todayIso: TODAY });
  service.cancelChange({ date: TUE });
  const rows = changesFor();
  assert.equal(rows.find(r => r.date === TUE), undefined);
  assert.ok(rows.find(r => r.date === WED));
});

test("отмена одной стороны обмена отменяет и вторую — без осиротевшей ссылки", () => {
  service.applySwap({ dateA: MON, dateB: WED, reasonCode: "", todayIso: TODAY });
  service.cancelChange({ date: MON });
  const rows = changesFor();
  assert.equal(rows.find(r => r.date === MON), undefined);
  assert.equal(rows.find(r => r.date === WED), undefined);
});

test("сброс недели удаляет все изменения текущей недели и не трогает другую неделю", () => {
  service.applyRest({ date: MON, reasonCode: "", todayIso: TODAY });
  service.applyRest({ date: TUE, reasonCode: "", todayIso: TODAY });
  service.applyRest({ date: NEXT_WEEK_MON, reasonCode: "", todayIso: NEXT_WEEK_MON });
  service.resetWeek({ todayIso: TODAY });
  assert.equal(changesFor().length, 0);
  assert.equal(changesFor(NEXT_WEEK_MON, "2026-06-14").length, 1);
});

test("нельзя редактировать дату вне текущей недели", () => {
  const result = service.applyRest({ date: NEXT_WEEK_MON, reasonCode: "", todayIso: TODAY });
  assert.equal(result.ok, false);
  assert.equal((result as any).status, 409);
});

test("нельзя изменить уже выполненный день", () => {
  db.prepare("INSERT INTO workout_logs(date,type,title,completed,rounds) VALUES(?,?,?,?,?)").run(WED, "Силовая", "Гантели по кругу", "[]", 1);
  const result = service.applyReplace({ date: WED, assignedSourceDay: 2, reasonCode: "", todayIso: TODAY });
  assert.equal(result.ok, false);
});

test("нельзя изменить день с открытым черновиком", () => {
  const snapshot = JSON.stringify({ title: "Гантели по кругу", type: "Силовая", rounds: 2, exercises: [{ name: "X", order: 0, target: "3 x 10", recommendedWeight: 0 }] });
  db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES(?,?, 'active',?)").run(TUE, "key-1", snapshot);
  const result = service.applyRest({ date: TUE, reasonCode: "", todayIso: TODAY });
  assert.equal(result.ok, false);
});

test("свап с занятым/выполненным/черновиком днём отклоняется целиком (обе стороны валидны или ни одной)", () => {
  db.prepare("INSERT INTO workout_logs(date,type,title,completed,rounds) VALUES(?,?,?,?,?)").run("2026-06-04", "Восстановление", "Прогулка и мобильность", "[]", 1);
  const result = service.applySwap({ dateA: "2026-06-05", dateB: "2026-06-04", reasonCode: "", todayIso: TODAY });
  assert.equal(result.ok, false);
  assert.equal(changesFor().find(r => r.date === "2026-06-05"), undefined);
});
