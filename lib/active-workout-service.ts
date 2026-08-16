import { db } from "@/lib/db";
import { saveWorkout, WORKOUT_DETAIL_SOURCES, type ActionResult, type WorkoutDetailSource } from "@/lib/workout-service";
import { normalizeSnapshot, type SnapshotExercise, type WorkoutSnapshot, type WorkoutSnapshotOrigin } from "@/lib/workout-snapshot";
import { planKey } from "@/lib/plan-key";
import { CYCLING_LOAD_FEEDBACK_VALUES, type CyclingLoadFeedback } from "@/lib/cycling";

// normalizeSnapshot/planKey и связанные типы теперь определены в
// lib/workout-snapshot.ts (pure) и lib/plan-key.ts (node:crypto) — см. их
// шапки. Реэкспорт сохраняет прежний путь импорта для всего остального кода.
export { normalizeSnapshot, planKey };
export type { SnapshotExercise, WorkoutSnapshot, WorkoutSnapshotOrigin };

const EFFORT_VALUES=["Легко","Нормально","Тяжело","Боль"] as const;
const isValidSource=(value:unknown):value is WorkoutDetailSource=>(WORKOUT_DETAIL_SOURCES as readonly string[]).includes(value as string);

const dateOk=(x:unknown)=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const text=(x:unknown,max=160)=>typeof x==="string"?x.trim().slice(0,max):"";
const finite=(x:unknown,min:number,max:number)=>{const n=Number(x);return Number.isFinite(n)&&n>=min&&n<=max?n:null};
export type DraftStatus="planned"|"active"|"awaiting_confirmation"|"completed"|"cancelled";
export type ExerciseResultSet={weight:number;reps:number};
export type DraftConfirmation={
 source:"Garmin"|"Manual";duration:number;averageHeartRate:number|null;maxHeartRate:number|null;calories:number|null;
 distanceMeters:number|null;averageSpeed:number|null;
 lastResults:Record<string,ExerciseResultSet[]>;
};
export type WorkoutDraft={id:number;date:string;planKey:string;status:DraftStatus;snapshot:WorkoutSnapshot;startedAt:string|null;finishedAt:string|null;confirmedAt:string|null;cancelledAt:string|null;workoutId:number|null;confirmation?:DraftConfirmation};

function rowToDraft(row:any):WorkoutDraft{
 return {...row,snapshot:JSON.parse(row.snapshot)};
}
const selectDraft=`SELECT id,date,plan_key planKey,status,snapshot,started_at startedAt,finished_at finishedAt,confirmed_at confirmedAt,cancelled_at cancelledAt,workout_id workoutId FROM workout_drafts`;

export function listWorkoutDrafts(date:string):WorkoutDraft[]{
 if(!dateOk(date))return [];
 return (db.prepare(`${selectDraft} WHERE date=? AND status!='cancelled' ORDER BY id DESC`).all(date) as any[]).map(rowToDraft);
}
export function listOpenWorkoutDrafts():WorkoutDraft[]{
 return (db.prepare(`${selectDraft} WHERE status IN ('planned','active','awaiting_confirmation') ORDER BY id DESC LIMIT 20`).all() as any[]).map(row=>{
  const draft=rowToDraft(row);
  return draft.status==="awaiting_confirmation"?withConfirmation(draft):draft;
 });
}

