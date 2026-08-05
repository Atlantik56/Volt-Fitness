import { createHash } from "node:crypto";
import { Decoder, Stream } from "@garmin/fitsdk";
import type { FileIdMesg, LapMesg, SessionMesg } from "@garmin/fitsdk";
import { db } from "@/lib/db";

export const MAX_FIT_FILE_SIZE=10_000_000;
export type ImportSource="garmin_fit";
export type ActivityFamily="strength"|"swim"|"bike"|"cardio"|"recovery";
export type MatchConfidence="High"|"Medium"|"Low";
export type ImportedWorkout={
 source:ImportSource;
 externalId:string|null;
 fingerprint:string;
 startedAt:string;
 duration:number;
 activityType:ActivityFamily;
 averageHeartRate:number|null;
 maxHeartRate:number|null;
 calories:number|null;
 metadata:{averageCadence:number|null;trainingEffect:number|null;fitSport:string;distanceMeters:number|null;laps:FitLap[]};
};
// Отрезки (lapMesgs) FIT-файла — используются только для сопоставления
// фактических метров/времени со спланированными блоками тренировки Swim
// (см. lib/swim/fit-match.ts). Для не-swim активностей остаётся [].
export type FitLap={distanceMeters:number;durationSeconds:number;numLengths:number|null};
export type DraftCandidate={id:number;title:string;startedAt:string|null;finishedAt:string|null;confidence:MatchConfidence;reasons:string[]};
export type StoredImport={id:number;workout:ImportedWorkout;draftId:number|null;duplicate:boolean;autoLinked:boolean;candidates:DraftCandidate[]};
export type ImportFailure={ok:false;error:string;status:number};
export type ImportSuccess={ok:true;result:StoredImport};
export type ImportResponse=ImportFailure|ImportSuccess;

const finite=(value:unknown,min:number,max:number)=>{
 const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};
const asDate=(value:unknown)=>{
 const date=value instanceof Date?value:new Date(String(value??""));
 return Number.isFinite(date.getTime())?date:null;
};
const familyFor=(sport:unknown):ActivityFamily|null=>{
 const value=String(sport??"").toLowerCase().replace(/[^a-z]/g,"");
 if(["training","fitnessEquipment","strengthTraining"].map(x=>x.toLowerCase().replace(/[^a-z]/g,"")).includes(value))return "strength";
 if(value.includes("swim"))return "swim";
 if(value.includes("cycling")||value.includes("biking"))return "bike";
 if(["running","walking","hiking","rowing","elliptical","cardioTraining","generic"].map(x=>x.toLowerCase()).includes(value))return "cardio";
 if(["yoga","pilates","breathing"].includes(value))return "recovery";
 return null;
};

export function fingerprintFit(bytes:Uint8Array){
 return createHash("sha256").update(bytes).digest("hex");
}

export function validateFitUpload(name:string,size:number):ImportFailure|null{
 if(size===0)return {ok:false,error:"FIT-файл пуст",status:400};
 if(size>MAX_FIT_FILE_SIZE)return {ok:false,error:"FIT-файл больше 10 МБ",status:413};
 if(!/\.fit$/i.test(name))return {ok:false,error:"Поддерживаются только файлы .fit",status:415};
 return null;
}

