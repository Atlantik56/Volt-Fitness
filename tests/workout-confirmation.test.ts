import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-confirmation-"));
const {db}=await import("@/lib/db.ts");
const service=await import("@/lib/active-workout-service.ts");
const {buildAutomaticMilestones}=await import("@/lib/milestones.ts");

const snapshot=(title:string)=>({title,type:"Силовая",rounds:1,exercises:[
 {name:`Жим ${title}`,target:"3 × 8–12",recommendedWeight:45},
 {name:`Тяга ${title}`,target:"3 × 10",recommendedWeight:30},
]});
const awaiting=(date:string,title:string)=>{
 const started=service.startWorkoutDraft({date,snapshot:snapshot(title)});
 assert.equal(started.ok,true);
 const finished=service.finishWorkoutDraft({id:started.draft!.id,expectedStatus:"active"});
 assert.equal(finished.ok,true);
 return finished.draft!;
};
const planResults=(draft:any)=>draft.snapshot.exercises.map((exercise:any)=>({
 name:exercise.name,sets:Array.from({length:exercise.sets??1},()=>({weight:exercise.recommendedWeight,reps:exercise.repMin??0})),skipped:false,added:false,
}));
const confirm=(draft:any,exercises=planResults(draft))=>service.confirmWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation",durationSeconds:1800,exercises});

test("повторное открытие awaiting_confirmation восстанавливает план и прошлые результаты",()=>{
 const draft=awaiting("2026-08-01","restore");
 const before=JSON.stringify(draft.snapshot);
 const reopened=service.listOpenWorkoutDrafts().find(item=>item.id===draft.id)!;
 assert.equal(reopened.status,"awaiting_confirmation");
 assert.equal(JSON.stringify(reopened.snapshot),before);
 assert.equal(reopened.confirmation?.source,"Manual");
});

test("всё выполнено по плану создаёт ровно один workout и плановые strength_logs",()=>{
 const draft=awaiting("2026-08-02","plan"),before=JSON.stringify(draft.snapshot);
 const result=confirm(draft);
 assert.equal(result.ok,true);
 const workoutId=result.draft!.workoutId!;
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE id=?").get(workoutId) as any).n,1);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE workout_id=?").get(workoutId) as any).n,2);
 assert.equal((db.prepare("SELECT snapshot FROM workout_drafts WHERE id=?").get(draft.id) as any).snapshot,before);
});

test("всё как в прошлый раз сохраняет прежние веса и подходы",()=>{
 const names=snapshot("last").exercises.map(x=>x.name);
 const old=db.prepare("INSERT INTO workout_logs(date,type,title,completed,rounds,details) VALUES(?,?,?,?,?,?)").run("2026-08-02","Силовая","Прошлая","[]",1,JSON.stringify([
  {key:"0",name:names[0],originalName:names[0],weight:42.5,value:8,unit:"повт."},
  {key:"1",name:names[0],originalName:names[0],weight:42.5,value:8,unit:"повт."},
  {key:"2",name:names[0],originalName:names[0],weight:42.5,value:8,unit:"повт."},
 ]));
 db.prepare("INSERT INTO strength_logs(date,exercise,weight,reps,difficulty,workout_id) VALUES(?,?,?,?,?,?)").run("2026-08-02",names[0],42.5,8,"Нормально",old.lastInsertRowid);
 const draft=awaiting("2026-08-03","last"),reopened=service.listOpenWorkoutDrafts().find(item=>item.id===draft.id)!;
 assert.equal(reopened.confirmation?.lastResults[names[0]].length,3);
 const results=planResults(draft);results[0].sets=reopened.confirmation!.lastResults[names[0]];
 const saved=confirm(draft,results);assert.equal(saved.ok,true);
 const details=JSON.parse((db.prepare("SELECT details FROM workout_logs WHERE id=?").get(saved.draft!.workoutId) as any).details);
 assert.equal(details.filter((x:any)=>x.originalName===names[0]).every((x:any)=>x.weight===42.5&&x.value===8),true);
});