const parseArray=(value:unknown)=>{try{const parsed=JSON.parse(String(value??"[]"));return Array.isArray(parsed)?parsed:[]}catch{return []}};
function lastResultsFor(draft:WorkoutDraft){
 const wanted=new Set(draft.snapshot.exercises.map(item=>item.name)),found:Record<string,ExerciseResultSet[]>={};
 const workouts=db.prepare("SELECT details FROM workout_logs WHERE date<=? ORDER BY date DESC,id DESC LIMIT 200").all(draft.date) as {details:string}[];
 for(const workout of workouts){
  const grouped=new Map<string,ExerciseResultSet[]>();
  for(const detail of parseArray(workout.details)){
   const name=String(detail?.originalName??detail?.name??"");
   if(wanted.has(name)&&!detail?.skipped)grouped.set(name,[...(grouped.get(name)??[]),{weight:Number(detail.weight)||0,reps:Number(detail.value)||0}]);
  }
  for(const [name,sets] of grouped)if(!found[name])found[name]=sets;
  if(Object.keys(found).length===wanted.size)break;
 }
 return found;
}
function withConfirmation(draft:WorkoutDraft):WorkoutDraft{
 const imported=db.prepare(`SELECT duration_seconds duration,average_heart_rate averageHeartRate,max_heart_rate maxHeartRate,calories,metadata
  FROM workout_imports WHERE draft_id=? ORDER BY id DESC LIMIT 1`).get(draft.id) as any;
 const importedMetadata=parseMetadata(imported?.metadata);
 const manualDuration=draft.startedAt&&draft.finishedAt?Math.max(0,Math.round((dbDate(draft.finishedAt)-dbDate(draft.startedAt))/1000)):0;
 const importedDistance=finite(importedMetadata.distanceMeters,0,1000000);
 const averageSpeed=importedDistance!==null&&Number(imported?.duration)>0?(importedDistance/1000)/(Number(imported.duration)/3600):null;
 return {...draft,confirmation:{
  source:imported?"Garmin":"Manual",duration:imported?.duration??manualDuration,
  averageHeartRate:imported?.averageHeartRate??null,maxHeartRate:imported?.maxHeartRate??null,calories:imported?.calories??null,
  distanceMeters:importedDistance,averageSpeed,
  lastResults:lastResultsFor(draft),
 }};
}
const dbDate=(value:string)=>new Date(`${value.replace(" ","T")}Z`).getTime();
const parseMetadata=(value:unknown):Record<string,any>=>{try{const parsed=JSON.parse(String(value??"{}"));return parsed&&typeof parsed==="object"?parsed:{}}catch{return {}}};

export function startWorkoutDraft(body:any):ActionResult&{draft?:WorkoutDraft}{
 if(!dateOk(body?.date))return {ok:false,error:"Некорректная дата",status:400};
 const snapshot=normalizeSnapshot(body?.snapshot);
 if(!snapshot)return {ok:false,error:"Некорректный план тренировки",status:400};
 const key=planKey(snapshot);
 const existing=db.prepare(`${selectDraft} WHERE date=? AND plan_key=? AND status IN ('planned','active','awaiting_confirmation') ORDER BY id DESC LIMIT 1`).get(body.date,key);
 if(existing)return {ok:true,draft:rowToDraft(existing)};
 try{
  const id=db.transaction(()=>{
   const created=db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES (?,?, 'planned',?)").run(body.date,key,JSON.stringify(snapshot)).lastInsertRowid;
   db.prepare("UPDATE workout_drafts SET status='active',started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='planned'").run(created);
   return Number(created);
  })();
  return {ok:true,draft:rowToDraft(db.prepare(`${selectDraft} WHERE id=?`).get(id))};
 }catch(error){
  if(String(error).includes("UNIQUE")){
   const concurrent=db.prepare(`${selectDraft} WHERE date=? AND plan_key=? AND status IN ('planned','active','awaiting_confirmation') ORDER BY id DESC LIMIT 1`).get(body.date,key);
   if(concurrent)return {ok:true,draft:rowToDraft(concurrent)};
  }
  throw error;
 }
}

function transition(body:any,from:DraftStatus,to:DraftStatus,column:string):ActionResult&{draft?:WorkoutDraft}{
 const id=Number(body?.id);
 if(!Number.isSafeInteger(id)||id<1||body?.expectedStatus!==from)return {ok:false,error:"Некорректный или устаревший запрос",status:400};
 const changed=db.prepare(`UPDATE workout_drafts SET status=?,${column}=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?`).run(to,id,from).changes;
 if(!changed)return {ok:false,error:"Черновик не найден или уже изменён",status:409};
 const draft=rowToDraft(db.prepare(`${selectDraft} WHERE id=?`).get(id));
 return {ok:true,draft:to==="awaiting_confirmation"?withConfirmation(draft):draft};
}
export const finishWorkoutDraft=(body:any)=>transition(body,"active","awaiting_confirmation","finished_at");
export function cancelWorkoutDraft(body:any):ActionResult&{draft?:WorkoutDraft}{
 const status=body?.expectedStatus;
 if(status!=="active"&&status!=="awaiting_confirmation")return {ok:false,error:"Некорректный или устаревший запрос",status:400} as ActionResult;
 const cancelled=transition(body,status,"cancelled","cancelled_at");
 if(cancelled.ok||cancelled.status!==409)return cancelled;
 // Отмена — идемпотентное terminal action. Это важно для повторного клика или
 // retry после потерянного ответа: уже отменённый draft остаётся отменённым и
 // не превращается в workout_log. Completed и любые другие состояния по-
 // прежнему дают conflict и никогда не затрагиваются.
 const id=Number(body?.id);
 const row=Number.isSafeInteger(id)&&id>0?db.prepare(`${selectDraft} WHERE id=?`).get(id):null;
 if(!row)return cancelled;
 const draft=rowToDraft(row);
 return draft.status==="cancelled"?{ok:true,draft}:cancelled;
}

