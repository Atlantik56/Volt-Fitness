import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-plan-v3-start-"));
const {db}=await import("@/lib/db.ts");
const {getTrainingPlanV3StartedAt,moscowIsoDate,startTrainingPlanV3}=await import("@/lib/training-plan-activation.ts");

test("миграция добавляет nullable дату старта нового плана",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=21").get());
 assert.equal(getTrainingPlanV3StartedAt(),null);
});

test("серверная дата определяется в Europe/Moscow",()=>{
 assert.equal(moscowIsoDate(new Date("2026-08-24T20:59:59Z")),"2026-08-24");
 assert.equal(moscowIsoDate(new Date("2026-08-24T21:00:00Z")),"2026-08-25");
});

test("старт атомарный и идемпотентный: повтор не меняет дату и историю",()=>{
 const before=(db.prepare("SELECT COUNT(*) count FROM workout_logs").get() as {count:number}).count;
 db.prepare("INSERT INTO workout_logs(date,type,title,completed,rounds,details) VALUES(?,?,?,?,?,?)").run("2026-08-20","Силовая","История","[]",1,"[]");
 assert.deepEqual(startTrainingPlanV3(new Date("2026-08-24T12:00:00Z")),{startedAt:"2026-08-24",alreadyStarted:false});
 assert.deepEqual(startTrainingPlanV3(new Date("2026-08-30T12:00:00Z")),{startedAt:"2026-08-24",alreadyStarted:true});
 assert.equal((db.prepare("SELECT COUNT(*) count FROM workout_logs").get() as {count:number}).count,before+1);
});
