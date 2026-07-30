import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { saveWorkout, type ActionResult } from "@/lib/workout-service";

const dateOk=(x:unknown)=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const text=(x:unknown,max=160)=>typeof x==="string"?x.trim().slice(0,max):"";
const finite=(x:unknown,min:number,max:number)=>{const n=Number(x);return Number.isFinite(n)&&n>=min&&n<=max?n:null};
export type DraftStatus="planned"|"active"|"awaiting_confirmation"|"completed"|"cancelled";
export type SnapshotExercise={name:string;order:number;target:string;recommendedWeight:number;sets:number|null;repMin:number|null;repMax:number|null;unit:string};
export type WorkoutSnapshot={title:string;type:string;rounds:number;exercises:SnapshotExercise[]};
export type WorkoutDraft={id:number;date:string;planKey:string;status:DraftStatus;snapshot:WorkoutSnapshot;startedAt:string|null;finishedAt:string|null;confirmedAt:string|null;cancelledAt:string|null;workoutId:number|null};

function parseTarget(target:string){
 const normalized=target.replace(/[–—]/g,"-");
 const setsMatch=normalized.match(/(\d+)(?:\s*-\s*\d+)?\s*[×xх]/i);
 const values=[...normalized.matchAll(/\d+/g)].map(m=>Number(m[0]));
 const after=setsMatch?normalized.slice((setsMatch.index||0)+setsMatch[0].length):normalized;
 const reps=[...after.matchAll(/\d+/g)].map(m=>Number(m[0]));
 const unit=/сек/i.test(target)?"сек":/мин/i.test(target)?"мин":/м(?:\s|$)/i.test(target)?"м":"повт.";
 return {sets:setsMatch?values[0]:null,repMin:reps[0]??null,repMax:reps[1]??reps[0]??null,unit};
}

export function normalizeSnapshot(raw:any):WorkoutSnapshot|null{
 const title=text(raw?.title),type=text(raw?.type,40),rounds=finite(raw?.rounds??1,1,20);
 if(!title||!type||rounds===null||!Array.isArray(raw?.exercises)||raw.exercises.length<1||raw.exercises.length>100)return null;
 const exercises:SnapshotExercise[]=[];
 for(let i=0;i<raw.exercises.length;i++){
  const item=raw.exercises[i],name=text(item?.name),target=text(item?.target,120),weight=finite(item?.recommendedWeight??0,0,500);
  if(!name||!target||weight===null)return null;
  exercises.push({name,order:i,target,recommendedWeight:weight,...parseTarget(target)});
 }
 return {title,type,rounds,exercises};
}

export function planKey(snapshot:WorkoutSnapshot){
 return createHash("sha256").update(JSON.stringify({title:snapshot.title,type:snapshot.type,exercises:snapshot.exercises.map(x=>x.name)})).digest("hex").slice(0,32);
}
function rowToDraft(row:any):WorkoutDraft{
 return {...row,snapshot:JSON.parse(row.snapshot)};
}
const selectDraft=`SELECT id,date,plan_key planKey,status,snapshot,started_at startedAt,finished_at finishedAt,confirmed_at confirmedAt,cancelled_at cancelledAt,workout_id workoutId FROM workout_drafts`;

export function listWorkoutDrafts(date:string):WorkoutDraft[]{
 if(!dateOk(date))return [];
 return (db.prepare(`${selectDraft} WHERE date=? AND status!='cancelled' ORDER BY id DESC`).all(date) as any[]).map(rowToDraft);
}
export function listOpenWorkoutDrafts():WorkoutDraft[]{
 return (db.prepare(`${selectDraft} WHERE status IN ('planned','active','awaiting_confirmation') ORDER BY id DESC LIMIT 20`).all() as any[]).map(rowToDraft);
}

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
 return {ok:true,draft:rowToDraft(db.prepare(`${selectDraft} WHERE id=?`).get(id))};
}
export const finishWorkoutDraft=(body:any)=>transition(body,"active","awaiting_confirmation","finished_at");
export function cancelWorkoutDraft(body:any){
 const status=body?.expectedStatus;
 if(status!=="active"&&status!=="awaiting_confirmation")return {ok:false,error:"Некорректный или устаревший запрос",status:400} as ActionResult;
 return transition(body,status,"cancelled","cancelled_at");
}

export function confirmWorkoutDraft(body:any):ActionResult&{draft?:WorkoutDraft}{
 const id=Number(body?.id);
 if(!Number.isSafeInteger(id)||id<1||body?.expectedStatus!=="awaiting_confirmation")return {ok:false,error:"Некорректный или устаревший запрос",status:400};
 let result:ActionResult&{draft?:WorkoutDraft}={ok:false,error:"Черновик не найден или уже изменён",status:409};
 db.transaction(()=>{
  const raw=db.prepare(`${selectDraft} WHERE id=? AND status='awaiting_confirmation'`).get(id);
  if(!raw)return;
  const draft=rowToDraft(raw);
  const duration=finite(body?.durationSeconds,0,86400);
  if(duration===null){result={ok:false,error:"Некорректная длительность",status:400};return}
  const details=draft.snapshot.exercises.flatMap(exercise=>Array.from({length:exercise.sets??1},(_,set)=>({
   key:`${set}-${exercise.order}`,name:exercise.name,originalName:exercise.name,
   value:exercise.repMin??0,weight:exercise.recommendedWeight,difficulty:"Нормально",unit:exercise.unit,
  })));
  const saved=saveWorkout({date:draft.date,title:draft.snapshot.title,type:draft.snapshot.type,rounds:draft.snapshot.rounds,
   completed:details.map(x=>x.key),details,durationSeconds:duration,restSeconds:0,effort:body?.effort??"Нормально",painAfter:body?.painAfter??0});
  if(!saved.ok){result=saved;return}
  const workoutId=saved.workoutId!;
  db.prepare("UPDATE workout_drafts SET status='completed',confirmed_at=CURRENT_TIMESTAMP,workout_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='awaiting_confirmation'").run(workoutId,id);
  result={ok:true,draft:rowToDraft(db.prepare(`${selectDraft} WHERE id=?`).get(id))};
 })();
 return result;
}
