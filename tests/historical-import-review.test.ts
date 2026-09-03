import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Разбор старых импортов: те самые записи, которые автоподтверждение
// намеренно не трогает, потому что они старше AUTO_CONFIRM_MAX_AGE_DAYS и
// относятся к уже закрытому циклу. Решение принимает владелец, по одной записи.
mock.timers.enable({apis:["Date"],now:new Date("2026-09-10T12:00:00Z")});
test.after(()=>mock.timers.reset());
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-historical-review-"));

const {db}=await import("@/lib/db.ts");
const {buildHomeWeek}=await import("@/app/personal-data.ts");
const {confirmHistoricalImport,dismissHistoricalImport,previewHistoricalImports,autoConfirmImport}=await import("@/lib/import-auto-confirm.ts");

const archived={id:1,programId:"volt-training",programVersion:3,startedAt:"2026-07-21",endedAt:"2026-09-02",restartedFromCycleId:null};
const active={id:2,programId:"volt-training",programVersion:4,startedAt:"2026-09-03",endedAt:null,restartedFromCycleId:null};
db.prepare("UPDATE profile SET program_start='2026-07-21',swim_plan_started_at='2026-08-10' WHERE id=1").run();
db.prepare("INSERT INTO training_plan_cycles(id,program_id,program_version,started_at,ended_at) VALUES(1,'volt-training',3,'2026-07-21','2026-09-02')").run();
db.prepare("INSERT INTO training_plan_cycles(id,program_id,program_version,started_at) VALUES(2,'volt-training',4,'2026-09-03')").run();

// Дата берётся из самого плана, а не из предположения о днях недели: тест
// проверяет разбор импорта, а не структуру конкретной версии программы.
const monday="2026-08-17";
const week=buildHomeWeek("2026-07-21",[archived,active],monday);
const swimIndex=week.findIndex((day:any)=>day.discipline==="swim");
assert.ok(swimIndex>=0,"в архивном цикле должен быть плавательный слот");
const swimDate=new Date(`${monday}T12:00:00Z`);
swimDate.setUTCDate(swimDate.getUTCDate()+swimIndex);
const planned=swimDate.toISOString().slice(0,10);

let seq=0;
function addImport(date:string,type:string,duration=2600){
 seq++;
 return Number(db.prepare(`INSERT INTO workout_imports(source,external_id,fingerprint,started_at,duration_seconds,activity_type,metadata)
  VALUES('garmin_fit',?,?,?,?,?,?)`)
  .run(`hist-${seq}`,String(seq).repeat(64).slice(0,64),`${date}T07:30:00Z`,duration,type,JSON.stringify({localDate:date,distanceMeters:1400}))
  .lastInsertRowid);
}
const historyCount=()=>(db.prepare("SELECT COUNT(*) c FROM workout_logs").get() as any).c;
// В свежей базе уже лежит одна демо-тренировка — считаем от неё.
const baseline=historyCount();

test("старый импорт не подтверждается сам, но виден в очереди разбора",()=>{
 const id=addImport(planned,"swim");
 const auto=autoConfirmImport(id) as any;
 assert.equal(auto.confirmed,false);
 assert.match(auto.reason,/старше|архивному циклу/);
 assert.equal(historyCount(),baseline,"автоматически ничего не записано");

 const item=previewHistoricalImports(new Date(),50).find(entry=>entry.importId===id);
 assert.ok(item,"импорт должен попасть в очередь ручного разбора");
 assert.equal(item!.date,planned);
 assert.equal(item!.cycleId,1,"привязка к архивному циклу, а не к активному");
 assert.equal(item!.programVersion,3);
 assert.ok(item!.scheduledTitle,"слот показан наперёд");
 assert.equal(item!.existingWorkoutConflict,false);
});

test("владелец подтверждает импорт вручную — тренировка появляется один раз",()=>{
 const id=(db.prepare("SELECT id FROM workout_imports ORDER BY id DESC LIMIT 1").get() as any).id;
 const result=confirmHistoricalImport(id) as any;
 assert.equal(result.confirmed,true,result.reason);
 assert.equal(historyCount(),baseline+1);

 const log=db.prepare("SELECT date,duration_seconds d FROM workout_logs ORDER BY id DESC LIMIT 1").get() as any;
 assert.equal(log.date,planned);
 assert.equal(log.d,2600,"длительность из импорта, а не из плана");
 const link=db.prepare("SELECT draft_id draftId FROM workout_imports WHERE id=?").get(id) as any;
 assert.ok(link.draftId,"импорт связан с черновиком");
 const snapshot=JSON.parse((db.prepare("SELECT snapshot FROM workout_drafts WHERE id=?").get(link.draftId) as any).snapshot);
 assert.equal(snapshot.programIdentity?.cycleId??1,1,"identity архивного цикла сохранена");

 const again=confirmHistoricalImport(id) as any;
 assert.equal(again.confirmed,false);
 assert.match(again.reason,/уже связан/);
 assert.equal(historyCount(),baseline+1,"повтор не создаёт дубль");
});

test("второй импорт на тот же слот показывает конфликт и не пишется",()=>{
 const id=addImport(planned,"swim");
 const item=previewHistoricalImports(new Date(),50).find(entry=>entry.importId===id);
 assert.equal(item?.existingWorkoutConflict,true);
 const result=confirmHistoricalImport(id) as any;
 assert.equal(result.confirmed,false);
 assert.match(result.reason,/уже есть тренировка/);
 assert.equal(historyCount(),baseline+1);
});

test("дисциплина, которой нет в плане на эту дату, не привязывается",()=>{
 const id=addImport(planned,"bike",2400);
 const result=confirmHistoricalImport(id) as any;
 assert.equal(result.confirmed,false);
 assert.match(result.reason,/нет тренировки дисциплины|однозначного планового слота/);
 assert.equal(historyCount(),baseline+1);
});

test("отклонённый импорт уходит из очереди и больше не подтверждается",()=>{
 const id=(db.prepare("SELECT id FROM workout_imports ORDER BY id DESC LIMIT 1").get() as any).id;
 assert.deepEqual(dismissHistoricalImport(id),{ok:true});
 assert.equal(previewHistoricalImports(new Date(),50).some(entry=>entry.importId===id),false);
 const result=confirmHistoricalImport(id) as any;
 assert.equal(result.confirmed,false);
 assert.match(result.reason,/отклонён/);
 assert.equal(historyCount(),baseline+1);
});

test("отклонить уже связанный импорт нельзя",()=>{
 const linked=db.prepare("SELECT id FROM workout_imports WHERE draft_id IS NOT NULL LIMIT 1").get() as any;
 const result=dismissHistoricalImport(linked.id) as any;
 assert.equal(result.ok,false);
 assert.equal(result.status,409);
});