export function parseFit(bytes:Uint8Array):ImportFailure|{ok:true;workout:ImportedWorkout}{
 if(bytes.byteLength===0)return {ok:false,error:"FIT-файл пуст",status:400};
 if(bytes.byteLength>MAX_FIT_FILE_SIZE)return {ok:false,error:"FIT-файл больше 10 МБ",status:413};
 try{
  const stream=Stream.fromByteArray(Array.from(bytes));
  if(!Decoder.isFIT(stream))return {ok:false,error:"Содержимое файла не является FIT",status:415};
  const decoder=new Decoder(stream);
  if(!decoder.checkIntegrity())return {ok:false,error:"FIT-файл повреждён: проверка целостности не пройдена",status:422};
  const {messages,errors}=decoder.read({includeUnknownData:false,convertDateTimesToDates:true});
  if(errors.length)return {ok:false,error:"FIT-файл повреждён или содержит неподдерживаемые данные",status:422};
  const session=(messages.sessionMesgs??[]).filter(item=>asDate(item.startTime)).sort((a,b)=>asDate(a.startTime)!.getTime()-asDate(b.startTime)!.getTime())[0] as SessionMesg|undefined;
  if(!session)return {ok:false,error:"В FIT-файле нет завершённой тренировочной сессии",status:422};
  const started=asDate(session.startTime),duration=finite(session.totalTimerTime??session.totalElapsedTime,1,172800),activityType=familyFor(session.sport);
  if(!started||duration===null)return {ok:false,error:"В FIT-файле нет корректного времени или длительности",status:422};
  if(!activityType)return {ok:false,error:`Тип активности FIT не поддерживается: ${String(session.sport??"неизвестно")}`,status:422};
  const fileId=(messages.fileIdMesgs??[])[0] as FileIdMesg|undefined;
  const externalParts=[fileId?.manufacturer,fileId?.product,fileId?.serialNumber,asDate(fileId?.timeCreated)?.toISOString()].filter(x=>x!==undefined&&x!==null&&x!=="");
  const integer=(value:unknown,min:number,max:number)=>{const n=finite(value,min,max);return n===null?null:Math.round(n)};
  const laps:FitLap[]=activityType==="swim"?(messages.lapMesgs??[])
   .filter((lap:LapMesg)=>finite(lap.totalDistance,0,100_000)!==null&&finite(lap.totalTimerTime??lap.totalElapsedTime,0,86_400)!==null)
   .map((lap:LapMesg)=>({
    distanceMeters:Math.round(finite(lap.totalDistance,0,100_000)!),
    durationSeconds:Math.round(finite(lap.totalTimerTime??lap.totalElapsedTime,0,86_400)!),
    numLengths:integer(lap.numLengths,0,10_000),
   })):[];
  return {ok:true,workout:{
   source:"garmin_fit",
   externalId:externalParts.length?externalParts.join(":").slice(0,240):null,
   fingerprint:fingerprintFit(bytes),
   startedAt:started.toISOString(),
   duration:Math.round(duration),
   activityType,
   averageHeartRate:integer(session.avgHeartRate,20,250),
   maxHeartRate:integer(session.maxHeartRate,20,250),
   calories:integer(session.totalCalories,0,20000),
   metadata:{
    averageCadence:finite(session.avgCadence??session.avgRunningCadence,0,500),
    trainingEffect:finite(session.totalTrainingEffect,0,10),
    fitSport:String(session.sport??""),
    distanceMeters:finite(session.totalDistance,0,1_000_000),
    laps,
   },
  }};
 }catch{
  return {ok:false,error:"FIT-файл повреждён или не может быть безопасно прочитан",status:422};
 }
}

type DraftRow={id:number;date:string;snapshot:string;startedAt:string|null;finishedAt:string|null};
const dbDate=(value:string|null)=>value?asDate(value.includes("T")?value:`${value.replace(" ","T")}Z`):null;
const draftFamily=(type:string,title:string):ActivityFamily=>{
 const value=`${type} ${title}`.toLowerCase();
 if(value.includes("плав"))return "swim";
 if(value.includes("вел"))return "bike";
 if(value.includes("сил"))return "strength";
 if(value.includes("восстанов")||value.includes("отдых"))return "recovery";
 return "cardio";
};

export function rankDrafts(workout:ImportedWorkout,rows:DraftRow[]):DraftCandidate[]{
 const start=new Date(workout.startedAt);
 return rows.map(row=>{
  let snapshot:any={};try{snapshot=JSON.parse(row.snapshot)}catch{}
  const reasons:string[]=[];
  const sameDate=row.date===workout.startedAt.slice(0,10);
  const sameType=draftFamily(String(snapshot.type??""),String(snapshot.title??""))===workout.activityType;
  const draftStart=dbDate(row.startedAt),draftFinish=dbDate(row.finishedAt);
  const startDiff=draftStart?Math.abs(start.getTime()-draftStart.getTime())/3_600_000:Infinity;
  const draftDuration=draftStart&&draftFinish?Math.max(1,(draftFinish.getTime()-draftStart.getTime())/1000):null;
  const durationRatio=draftDuration?Math.abs(workout.duration-draftDuration)/Math.max(workout.duration,draftDuration):Infinity;
  if(sameDate)reasons.push("та же дата");
  if(sameType)reasons.push("совпадает тип активности");
  if(startDiff<=2)reasons.push("близкое время старта");
  else if(startDiff<=6)reasons.push("время старта в пределах 6 часов");
  if(durationRatio<=.35)reasons.push("сопоставимая длительность");
  else if(durationRatio<=.75)reasons.push("длительность отличается");
  const high=sameDate&&sameType&&startDiff<=2&&durationRatio<=.35;
  const score=(sameDate?2:0)+(sameType?2:0)+(startDiff<=2?2:startDiff<=6?1:0)+(durationRatio<=.35?2:durationRatio<=.75?1:0);
  const confidence:MatchConfidence=high?"High":score>=4?"Medium":"Low";
  return {id:row.id,title:String(snapshot.title??"Тренировка"),startedAt:row.startedAt,finishedAt:row.finishedAt,confidence,reasons};
 }).sort((a,b)=>{
  const rank:Record<MatchConfidence,number>={High:3,Medium:2,Low:1};
  return rank[b.confidence]-rank[a.confidence]||b.reasons.length-a.reasons.length||b.id-a.id;
 });
}