export type ConfirmedExerciseSummary={name:string;source:WorkoutDetailSource;setCount:number};
export type ConfirmationSummary={
 workoutId:number;duration:number;effort:string;painAfter:number;loadFeedback:CyclingLoadFeedback;
 metricsSource:"manual"|"imported_metric";confirmationSource:"Garmin"|"Manual";
 averageHeartRate:number|null;maxHeartRate:number|null;calories:number|null;distanceMeters:number|null;averageSpeed:number|null;
 exercises:ConfirmedExerciseSummary[];
};

export function confirmWorkoutDraft(body:any):ActionResult&{draft?:WorkoutDraft;summary?:ConfirmationSummary}{
 const id=Number(body?.id);
 if(!Number.isSafeInteger(id)||id<1||body?.expectedStatus!=="awaiting_confirmation")return {ok:false,error:"Некорректный или устаревший запрос",status:400};
 // Effort/painAfter проверяются сервером по единому контракту подтверждения:
 // валидный набор значений сложности и граница боли 0–10.
 if(body?.effort!==undefined&&!EFFORT_VALUES.includes(body.effort))return {ok:false,error:"Некорректная оценка сложности",status:400};
 if(body?.painAfter!==undefined&&finite(body.painAfter,0,10)===null)return {ok:false,error:"Некорректное значение боли",status:400};
 if(body?.loadFeedback!==undefined&&!(CYCLING_LOAD_FEEDBACK_VALUES as readonly string[]).includes(body.loadFeedback))return {ok:false,error:"Некорректная оценка переносимости нагрузки",status:400};
 // VOLT Swim Sprint 2 — плановая дистанция приходит из программы (не из FIT,
 // см. lib/swim/workout-engine.ts), поэтому подтверждается вместе с формой, а
 // не выводится задним числом. distanceMeters опционален — силовые/прочие
 // тренировки его не передают и получают прежнее distance_meters=0.
 if(body?.distanceMeters!==undefined&&finite(body.distanceMeters,0,1000000)===null)return {ok:false,error:"Некорректная дистанция",status:400};
 if(body?.avgHeartRate!==undefined&&finite(body.avgHeartRate,20,250)===null)return {ok:false,error:"Некорректный средний пульс",status:400};
 if(body?.maxHeartRate!==undefined&&finite(body.maxHeartRate,20,250)===null)return {ok:false,error:"Некорректный максимальный пульс",status:400};
 if(body?.calories!==undefined&&finite(body.calories,0,10000)===null)return {ok:false,error:"Некорректные калории",status:400};
 if(body?.avgSpeed!==undefined&&finite(body.avgSpeed,0,200)===null)return {ok:false,error:"Некорректная средняя скорость",status:400};
 if(body?.notes!==undefined&&typeof body.notes!=="string")return {ok:false,error:"Некорректная заметка",status:400};
 let result:ActionResult&{draft?:WorkoutDraft;summary?:ConfirmationSummary}={ok:false,error:"Черновик не найден или уже изменён",status:409};
 db.transaction(()=>{
  const raw=db.prepare(`${selectDraft} WHERE id=? AND status='awaiting_confirmation'`).get(id);
  if(!raw)return;
  const draft=rowToDraft(raw);
  const imported=db.prepare("SELECT duration_seconds duration,average_heart_rate averageHeartRate,max_heart_rate maxHeartRate,calories,metadata FROM workout_imports WHERE draft_id=? ORDER BY id DESC LIMIT 1").get(id) as any;
  const importedMetadata=parseMetadata(imported?.metadata);
  const duration=finite(imported?.duration??body?.durationSeconds,0,86400);
  if(duration===null){result={ok:false,error:"Некорректная длительность",status:400};return}
  const submitted=Array.isArray(body?.exercises)?body.exercises:draft.snapshot.exercises.map(exercise=>({name:exercise.name,sets:Array.from({length:exercise.sets??1},()=>({weight:exercise.recommendedWeight,reps:exercise.repMin??0})),skipped:false,added:false,source:"confirmed_as_planned" as const}));
  if(submitted.length<1||submitted.length>100){result={ok:false,error:"Некорректные результаты упражнений",status:400};return}
  const snapshotNames=new Set(draft.snapshot.exercises.map(x=>x.name)),details:any[]=[],exerciseSummaries:ConfirmedExerciseSummary[]=[];
  for(let order=0;order<submitted.length;order++){
   const exercise=submitted[order],name=text(exercise?.name),added=exercise?.added===true;
   if(!name||(!added&&!snapshotNames.has(name))||!Array.isArray(exercise?.sets)||exercise.sets.length<1||exercise.sets.length>20){result={ok:false,error:"Некорректное упражнение",status:400};return}
   // Происхождение результата сохраняется в самих деталях тренировки (WorkoutDetail.source),
   // а не только во временном состоянии формы — иначе после сохранения его было бы не отличить
   // "подтверждено по плану" от "изменено вручную". Явный некорректный source — ошибка запроса;
   // отсутствующий — выводим из added/skipped (см. lib/workout-service.ts normalizeDetailSource).
   if(exercise?.source!==undefined&&!isValidSource(exercise.source)){result={ok:false,error:"Некорректное происхождение результата",status:400};return}
   const source:WorkoutDetailSource=isValidSource(exercise?.source)?exercise.source:(exercise.skipped===true?"skipped":added?"added":"confirmed_as_planned");
   if(exercise.skipped===true){
    details.push({key:`skip-${order}`,name,originalName:name,value:0,weight:0,difficulty:"Нормально",unit:"повт.",skipped:true,added,source:"skipped"});
    exerciseSummaries.push({name,source:"skipped",setCount:0});
    continue;
   }
   for(let set=0;set<exercise.sets.length;set++){
    const weight=finite(exercise.sets[set]?.weight,0,500),reps=finite(exercise.sets[set]?.reps,0,100000);
    if(weight===null||reps===null){result={ok:false,error:"Некорректный вес или повторы",status:400};return}
    details.push({key:`${order}-${set}`,name,originalName:name,value:reps,weight,difficulty:"Нормально",unit:"повт.",skipped:false,added,source});
   }
   exerciseSummaries.push({name,source,setCount:exercise.sets.length});
  }
  if(result.ok===false&&result.status===400)return;
  // FIT сам по себе не является источником веса/повторов/факта выполнения —
  // imported задаёт только метрики тренировки (пульс/калории/длительность),
  // details.source выше от него не зависит.
  const metricsSource=imported?"imported_metric":"manual";
  const effort=EFFORT_VALUES.includes(body?.effort)?body.effort:"Нормально";
  const painAfter=finite(body?.painAfter,0,10)??0;
  const loadFeedback:CyclingLoadFeedback=(CYCLING_LOAD_FEEDBACK_VALUES as readonly string[]).includes(body?.loadFeedback)?body.loadFeedback:"";
  const averageHeartRate=finite(imported?.averageHeartRate??body?.avgHeartRate,20,250);
  const maxHeartRate=finite(imported?.maxHeartRate??body?.maxHeartRate,20,250);
  const calories=finite(imported?.calories??body?.calories,0,10000);
  const distanceMeters=finite(importedMetadata.distanceMeters??body?.distanceMeters,0,1000000);
  const averageSpeed=finite(body?.avgSpeed,0,200)??(distanceMeters!==null&&duration>0?(distanceMeters/1000)/(duration/3600):null);
  const notes=typeof body?.notes==="string"?body.notes:"";
  const saved=saveWorkout({date:draft.date,title:draft.snapshot.title,type:draft.snapshot.type,rounds:draft.snapshot.rounds,
   completed:details.filter(x=>!x.skipped).map(x=>x.key),details,durationSeconds:duration,restSeconds:0,effort,painAfter,
   avgHeartRate:averageHeartRate,maxHeartRate,calories,metricsSource,
   distanceMeters,avgSpeed:averageSpeed,notes,loadFeedback});
  if(!saved.ok){result=saved;return}
  const workoutId=saved.workoutId!;
  db.prepare("UPDATE workout_drafts SET status='completed',confirmed_at=CURRENT_TIMESTAMP,workout_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='awaiting_confirmation'").run(workoutId,id);
  result={ok:true,draft:rowToDraft(db.prepare(`${selectDraft} WHERE id=?`).get(id)),summary:{
   workoutId,duration,effort,painAfter,loadFeedback,metricsSource,confirmationSource:imported?"Garmin":"Manual",
   averageHeartRate,maxHeartRate,calories,distanceMeters,averageSpeed,
   exercises:exerciseSummaries,
  }};
 })();
 return result;
}
