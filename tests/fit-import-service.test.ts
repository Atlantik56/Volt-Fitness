import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Encoder,Profile } from "@garmin/fitsdk";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-fit-import-"));
const {db}=await import("@/lib/db.ts");
const fit=await import("@/lib/fit-import-service.ts");
const initialWorkoutLogs=(db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n;

function activityFit(start=new Date("2026-07-10T10:00:00.000Z"),sport="training",duration=3600){
 const encoder=new Encoder(),end=new Date(start.getTime()+duration*1000);
 encoder.onMesg(Profile.MesgNum.FILE_ID,{type:"activity",manufacturer:"development",product:1,serialNumber:123,timeCreated:start} as any);
 encoder.onMesg(Profile.MesgNum.SESSION,{timestamp:end,startTime:start,sport,totalElapsedTime:duration,totalTimerTime:duration,avgHeartRate:132,maxHeartRate:171,totalCalories:480,avgCadence:74,totalTrainingEffect:3.2} as any);
 encoder.onMesg(Profile.MesgNum.ACTIVITY,{timestamp:end,totalTimerTime:duration,numSessions:1,type:"manual"} as any);
 return encoder.close();
}
function draft(planKey:string,start="2026-07-10 10:05:00",finish="2026-07-10 11:03:00",type="Силовая"){
 return Number(db.prepare(`INSERT INTO workout_drafts(date,plan_key,status,snapshot,started_at,finished_at)
  VALUES ('2026-07-10',?,'awaiting_confirmation',?,?,?)`).run(planKey,JSON.stringify({title:`План ${planKey}`,type}),start,finish).lastInsertRowid);
}

test("валидный FIT нормализуется только в достоверные метрики",()=>{
 const parsed=fit.parseFit(activityFit());
 assert.equal(parsed.ok,true);
 if(!parsed.ok)return;
 assert.equal(parsed.workout.activityType,"strength");
 assert.equal(parsed.workout.duration,3600);
 assert.equal(parsed.workout.averageHeartRate,132);
 assert.equal(parsed.workout.maxHeartRate,171);
 assert.equal(parsed.workout.calories,480);
 assert.equal(parsed.workout.metadata.averageCadence,74);
 assert.equal(parsed.workout.metadata.trainingEffect,3.2);
 assert.equal("exercises" in parsed.workout,false);
});

test("отклоняет пустой, слишком большой, неподдерживаемый и повреждённый файл",()=>{
 const status=(result:ReturnType<typeof fit.parseFit>)=>result.ok?200:result.status;
 assert.equal(status(fit.parseFit(new Uint8Array())),400);
 assert.equal(status(fit.parseFit(new Uint8Array(fit.MAX_FIT_FILE_SIZE+1))),413);
 assert.equal(status(fit.parseFit(new TextEncoder().encode("<xml/>"))),415);
 const corrupt=activityFit();corrupt[corrupt.length-1]^=255;
 assert.equal(status(fit.parseFit(corrupt)),422);
 assert.equal(fit.validateFitUpload("run.gpx",10)?.status,415);
});

test("fingerprint устойчив и различает содержимое",()=>{
 const bytes=activityFit();
 assert.equal(fit.fingerprintFit(bytes),fit.fingerprintFit(new Uint8Array(bytes)));
 const changed=new Uint8Array(bytes);changed[20]^=1;
 assert.notEqual(fit.fingerprintFit(bytes),fit.fingerprintFit(changed));
});

test("единственное точное совпадение автоматически связывается с Draft",()=>{
 const draftId=draft("exact");
 const result=fit.importFit(activityFit());
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.result.autoLinked,true);
 assert.equal(result.result.draftId,draftId);
 assert.equal(result.result.candidates[0].confidence,"High");
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n,initialWorkoutLogs);
});

test("повторный импорт не создаёт дубль и не создаёт workout_log",()=>{
 const before=(db.prepare("SELECT COUNT(*) n FROM workout_imports").get() as any).n;
 const result=fit.importFit(activityFit());
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.result.duplicate,true);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_imports").get() as any).n,before);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n,initialWorkoutLogs);
});

test("два High-совпадения неоднозначны и не связываются автоматически",()=>{
 db.prepare("DELETE FROM workout_imports").run();
 draft("ambiguous","2026-07-10 10:10:00","2026-07-10 11:05:00");
 const result=fit.importFit(activityFit(new Date("2026-07-10T10:00:01Z")));
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.result.candidates.filter((x:any)=>x.confidence==="High").length,2);
 assert.equal(result.result.draftId,null);
});

test("при отсутствии Draft импорт сохраняется без связи",()=>{
 db.prepare("DELETE FROM workout_imports").run();
 db.prepare("UPDATE workout_drafts SET status='cancelled'").run();
 const result=fit.importFit(activityFit(new Date("2026-07-11T08:00:00Z")));
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.result.candidates.length,0);
 assert.equal(result.result.draftId,null);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n,initialWorkoutLogs);
});

test("migration v15 создаёт provider-independent хранилище импорта",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=15").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workout_imports'").get());
});