test("одно и несколько изменений, частичное выполнение, пропуск и добавление сохраняются корректно",()=>{
 const draft=awaiting("2026-08-04","edit"),before=JSON.stringify(draft.snapshot),results=planResults(draft);
 results[0].sets=[{weight:47.5,reps:9},{weight:47.5,reps:8}];
 results[1].skipped=true;
 results.push({name:"Внеплановая планка",sets:[{weight:0,reps:60}],skipped:false,added:true});
 const saved=confirm(draft,results);assert.equal(saved.ok,true);
 const workoutId=saved.draft!.workoutId!,details=JSON.parse((db.prepare("SELECT details FROM workout_logs WHERE id=?").get(workoutId) as any).details);
 assert.equal(details.some((x:any)=>x.originalName===results[1].name&&x.skipped),true);
 assert.equal(details.some((x:any)=>x.originalName==="Внеплановая планка"&&x.added),true);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE workout_id=? AND exercise=?").get(workoutId,results[1].name) as any).n,0);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM strength_logs WHERE workout_id=? AND exercise=?").get(workoutId,"Внеплановая планка") as any).n,1);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM progression_decisions WHERE workout_id=? AND exercise=?").get(workoutId,results[1].name) as any).n,0);
 assert.equal((db.prepare("SELECT snapshot FROM workout_drafts WHERE id=?").get(draft.id) as any).snapshot,before);
});

test("связанный FIT задаёт метрики, остаётся связанным и не является источником упражнений",()=>{
 const draft=awaiting("2026-08-05","fit");
 const fingerprint="f".repeat(64);
 db.prepare(`INSERT INTO workout_imports(source,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,max_heart_rate,calories,metadata,draft_id)
  VALUES('garmin_fit',?,'2026-08-05T10:00:00Z',2400,'strength',121,166,410,'{}',?)`).run(fingerprint,draft.id);
 const reopened=service.listOpenWorkoutDrafts().find(item=>item.id===draft.id)!;
 assert.deepEqual({source:reopened.confirmation?.source,duration:reopened.confirmation?.duration,hr:reopened.confirmation?.averageHeartRate,calories:reopened.confirmation?.calories},{source:"Garmin",duration:2400,hr:121,calories:410});
 const saved=confirm(reopened);assert.equal(saved.ok,true);
 const workout=db.prepare("SELECT duration_seconds duration,avg_heart_rate hr,max_heart_rate maxHr,calories FROM workout_logs WHERE id=?").get(saved.draft!.workoutId) as any;
 assert.deepEqual(workout,{duration:2400,hr:121,maxHr:166,calories:410});
 assert.equal((db.prepare("SELECT draft_id draftId FROM workout_imports WHERE fingerprint=?").get(fingerprint) as any).draftId,draft.id);
});

test("повторное подтверждение не создаёт дублей",()=>{
 const draft=awaiting("2026-08-06","repeat"),first=confirm(draft);
 assert.equal(first.ok,true);
 const second=confirm(draft);
 assert.equal(second.ok,false);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE id=?").get(first.draft!.workoutId) as any).n,1);
});

test("PR и Milestones видят изменённый результат, progression работает, skipped не участвует",()=>{
 const draft=awaiting("2026-08-07","signals"),exercise=draft.snapshot.exercises[0].name,skipped=draft.snapshot.exercises[1].name;
 db.prepare("INSERT INTO strength_logs(date,exercise,weight,reps,difficulty) VALUES('2026-08-01',?,40,8,'Легко')").run(exercise);
 db.prepare("INSERT INTO strength_logs(date,exercise,weight,reps,difficulty) VALUES('2026-08-03',?,42,8,'Легко')").run(exercise);
 const results=planResults(draft);results[0].sets=[{weight:45,reps:12}];results[1].skipped=true;
 const saved=confirm(draft,results);assert.equal(saved.ok,true);
 const workoutId=saved.draft!.workoutId!;
 assert.equal((db.prepare("SELECT COUNT(*) n FROM progression_decisions WHERE workout_id=? AND exercise=?").get(workoutId,exercise) as any).n,1);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM progression_decisions WHERE workout_id=? AND exercise=?").get(workoutId,skipped) as any).n,0);
 const workouts=db.prepare("SELECT id,date FROM workout_logs").all() as any[];
 const strengthLogs=db.prepare("SELECT id,date,exercise,weight FROM strength_logs").all() as any[];
 const milestones=buildAutomaticMilestones({workouts,strengthLogs,measurements:[],programStages:[],photos:[],anchor:"2026-08-08"});
 assert.equal(milestones.some((item:any)=>item.kind==="personal-record"&&item.title.includes(exercise)),true);
});
