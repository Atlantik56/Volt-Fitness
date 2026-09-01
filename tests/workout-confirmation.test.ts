import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-confirmation-"));
const {db}=await import("@/lib/db.ts");
const service=await import("@/lib/active-workout-service.ts");
const {buildAutomaticMilestones}=await import("@/lib/milestones.ts");
const {buildCoachSummary}=await import("@/lib/coach.ts");

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

test("связанная Strava activity использует общий confirm flow и сохраняет provider provenance",()=>{
 const draft=awaiting("2026-08-21","strava");
 db.prepare(`INSERT INTO workout_imports(source,external_id,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,max_heart_rate,calories,metadata,draft_id)
  VALUES('strava','123456789',?,'2026-08-21T10:00:00Z',2100,'strength',126,169,360,'{"distanceMeters":0}',?)`).run("s".repeat(64),draft.id);
 const reopened=service.listOpenWorkoutDrafts().find(item=>item.id===draft.id)!;
 assert.equal(reopened.confirmation?.source,"Strava");
 const saved=confirm(reopened);assert.equal(saved.ok,true);assert.equal(saved.summary!.confirmationSource,"Strava");
 const workout=db.prepare("SELECT metrics_source metricsSource,external_activity_source source,external_activity_id externalId FROM workout_logs WHERE id=?").get(saved.draft!.workoutId) as any;
 assert.deepEqual(workout,{metricsSource:"imported_metric",source:"strava",externalId:"123456789"});
});

test("отмена Swim draft со связанным FIT не создаёт completed workout даже при повторном confirm",()=>{
 const draft=awaiting("2026-08-20","swim-fit-cancel");
 const fingerprint="c".repeat(64);
 db.prepare(`INSERT INTO workout_imports(source,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,max_heart_rate,calories,metadata,draft_id)
  VALUES('garmin_fit',?,'2026-08-20T10:00:00Z',1800,'swim',118,146,240,'{"distanceMeters":800}',?)`).run(fingerprint,draft.id);
 const before=(db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get(draft.date) as any).n;
 const cancelled=service.cancelWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation"});
 assert.equal(cancelled.ok,true);
 const staleConfirm=confirm(draft);
 assert.equal(staleConfirm.ok,false);
 if(!staleConfirm.ok)assert.equal(staleConfirm.status,409);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get(draft.date) as any).n,before);
 assert.equal((db.prepare("SELECT status,workout_id workoutId FROM workout_drafts WHERE id=?").get(draft.id) as any).status,"cancelled");
 assert.equal((db.prepare("SELECT workout_id workoutId FROM workout_drafts WHERE id=?").get(draft.id) as any).workoutId,null);
 assert.equal((db.prepare("SELECT draft_id draftId FROM workout_imports WHERE fingerprint=?").get(fingerprint) as any).draftId,draft.id);
});

test("повторное подтверждение не создаёт дублей",()=>{
 const draft=awaiting("2026-08-06","repeat"),first=confirm(draft);
 assert.equal(first.ok,true);
 const second=confirm(draft);
 assert.equal(second.ok,false);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE id=?").get(first.draft!.workoutId) as any).n,1);
});

test("AI-9: источник каждого упражнения сохраняется в фактических данных, а не только в состоянии формы",()=>{
 const draft=awaiting("2026-08-09","sources"),plan=draft.snapshot.exercises[0].name,other=draft.snapshot.exercises[1].name;
 const results=planResults(draft);
 results[0].source="confirmed_as_planned";
 results[1].sets=[{weight:35,reps:9}];results[1].source="manually_edited";
 results.push({name:"Внеплановые выпады",sets:[{weight:20,reps:10}],skipped:false,added:true,source:"added"});
 const saved=confirm(draft,results);assert.equal(saved.ok,true);
 assert.deepEqual(saved.summary!.exercises.map((x:any)=>({name:x.name,source:x.source})),[
  {name:plan,source:"confirmed_as_planned"},{name:other,source:"manually_edited"},{name:"Внеплановые выпады",source:"added"},
 ]);
 const details=JSON.parse((db.prepare("SELECT details FROM workout_logs WHERE id=?").get(saved.draft!.workoutId) as any).details);
 assert.equal(details.filter((x:any)=>x.originalName===plan).every((x:any)=>x.source==="confirmed_as_planned"),true);
 assert.equal(details.filter((x:any)=>x.originalName===other).every((x:any)=>x.source==="manually_edited"),true);
 assert.equal(details.find((x:any)=>x.originalName==="Внеплановые выпады")?.source,"added");
});

