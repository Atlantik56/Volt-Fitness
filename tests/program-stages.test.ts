import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-program-stages-"));
const { db } = await import("@/lib/db.ts");
const { createStage, updateStage, deleteStage } = await import("@/lib/program-stages.ts");

function stageRows() {
 return db.prepare("SELECT id,kind,title,start_date startDate,end_date endDate,note,goal FROM program_stages ORDER BY id").all() as any[];
}

test("createStage: сохраняет этап с корректными данными", () => {
 const result = createStage({ kind: "home", title: "Дом: гантели", startDate: "2026-07-21", endDate: null, note: "", goal: "Привычка" });
 assert.equal(result.ok, true);
 const rows = stageRows();
 assert.equal(rows.length, 1);
 assert.equal(rows[0].kind, "home");
 assert.equal(rows[0].endDate, null);
});

test("createStage: конец раньше начала -> 400", () => {
 const result = createStage({ kind: "gym", title: "Зал", startDate: "2026-08-01", endDate: "2026-07-01" });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 400);
});

test("createStage: некорректный kind -> 400", () => {
 const result = createStage({ kind: "space", title: "X", startDate: "2026-08-01" });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 400);
});

test("createStage: пустой title -> 400", () => {
 const result = createStage({ kind: "custom", title: "   ", startDate: "2026-08-01" });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 400);
});

test("updateStage: меняет поля существующего этапа", () => {
 createStage({ kind: "start", title: "Старт", startDate: "2026-07-01" });
 const id = stageRows().find(r => r.title === "Старт")!.id;
 const result = updateStage({ id, kind: "start", title: "Старт программы", startDate: "2026-07-01", endDate: "2026-07-20", note: "закрыт", goal: "" });
 assert.equal(result.ok, true);
 const row = stageRows().find(r => r.id === id)!;
 assert.equal(row.title, "Старт программы");
 assert.equal(row.endDate, "2026-07-20");
 assert.equal(row.note, "закрыт");
});

test("updateStage: несуществующий id -> 404", () => {
 const result = updateStage({ id: 999999, kind: "gym", title: "X", startDate: "2026-08-01" });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 404);
});

test("updateStage: некорректный id -> 400", () => {
 const result = updateStage({ id: "abc", kind: "gym", title: "X", startDate: "2026-08-01" });
 assert.equal(result.ok, false);
 if (!result.ok) assert.equal(result.status, 400);
});

test("deleteStage: удаляет этап и не трогает остальные таблицы", () => {
 db.prepare("INSERT INTO workout_logs (date,type,title,completed,rounds) VALUES ('2026-07-21','Силовая','X','[]',1)").run();
 const before = db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any;
 createStage({ kind: "pool", title: "Бассейн", startDate: "2026-08-01" });
 const id = stageRows().find(r => r.title === "Бассейн")!.id;
 const result = deleteStage({ id });
 assert.equal(result.ok, true);
 assert.equal(stageRows().find(r => r.id === id), undefined);
 const after = db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any;
 assert.equal(after.n, before.n);
});

test("deleteStage: некорректный id -> 400, несуществующий -> 404", () => {
 const bad = deleteStage({ id: "x" });
 assert.equal(bad.ok, false);
 if (!bad.ok) assert.equal(bad.status, 400);
 const missing = deleteStage({ id: 999999 });
 assert.equal(missing.ok, false);
 if (!missing.ok) assert.equal(missing.status, 404);
});
