import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Догоняющий разбор: приложение само закрывает накопившиеся импорты по тем же
// правилам, что и автоподтверждение, и один раз на базу.
mock.timers.enable({apis:["Date"],now:new Date("2026-09-10T12:00:00Z")});
test.after(()=>mock.timers.reset());
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-backfill-"));

const {db}=await import("@/lib/db.ts");
const {getSetting}=await import("@/lib/settings.ts");
const {buildHomeWeek}=await import("@/app/personal-data.ts");
const {runHistoricalBackfillOnce,previewHistoricalImports,HISTORICAL_BACKFILL_SETTING}=await import("@/lib/import-auto-confirm.ts");

const archived={id:1,programId:"volt-training",programVersion:3,startedAt:"2026-07-21",endedAt:"2026-09-02",restartedFromCycleId:null};
const active={id:2,programId:"volt-training",programVersion:4,startedAt:"2026-09-03",endedAt:null,restartedFromCycleId:null};
db.prepare("UPDATE profile SET program_start='2026-07-21',swim_plan_started_at='2026-08-10' WHERE id=1").run();
db.prepare("INSERT INTO training_plan_cycles(id,program_id,program_version,started_at,ended_at) VALUES(1,'volt-training',3,'2026-07-21','2026-09-02')").run();
db.prepare("INSERT INTO training_plan_cycles(id,program_id,program_version,started_at) VALUES(2,'volt-training',4,'2026-09-03')").run();

const monday="2026-08-17";
const week=buildHomeWeek("2026-07-21",[archived,active],monday);
const dayIso=(index:number)=>{const date=new Date(`${monday}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+index);return date.toISOString().slice(0,10)};
const swimIndex=week.findIndex((day:any)=>day.discipline==="swim");
const otherIndex=week.findIndex((day:any)=>day.discipline&&day.discipline!=="swim"&&day.discipline!=="recovery");
assert.ok(swimIndex>=0&&otherIndex>=0,"в архивной неделе должны быть плавание и вторая дисциплина");
const swimDate=dayIso(swimIndex),otherDate=dayIso(otherIndex),otherDiscipline=(week[otherIndex] as any).discipline;

let seq=0;
function addImport(date:string,type:string,duration=2600){
 seq++;
 return Number(db.prepare(`INSERT INTO workout_imports(source,external_id,fingerprint,started_at,duration_seconds,activity_type,metadata)
  VALUES('garmin_fit',?,?,?,?,?,?)`)
  .run(`back-${seq}`,String(seq).repeat(64).slice(0,64),`${date}T07:30:00Z`,duration,type,JSON.stringify({localDate:date,distanceMeters:1400}))
  .lastInsertRowid);
}
const historyCount=()=>(db.prepare("SELECT COUNT(*) c FROM workout_logs").get() as any).c;

const swimId=addImport(swimDate,"swim");
const otherId=addImport(otherDate,otherDiscipline);
const strayId=addImport(swimDate,"bike",2400);            // дисциплины нет в плане этого дня
const duplicateId=addImport(swimDate,"swim");             // второй файл того же занятия
const freshId=addImport("2026-09-09","swim");             // моложе трёх дней — не дело догоняющего разбора
const baseline=historyCount();

test("догоняющий разбор записывает только однозначное",()=>{
 const report=runHistoricalBackfillOnce()!;
 assert.ok(report,"первый запуск должен что-то вернуть");
 assert.equal(historyCount(),baseline+2,"записаны ровно два разобранных импорта");

 const confirmed=report.confirmed.map(item=>item.importId);
 for(const item of report.confirmed)assert.ok(item.date&&item.title,"в отчёте видно, что и куда записано");
 assert.ok(confirmed.includes(otherId),"вторая дисциплина разобрана");

 // Два файла одного занятия неразличимы, поэтому записывается ровно один из
 // них, а второй становится конфликтом. Какой именно — деталь порядка разбора.
 const twins=[swimId,duplicateId].filter(id=>confirmed.includes(id));
 assert.equal(twins.length,1,"из пары дублей записан ровно один");
 const rejectedTwin=twins[0]===swimId?duplicateId:swimId;

 const skipped=new Map(report.skipped.map(item=>[item.importId,item.reason]));
 assert.match(skipped.get(strayId)??"",/нет тренировки дисциплины|однозначного планового слота/);
 assert.match(skipped.get(rejectedTwin)??"",/уже есть тренировка/);
 assert.equal(skipped.has(freshId),false,"свежий импорт остаётся обычному автоподтверждению");
});

test("неразобранное остаётся в очереди ручного решения",()=>{
 const queue=previewHistoricalImports(new Date(),50).map(item=>item.importId);
 const linked=(id:number)=>Boolean((db.prepare("SELECT draft_id draftId FROM workout_imports WHERE id=?").get(id) as any).draftId);
 assert.ok(queue.includes(strayId),"неподходящая дисциплина остаётся на решение владельца");
 assert.ok(queue.includes(swimId)!==queue.includes(duplicateId),"в очереди остаётся только незаписанный дубль");
 assert.ok(linked(otherId)&&!queue.includes(otherId),"записанное из очереди уходит");
});

test("разбор выполняется один раз на базу",()=>{
 const flag=getSetting(HISTORICAL_BACKFILL_SETTING);
 assert.ok(flag,"отметка о выполнении сохранена");
 assert.equal(JSON.parse(flag!).confirmed,2);
 const before=historyCount();
 assert.equal(runHistoricalBackfillOnce(),null,"повторный запуск ничего не делает");
 assert.equal(historyCount(),before);
});