test("AI-9: «всё как в прошлый раз» сохраняет source=confirmed_as_previous",()=>{
 const draft=awaiting("2026-08-10","prev-source"),results=planResults(draft);
 results[0].source="confirmed_as_previous";
 const saved=confirm(draft,results);assert.equal(saved.ok,true);
 assert.equal(saved.summary!.exercises[0].source,"confirmed_as_previous");
});

test("AI-9: пропуск сохраняет source=skipped независимо от присланного значения",()=>{
 const draft=awaiting("2026-08-11","skip-source"),results=planResults(draft);
 results[1].skipped=true;results[1].source="confirmed_as_planned";
 const saved=confirm(draft,results);assert.equal(saved.ok,true);
 assert.equal(saved.summary!.exercises[1].source,"skipped");
});

test("AI-9: некорректное значение source отклоняется как ошибка запроса",()=>{
 const draft=awaiting("2026-08-12","bad-source"),results=planResults(draft);
 (results[0] as any).source="hallucinated";
 const saved=confirm(draft,results);
 assert.equal(saved.ok,false);
 assert.equal((saved as any).status,400);
});

test("AI-9: отсутствующий source не ломает запрос — выводится из added/skipped, по умолчанию confirmed_as_planned",()=>{
 const draft=awaiting("2026-08-13","no-source"),results=planResults(draft);
 const saved=confirm(draft,results);
 assert.equal(saved.ok,true);
 assert.equal(saved.summary!.exercises.every((x:any)=>x.source==="confirmed_as_planned"),true);
});

test("AI-9: FIT задаёт metricsSource=imported_metric, но не источник подходов",()=>{
 const draft=awaiting("2026-08-14","metrics-source");
 db.prepare(`INSERT INTO workout_imports(source,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,max_heart_rate,calories,metadata,draft_id)
  VALUES('garmin_fit',?,'2026-08-14T10:00:00Z',1800,'strength',130,170,300,'{}',?)`).run("a".repeat(64),draft.id);
 const reopened=service.listOpenWorkoutDrafts().find((item:any)=>item.id===draft.id)!;
 const results=planResults(reopened);results[0].source="confirmed_as_planned";
 const saved=confirm(reopened,results);assert.equal(saved.ok,true);
 assert.equal(saved.summary!.metricsSource,"imported_metric");
 assert.equal(saved.summary!.confirmationSource,"Garmin");
 assert.equal(saved.summary!.exercises[0].source,"confirmed_as_planned");
 const workout=db.prepare("SELECT metrics_source metricsSource FROM workout_logs WHERE id=?").get(saved.draft!.workoutId) as any;
 assert.equal(workout.metricsSource,"imported_metric");
});

test("AI-9: без FIT metricsSource=manual",()=>{
 const draft=awaiting("2026-08-15","manual-metrics"),saved=confirm(draft);
 assert.equal(saved.ok,true);
 assert.equal(saved.summary!.metricsSource,"manual");
 assert.equal(saved.summary!.confirmationSource,"Manual");
});

test("AI-9: effort и painAfter подтверждаются пользователем и сохраняются в workout_logs",()=>{
 const draft=awaiting("2026-08-16","effort");
 const saved=service.confirmWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation",durationSeconds:1800,exercises:planResults(draft),effort:"Тяжело",painAfter:4});
 assert.equal(saved.ok,true);
 assert.equal(saved.summary!.effort,"Тяжело");
 assert.equal(saved.summary!.painAfter,4);
 const workout=db.prepare("SELECT effort,pain_after painAfter FROM workout_logs WHERE id=?").get(saved.draft!.workoutId) as any;
 assert.deepEqual(workout,{effort:"Тяжело",painAfter:4});
});

test("AI-9: некорректный effort или painAfter вне диапазона отклоняются сервером",()=>{
 const draft=awaiting("2026-08-17","bad-effort");
 const badEffort=service.confirmWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation",durationSeconds:1800,exercises:planResults(draft),effort:"Ужасно"});
 assert.equal(badEffort.ok,false);
 const badPain=service.confirmWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation",durationSeconds:1800,exercises:planResults(draft),painAfter:99});
 assert.equal(badPain.ok,false);
});