function workoutFromRow(row:any):ImportedWorkout{
 const extra=JSON.parse(row.metadata||"{}");
 return {source:row.source,externalId:row.externalId,fingerprint:row.fingerprint,startedAt:row.startedAt,duration:row.duration,
  activityType:row.activityType,averageHeartRate:row.averageHeartRate,maxHeartRate:row.maxHeartRate,calories:row.calories,
  metadata:{averageCadence:row.averageCadence,trainingEffect:row.trainingEffect,fitSport:extra.fitSport??"",
   distanceMeters:typeof extra.distanceMeters==="number"?extra.distanceMeters:null,laps:Array.isArray(extra.laps)?extra.laps:[]}};
}
const selectImport=`SELECT id,source,external_id externalId,fingerprint,started_at startedAt,duration_seconds duration,activity_type activityType,average_heart_rate averageHeartRate,max_heart_rate maxHeartRate,calories,average_cadence averageCadence,training_effect trainingEffect,metadata,draft_id draftId FROM workout_imports`;

export function storeImportedWorkout(workout:ImportedWorkout):ImportSuccess{
 const duplicate=db.prepare(`${selectImport} WHERE source=? AND fingerprint=?`).get(workout.source,workout.fingerprint) as any;
 const draftRows=db.prepare("SELECT id,date,snapshot,started_at startedAt,finished_at finishedAt FROM workout_drafts WHERE status='awaiting_confirmation' ORDER BY id DESC LIMIT 50").all() as DraftRow[];
 const candidates=rankDrafts(workout,draftRows);
 if(duplicate)return {ok:true,result:{id:duplicate.id,workout:workoutFromRow(duplicate),draftId:duplicate.draftId,duplicate:true,autoLinked:false,candidates}};
 const high=candidates.filter(x=>x.confidence==="High");
 const autoDraftId=high.length===1?high[0].id:null;
 const result=db.prepare(`INSERT INTO workout_imports
  (source,external_id,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,max_heart_rate,calories,average_cadence,training_effect,metadata,draft_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(workout.source,workout.externalId,workout.fingerprint,workout.startedAt,workout.duration,workout.activityType,
   workout.averageHeartRate,workout.maxHeartRate,workout.calories,workout.metadata.averageCadence,workout.metadata.trainingEffect,
   JSON.stringify({fitSport:workout.metadata.fitSport,distanceMeters:workout.metadata.distanceMeters,laps:workout.metadata.laps}),autoDraftId);
 return {ok:true,result:{id:Number(result.lastInsertRowid),workout,draftId:autoDraftId,duplicate:false,autoLinked:autoDraftId!==null,candidates}};
}

export function importFit(bytes:Uint8Array):ImportResponse{
 const parsed=parseFit(bytes);
 return parsed.ok?storeImportedWorkout(parsed.workout):parsed;
}

export function linkImport(importId:unknown,draftId:unknown):ImportFailure|{ok:true;draftId:number}{
 const iid=Number(importId),did=Number(draftId);
 if(!Number.isSafeInteger(iid)||iid<1||!Number.isSafeInteger(did)||did<1)return {ok:false,error:"Некорректный импорт или черновик",status:400};
 let response:ImportFailure|{ok:true;draftId:number}={ok:false,error:"Импорт или черновик не найден",status:404};
 db.transaction(()=>{
  const imported=db.prepare("SELECT draft_id draftId FROM workout_imports WHERE id=?").get(iid) as any;
  const draft=db.prepare("SELECT 1 FROM workout_drafts WHERE id=? AND status='awaiting_confirmation'").get(did);
  if(!imported||!draft)return;
  if(imported.draftId===did){response={ok:true,draftId:did};return}
  if(imported.draftId!==null){response={ok:false,error:"Импорт уже связан с другим черновиком",status:409};return}
  db.prepare("UPDATE workout_imports SET draft_id=? WHERE id=? AND draft_id IS NULL").run(did,iid);
  response={ok:true,draftId:did};
 })();
 return response;
}
