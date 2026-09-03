// AI-16 — automatic confirmation of a fresh imported activity against the
// already-resolved shared schedule. Imports never choose a plan version or a
// calendar on their own.
import { db } from "@/lib/db";
import { rankActivityMatches, type ActivityMatch } from "@/lib/activity-matcher";
import { buildHomeWeek } from "@/app/personal-data";
import { changesByDateMap, resolvePlanForDate, sessionsForDay, weekRangeContaining } from "@/app/week-schedule-model";
import { startWorkoutDraft, finishWorkoutDraft, confirmWorkoutDraft } from "@/lib/active-workout-service";
import { buildSwimSnapshot } from "@/lib/swim/workout-engine";
import { getProgram } from "@/lib/swim/program-engine";
import { resolveScheduledSwimWorkout } from "@/lib/swim/services";
import { listWeekScheduleChanges } from "@/lib/week-schedule-service";
import { getTrainingPlanCycles } from "@/lib/training-plan-activation";
import { trainingPlanCycleForDate } from "@/lib/training-program/registry";
import type { TrainingPlanCycle } from "@/lib/training-program/types";

export type AutoConfirmSkip={confirmed:false;reason:string;match?:ActivityMatch|null};
export type AutoConfirmDone={confirmed:true;draftId:number;match:ActivityMatch};
export type AutoConfirmResult=AutoConfirmSkip|AutoConfirmDone;

export type ImportAutoConfirmPreview={
 importId:number;date:string|null;activityType:string|null;eligible:boolean;reason:string|null;match:ActivityMatch|null;
 programId:string|null;programVersion:number|null;cycleId:number|null;sessionId:string|null;scheduledTitle:string|null;
 origin:"original"|"scheduled"|null;scheduledFor:string|null;changeId:number|null;changeReasonCode:string;
 existingWorkoutConflict:boolean;
};

type ImportRow={id:number;startedAt:string;duration:number;activityType:string;draftId:number|null;reviewStatus:string;metadata:string};

const parse=(value:unknown):Record<string,any>=>{try{const p=JSON.parse(String(value??"{}"));return p&&typeof p==="object"?p:{}}catch{return {}}};
const skip=(reason:string,match:ActivityMatch|null=null):AutoConfirmSkip=>({confirmed:false,reason,match});

/** How fresh an import must be before any automatic write is considered. */
export const AUTO_CONFIRM_MAX_AGE_DAYS=3;

export function importLocalDate(startedAt:string,metadata:Record<string,any>):string|null{
 const fromMetadata=typeof metadata.localDate==="string"?metadata.localDate.slice(0,10):null;
 if(fromMetadata&&/^\d{4}-\d{2}-\d{2}$/.test(fromMetadata))return fromMetadata;
 const parsed=new Date(startedAt);
 return Number.isFinite(parsed.getTime())?parsed.toISOString().slice(0,10):null;
}

function planState(){
 const row=db.prepare("SELECT program_start programStart FROM profile WHERE id=1").get() as any;
 return {programStart:row?.programStart as string|undefined,cycles:getTrainingPlanCycles()};
}

function snapshotForSession(date:string,session:any,cycle:TrainingPlanCycle,changed:boolean,changeId:number|null,changeReasonCode:string):Record<string,any>|null{
 if(session.discipline==="swim"){
  const slot=resolveScheduledSwimWorkout(date);
  if(!slot||slot.kind!=="workout")return null;
  const program=getProgram(slot.programId);
  if(!program)return null;
  const snapshot=buildSwimSnapshot(program,slot.workout,cycle) as any;
  return snapshot?{...snapshot,origin:changed?"scheduled":"original",scheduledFor:date,scheduleChangeId:changeId,changeReasonCode}:null;
 }
 if(!Array.isArray(session.exercises)||!session.exercises.length)return null;
 return {
  title:session.title,type:session.type,rounds:session.rounds??1,
  origin:changed?"scheduled":"original",
  scheduledFor:date,
  scheduleChangeId:changeId,programIdentity:session.programIdentity,
  changeReasonCode,
  exercises:session.exercises.map((exercise:any[])=>({name:exercise[0],target:exercise[2],recommendedWeight:0})),
 };
}

class AbortAutoConfirm extends Error{}

type ImportAnalysis={
 preview:ImportAutoConfirmPreview;row:ImportRow|null;metadata:Record<string,any>;cycle:TrainingPlanCycle|null;
 session:any|null;snapshot:Record<string,any>|null;
};