test("AI-9: без явного effort/painAfter — безопасные дефолты (Нормально/0), как раньше",()=>{
 const draft=awaiting("2026-08-18","default-effort"),saved=confirm(draft);
 assert.equal(saved.ok,true);
 assert.equal(saved.summary!.effort,"Нормально");
 assert.equal(saved.summary!.painAfter,0);
});

test("AI-9: старые записи без source в details продолжают читаться и редактироваться без ошибок",async()=>{
 const legacyDetails=[{key:"0",name:"Жим лёжа",originalName:"Жим лёжа",value:8,weight:40,difficulty:"Нормально",unit:"повт."}];
 const legacy=db.prepare("INSERT INTO workout_logs(date,type,title,completed,rounds,details) VALUES(?,?,?,?,?,?)").run("2026-07-01","Силовая","Легаси","[\"0\"]",1,JSON.stringify(legacyDetails));
 const legacyId=Number(legacy.lastInsertRowid);
 const {updateWorkout}=await import("@/lib/workout-service.ts");
 const updated=updateWorkout({id:legacyId,date:"2026-07-01",type:"Силовая",title:"Легаси",rounds:1,durationSeconds:1800,restSeconds:0,details:legacyDetails.map((x:any)=>({...x,value:9}))});
 assert.equal(updated.ok,true);
 const details=JSON.parse((db.prepare("SELECT details FROM workout_logs WHERE id=?").get(legacyId) as any).details);
 assert.equal(details[0].value,9);
 assert.equal(details[0].source,"unknown");
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

// Сломанные карточки упражнений, п.2 — регрессия жизненного цикла черновика:
// ни "открытие" (startWorkoutDraft), ни "переход к следующему шагу"
// (finishWorkoutDraft, ожидание подтверждения) не должны создавать
// workout_log или считаться выполненной тренировкой раньше настоящего
// подтверждения. См. также lib/workout-status.ts (статус карточки).
const workoutDoneFor=(date:string,plan:{title:string;type:string})=>{
 const workouts=db.prepare("SELECT date,type,title FROM workout_logs WHERE date=?").all(date);
 return buildCoachSummary({date,plan,workouts}).workoutDone;
};

test("шаг 1 (старт черновика) не создаёт workout_log и не считается выполненной тренировкой",()=>{
 const before=(db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n;
 const started=service.startWorkoutDraft({date:"2026-08-09",snapshot:snapshot("step1")});
 assert.equal(started.ok,true);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n,before);
 assert.equal(workoutDoneFor("2026-08-09",{title:"Жим step1",type:"Силовая"}),false);
});

test("шаг 2 (переход к ожиданию подтверждения) не создаёт workout_log и не считается выполненной тренировкой",()=>{
 const before=(db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n;
 const draft=awaiting("2026-08-10","step2");
 assert.equal(draft.status,"awaiting_confirmation");
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs").get() as any).n,before);
 assert.equal(workoutDoneFor("2026-08-10",{title:draft.snapshot.title,type:draft.snapshot.type}),false);
});

test("незавершённая (отменённая) сессия не считается выполненной тренировкой",()=>{
 const draft=awaiting("2026-08-19","cancelled-session");
 const cancelled=service.cancelWorkoutDraft({id:draft.id,expectedStatus:"awaiting_confirmation"});
 assert.equal(cancelled.ok,true);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get("2026-08-19") as any).n,0);
 assert.equal(workoutDoneFor("2026-08-19",{title:draft.snapshot.title,type:draft.snapshot.type}),false);
});

test("завершение (подтверждение) создаёт ровно один workout_log и только тогда тренировка считается выполненной",()=>{
 const draft=awaiting("2026-08-12","finish-once");
 assert.equal(workoutDoneFor("2026-08-12",{title:draft.snapshot.title,type:draft.snapshot.type}),false);
 const saved=confirm(draft);
 assert.equal(saved.ok,true);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_logs WHERE date=?").get("2026-08-12") as any).n,1);
 assert.equal(workoutDoneFor("2026-08-12",{title:draft.snapshot.title,type:draft.snapshot.type}),true);
});
