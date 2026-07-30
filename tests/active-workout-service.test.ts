import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-active-workout-"));
const {db}=await import("@/lib/db.ts");
const service=await import("@/lib/active-workout-service.ts");

const snapshot=(title="План A",name="Неизвестное упражнение")=>({
 title,type:"Силовая",rounds:2,exercises:[
  {name,target:"3 × 8–12",recommendedWeight:15},
  {name:"Планка",target:"3 × 30–45 сек",recommendedWeight:0},
 ],
});
const start=(date:string,s=snapshot())=>{
 const result=service.startWorkoutDraft({date,snapshot:s});
 assert.equal(result.ok,true);
 return result.draft!;
};

test("создаёт server-side active draft со снимком и поддерживает неизвестные упражнения",()=>{
 const draft=start("2026-07-01");
 assert.equal(draft.status,"active");
 assert.equal(draft.snapshot.exercises[0].name,"Неизвестное упражнение");
 assert.deepEqual(draft.snapshot.exercises[0],{name:"Неизвестное упражнение",order:0,target:"3 × 8–12",recommendedWeight:15,sets:3,repMin:8,repMax:12,unit:"повт."});
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get(draft.date) as any).n,0);
});

test("повторный и конкурентно безопасный старт идемпотентен",()=>{
 const first=start("2026-07-02"),second=start("2026-07-02");
 assert.equal(second.id,first.id);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_drafts WHERE date=?").get(first.date) as any).n,1);
});

test("восстановление читает сохранённый снимок, изменение исходного плана его не меняет",()=>{
 const input=snapshot("Неизменяемый план");
 const draft=start("2026-07-03",input);
 input.exercises[0].target="1 × 1";
 input.exercises[0].recommendedWeight=99;
 const restored=service.listWorkoutDrafts("2026-07-03")[0];
 assert.equal(restored.id,draft.id);
 assert.equal(restored.snapshot.exercises[0].target,"3 × 8–12");
 assert.equal(restored.snapshot.exercises[0].recommendedWeight,15);
 assert.ok(service.listOpenWorkoutDrafts().some(item=>item.id===draft.id));
});

test("active → awaiting_confirmation не создаёт фактических логов",()=>{
 const draft=start("2026-07-04");
 const result=service.finishWorkoutDraft({id:draft.id,expectedStatus:"active"});
 assert.equal(result.ok,true);
 assert.equal(result.draft?.status,"awaiting_confirmation");
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get(draft.date) as any).n,0);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE date=?").get(draft.date) as any).n,0);
});

test("отмена сохраняет историческую строку и не создаёт факт",()=>{
 const draft=start("2026-07-05");
 const result=service.cancelWorkoutDraft({id:draft.id,expectedStatus:"active"});
 assert.equal(result.ok,true);
 const row=db.prepare("SELECT status,cancelled_at cancelledAt FROM workout_drafts WHERE id=?").get(draft.id) as any;
 assert.equal(row.status,"cancelled");
 assert.ok(row.cancelledAt);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get(draft.date) as any).n,0);
});

test("явное подтверждение атомарно создаёт один workout, strength logs и completed draft",()=>{
 const draft=start("2026-07-06");
 service.finishWorkoutDraft({id:draft.id,expectedStatus:"active"});
 const confirmed=service.confirmWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation",durationSeconds:900});
 assert.equal(confirmed.ok,true);
 assert.equal(confirmed.draft?.status,"completed");
 assert.ok(confirmed.draft?.workoutId);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get(draft.date) as any).n,1);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE workout_id=?").get(confirmed.draft?.workoutId) as any).n,2);
});

test("повторное подтверждение и устаревшие переходы не создают дублей",()=>{
 const draft=start("2026-07-07");
 service.finishWorkoutDraft({id:draft.id,expectedStatus:"active"});
 service.confirmWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation",durationSeconds:60});
 const repeat=service.confirmWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation",durationSeconds:60});
 assert.equal(repeat.ok,false);
 if(!repeat.ok)assert.equal(repeat.status,409);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get(draft.date) as any).n,1);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE date=?").get(draft.date) as any).n,2);
 assert.equal(service.finishWorkoutDraft({id:draft.id,expectedStatus:"active"}).ok,false);
});

test("после completed можно начать повторную тренировку без переиспользования старой",()=>{
 const first=start("2026-07-08");
 service.finishWorkoutDraft({id:first.id,expectedStatus:"active"});
 service.confirmWorkoutDraft({id:first.id,expectedStatus:"awaiting_confirmation",durationSeconds:60});
 const second=start("2026-07-08");
 assert.notEqual(second.id,first.id);
 assert.equal(second.status,"active");
});

test("валидация отклоняет некорректные планы, даты и состояния",()=>{
 assert.equal(service.startWorkoutDraft({date:"вчера",snapshot:snapshot()}).ok,false);
 assert.equal(service.startWorkoutDraft({date:"2026-07-09",snapshot:{...snapshot(),exercises:[]}}).ok,false);
 const draft=start("2026-07-09");
 const stale=service.finishWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation"});
 assert.equal(stale.ok,false);
 if(!stale.ok)assert.equal(stale.status,400);
});