function analyzeImport(importId:number,now=new Date(),includeHistoricalAnalysis=false):ImportAnalysis{
 const base=(over:Partial<ImportAutoConfirmPreview>={}):ImportAutoConfirmPreview=>({
  importId,date:null,activityType:null,eligible:false,reason:null,match:null,
  programId:null,programVersion:null,cycleId:null,sessionId:null,scheduledTitle:null,
  origin:null,scheduledFor:null,changeId:null,changeReasonCode:"",existingWorkoutConflict:false,...over,
 });
 const done=(preview:ImportAutoConfirmPreview,row:ImportRow|null=null,metadata:Record<string,any>={},cycle:TrainingPlanCycle|null=null,session:any|null=null,snapshot:Record<string,any>|null=null):ImportAnalysis=>
  ({preview,row,metadata,cycle,session,snapshot});
 const row=db.prepare("SELECT id,started_at startedAt,duration_seconds duration,activity_type activityType,draft_id draftId,review_status reviewStatus,metadata FROM workout_imports WHERE id=?").get(importId) as ImportRow|undefined;
 if(!row)return done(base({reason:"импорт не найден"}));
 const withRow=(over:Partial<ImportAutoConfirmPreview>={})=>base({activityType:row.activityType,...over});
 if(row.draftId!==null)return done(withRow({reason:"импорт уже связан с тренировкой"}),row);
 if(row.reviewStatus==="dismissed")return done(withRow({reason:"импорт отклонён владельцем"}),row);

 const metadata=parse(row.metadata);
 const date=importLocalDate(row.startedAt,metadata);
 if(!date)return done(withRow({reason:"не удалось определить дату тренировки"}),row,metadata);
 const withDate=(over:Partial<ImportAutoConfirmPreview>={})=>withRow({date,...over});

 const {programStart,cycles}=planState();
 if(!programStart)return done(withDate({reason:"план не настроен"}),row,metadata);
 const ageDays=Math.floor((now.getTime()-new Date(`${date}T00:00:00Z`).getTime())/86_400_000);
 const historicalReason=ageDays>AUTO_CONFIRM_MAX_AGE_DAYS?`тренировка старше ${AUTO_CONFIRM_MAX_AGE_DAYS} дн. — только ручное подтверждение`:null;
 if(historicalReason&&!includeHistoricalAnalysis)return done(withDate({reason:historicalReason}),row,metadata);
 const cycle=trainingPlanCycleForDate(cycles,date);
 if(!cycle){
  if(!includeHistoricalAnalysis)return done(withDate({reason:"на дату импорта нет однозначного цикла плана"}),row,metadata);
  // Historical preview is deliberately broader than auto-confirm: before
  // cycle history existed, show the immutable legacy calendar as a hint, but
  // never manufacture a cycle identity or a writable snapshot for it.
  const {mondayIso,sundayIso}=weekRangeContaining(date);
  const changes=changesByDateMap(listWeekScheduleChanges(mondayIso,sundayIso));
  const resolved=resolvePlanForDate(date,buildHomeWeek(programStart,[],date),changes);
  const sessions=sessionsForDay(resolved.scheduled).filter((session:any)=>session.discipline&&session.discipline!=="recovery");
  const sameDiscipline=sessions.filter((session:any)=>session.discipline===row.activityType);
  const session=sameDiscipline.length===1?sameDiscipline[0]:null;
  const conflict=session?Boolean(db.prepare("SELECT 1 FROM workout_logs WHERE date=? AND title=? LIMIT 1").get(date,String(session.title))):false;
  return done(withDate({
   origin:resolved.changed?"scheduled":"original",scheduledFor:resolved.scheduledFor,
   changeId:resolved.changeId,changeReasonCode:resolved.reasonCode,
   sessionId:session?.programIdentity?.sessionId??session?.id??null,scheduledTitle:session?.title??null,
   existingWorkoutConflict:conflict,
   reason:session
    ?`${historicalReason??"исторический импорт"}; цикл ещё не зафиксирован — только preview`
    :sameDiscipline.length>1?"в историческом плане несколько слотов этой дисциплины — нужен ручной выбор"
    :`в историческом плане на ${date} нет тренировки дисциплины «${row.activityType}»`,
  }),row,metadata,null,session);
 }
 const withCycle=(over:Partial<ImportAutoConfirmPreview>={})=>withDate({programId:cycle.programId,programVersion:cycle.programVersion,cycleId:cycle.id,...over});
 if(cycle.endedAt!==null&&!includeHistoricalAnalysis)return done(withCycle({reason:"дата относится к архивному циклу — только ручное подтверждение"}),row,metadata,cycle);

 const {mondayIso,sundayIso}=weekRangeContaining(date);
 const changes=changesByDateMap(listWeekScheduleChanges(mondayIso,sundayIso));
 const resolved=resolvePlanForDate(date,buildHomeWeek(programStart,cycles,date),changes);
 const sessions=sessionsForDay(resolved.scheduled).filter((session:any)=>session.discipline&&session.discipline!=="recovery");
 const resolvedFields={origin:resolved.changed?"scheduled" as const:"original" as const,scheduledFor:resolved.scheduledFor,changeId:resolved.changeId,changeReasonCode:resolved.reasonCode};
 if(!sessions.length)return done(withCycle({...resolvedFields,reason:"на эту дату нет плановой тренировки"}),row,metadata,cycle);

 const matches=rankActivityMatches({
  activityType:row.activityType,startedAt:row.startedAt,durationSeconds:Number(row.duration),
  distanceMeters:Number.isFinite(Number(metadata.distanceMeters))?Number(metadata.distanceMeters):null,
  subtype:typeof metadata.fitSport==="string"?metadata.fitSport:null,localDate:date,
 },sessions.map((session:any,index:number)=>({
  id:index,date,activityType:session.discipline,title:session.title,
  startedAt:null,durationSeconds:null,distanceMeters:null,subtype:session.role??null,
 })));
 const best=matches[0]??null;

 const sameDiscipline=sessions.filter((session:any)=>session.discipline===row.activityType);
 if(!sameDiscipline.length)return done(withCycle({...resolvedFields,reason:`в плане на ${date} нет тренировки дисциплины «${row.activityType}»`,match:best}),row,metadata,cycle);
 if(sameDiscipline.length>1)return done(withCycle({...resolvedFields,reason:"в плане несколько тренировок этой дисциплины — нужен ручной выбор",match:best}),row,metadata,cycle);
 if(!best)return done(withCycle({...resolvedFields,reason:"не удалось сопоставить импорт с планом"}),row,metadata,cycle);
 const session=sameDiscipline[0];
 const existingWorkoutConflict=Boolean(db.prepare("SELECT 1 FROM workout_logs WHERE date=? AND title=? LIMIT 1").get(date,String(session.title??"")));
 const sessionFields={...resolvedFields,match:best,sessionId:session.programIdentity?.sessionId??session.id??null,scheduledTitle:session.title??null,existingWorkoutConflict};

 const plannedMinutes=Number(String(session.time??"").match(/\d+/)?.[0]??0);
 const actualMinutes=Number(row.duration)/60;
 if(actualMinutes<5)return done(withCycle({...sessionFields,reason:`тренировка слишком короткая (${Math.round(actualMinutes)} мин)`}),row,metadata,cycle,session);
 if(plannedMinutes>0&&actualMinutes<plannedMinutes*0.5)
  return done(withCycle({...sessionFields,reason:`длительность ${Math.round(actualMinutes)} мин против плановых ${plannedMinutes} — нужен ручной разбор`}),row,metadata,cycle,session);
 const snapshot=snapshotForSession(date,session,cycle,resolved.changed,resolved.changeId,resolved.reasonCode);
 if(!snapshot)return done(withCycle({...sessionFields,reason:"плановый слот не разрешён однозначно"}),row,metadata,cycle,session);
 const readOnlyReason=cycle.endedAt!==null?"дата относится к архивному циклу — только ручное подтверждение":historicalReason;
 // Конфликт проверяется по тому названию, под которым запись действительно
 // появится в истории. У плавания заголовок snapshot отличается от названия
 // планового слота, и проверка по слоту молча пропускала бы дубль.
 const writeTitle=String(snapshot.title??session.title??"");
 const snapshotConflict=Boolean(db.prepare("SELECT 1 FROM workout_logs WHERE date=? AND title=? LIMIT 1").get(date,writeTitle));
 return done(withCycle({...sessionFields,existingWorkoutConflict:snapshotConflict,eligible:readOnlyReason===null,reason:readOnlyReason}),row,metadata,cycle,session,snapshot);
}

/** Read-only explanation for one import. It never creates or links a draft. */
export function previewImportAutoConfirm(importId:number,now=new Date()):ImportAutoConfirmPreview{
 return analyzeImport(importId,now).preview;
}

/** Read-only queue for historical imports that are intentionally excluded from auto-confirm. */
export function previewHistoricalImports(now=new Date(),limit=50):ImportAutoConfirmPreview[]{
 const ids=db.prepare(`SELECT id FROM workout_imports
  WHERE draft_id IS NULL AND review_status!='dismissed' ORDER BY started_at DESC,id DESC LIMIT ?`).all(Math.max(1,Math.min(200,limit))) as {id:number}[];
 return ids.map(({id})=>analyzeImport(id,now,true).preview).filter(item=>
  item.date!==null&&Math.floor((now.getTime()-new Date(`${item.date}T00:00:00Z`).getTime())/86_400_000)>AUTO_CONFIRM_MAX_AGE_DAYS,
 );
}

/**
 * Shared write path for both the automatic and the manual decision: draft →
 * finish → confirm, never a direct INSERT into `workout_logs`. The caller
 * decides whether an open cycle is required; the identity of the cycle the
 * preview was built on is re-checked inside the transaction either way.
 */
function commitImportAsWorkout(analysis:ImportAnalysis,{requireOpenCycle}:{requireOpenCycle:boolean}):AutoConfirmResult{
 const {preview,row,metadata,cycle,session,snapshot}=analysis;
 if(!row||!cycle||!session||!snapshot)return skip(preview.reason??"импорт не готов к подтверждению",preview.match);
 const date=preview.date!;
 const best=preview.match!;

 try{
  return db.transaction(():AutoConfirmResult=>{
   const cycleRow=db.prepare(`SELECT ended_at endedAt FROM training_plan_cycles
    WHERE id=? AND program_id=? AND program_version=?`).get(cycle.id,cycle.programId,cycle.programVersion) as {endedAt:string|null}|undefined;
   if(!cycleRow)throw new AbortAutoConfirm("цикл плана изменился — нужен новый разбор");
   if(requireOpenCycle&&cycleRow.endedAt!==null)throw new AbortAutoConfirm("активный цикл изменился — нужен новый разбор");
   if(!requireOpenCycle&&cycleRow.endedAt!==cycle.endedAt)throw new AbortAutoConfirm("границы цикла изменились — нужен новый разбор");
   const existing=db.prepare("SELECT 1 FROM workout_logs WHERE date=? AND title=? LIMIT 1").get(date,String(snapshot.title??session.title));
   if(existing)throw new AbortAutoConfirm("тренировка на эту дату уже подтверждена");

   const started=startWorkoutDraft({date,snapshot}) as any;
   if(!started.ok||!started.draft)throw new AbortAutoConfirm(`не удалось создать черновик: ${started.error??"неизвестно"}`);
   const draftId=Number(started.draft.id);
   if(started.draft.status!=="active")throw new AbortAutoConfirm("черновик уже в работе — оставляем ручное подтверждение");

   const linked=db.prepare("UPDATE workout_imports SET draft_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND draft_id IS NULL")
    .run(draftId,row.id).changes;
   if(linked!==1)throw new AbortAutoConfirm("импорт уже обрабатывается");
   const finished=finishWorkoutDraft({id:draftId,expectedStatus:"active"}) as any;
   if(!finished.ok)throw new AbortAutoConfirm(`не удалось завершить черновик: ${finished.error??"неизвестно"}`);
   const confirmed=confirmWorkoutDraft({
    id:draftId,expectedStatus:"awaiting_confirmation",
    ...(Number.isFinite(Number(metadata.distanceMeters))&&Number(metadata.distanceMeters)>0?{distanceMeters:Number(metadata.distanceMeters)}:{}),
   }) as any;
   if(!confirmed.ok)throw new AbortAutoConfirm(`не удалось подтвердить: ${confirmed.error??"неизвестно"}`);
   return {confirmed:true,draftId,match:best};
  })();
 }catch(error){
  if(error instanceof AbortAutoConfirm)return skip(error.message,best);
  throw error;
 }
}

export function autoConfirmImport(importId:number):AutoConfirmResult{
 const analysis=analyzeImport(importId,new Date());
 if(!analysis.preview.eligible)return skip(analysis.preview.reason??"импорт не готов к автоподтверждению",analysis.preview.match);
 return commitImportAsWorkout(analysis,{requireOpenCycle:true});
}

/**
 * Manual review of a historical import. The owner takes the decision the age
 * gate deliberately refuses to take, so the freshness and the archived-cycle
 * checks no longer apply — but the slot still has to be unambiguous. A date
 * without a recorded cycle has no writable identity and stays preview-only.
 */
export function confirmHistoricalImport(importId:number,now=new Date()):AutoConfirmResult{
 const analysis=analyzeImport(importId,now,true);
 const {preview}=analysis;
 if(!analysis.cycle||!analysis.session||!analysis.snapshot)
  return skip(preview.reason??"у импорта нет однозначного планового слота",preview.match);
 if(preview.existingWorkoutConflict)return skip("на эту дату уже есть тренировка с таким названием",preview.match);
 return commitImportAsWorkout(analysis,{requireOpenCycle:false});
}

/** The owner says this import should never become a workout. */
export function dismissHistoricalImport(importId:number):{ok:true}|{ok:false;error:string;status:number}{
 const row=db.prepare("SELECT draft_id draftId FROM workout_imports WHERE id=?").get(importId) as {draftId:number|null}|undefined;
 if(!row)return {ok:false,error:"Импорт не найден",status:404};
 if(row.draftId!==null)return {ok:false,error:"Импорт уже связан с тренировкой",status:409};
 db.prepare("UPDATE workout_imports SET review_status='dismissed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND draft_id IS NULL").run(importId);
 return {ok:true};
}
