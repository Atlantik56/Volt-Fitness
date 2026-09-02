import { createHash } from "node:crypto";
import { Decoder, Stream } from "@garmin/fitsdk";
import type { FileIdMesg, LapMesg, SessionMesg } from "@garmin/fitsdk";
import { db } from "@/lib/db";
import { isCyclingSlot } from "@/lib/cycling";

export const MAX_FIT_FILE_SIZE=10_000_000;
export type ImportSource="garmin_fit"|"strava";
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
 metadata:{averageCadence:number|null;trainingEffect:number|null;fitSport:string;distanceMeters:number|null;laps:FitLap[];
  // Подробности по дисциплинам. null означает «в файле этого нет», пустой
  // массив — «сообщения есть, но подходящих записей не оказалось».
  sets?:FitSet[]|null;swim?:FitSwimDetail|null;power?:FitPowerDetail|null;[key:string]:unknown};
};
// Отрезки (lapMesgs) FIT-файла — используются только для сопоставления
// фактических метров/времени со спланированными блоками тренировки Swim
// (см. lib/swim/fit-match.ts). Для не-swim активностей остаётся [].
export type FitLap={distanceMeters:number;durationSeconds:number;numLengths:number|null};

// Подход силовой тренировки. Часы пишут повторы всегда, вес — только если он
// введён; распознанное упражнение приходит тройкой догадок и как источник
// «какое это было движение» не годится, поэтому категория сохраняется лишь
// первым кандидатом и справочно.
// weightKg=0 означает упражнение с весом тела (отжимания, планка, отведения),
// а не отсутствие данных: такие подходы прогрессируют повторами, а не
// килограммами. null остаётся только когда прибор поля не записал вовсе.
export type FitSet={repetitions:number|null;weightKg:number|null;bodyweight:boolean;durationSeconds:number|null;category:string|null};

// Длина бассейна. SWOLF в FIT не хранится и считается здесь: время длины в
// секундах плюс число гребков — стандартное определение.
export type FitSwimLength={strokes:number|null;durationSeconds:number|null;swolf:number|null;stroke:string|null};

export type FitSwimDetail={poolLengthMeters:number|null;activeLengths:number;avgSwolf:number|null;avgStrokesPerLength:number|null;paceSecondsPer100m:number|null;lengths:FitSwimLength[]};
export type FitPowerDetail={avgWatts:number|null;maxWatts:number|null;normalizedWatts:number|null;kilojoules:number|null};
export type DraftCandidate={id:number;title:string;startedAt:string|null;finishedAt:string|null;confidence:MatchConfidence;reasons:string[]};
export type StoredImport={id:number;workout:ImportedWorkout;draftId:number|null;duplicate:boolean;autoLinked:boolean;candidates:DraftCandidate[]};
export type ImportFailure={ok:false;error:string;status:number};
export type ImportSuccess={ok:true;result:StoredImport};
export type ImportResponse=ImportFailure|ImportSuccess;
export type TargetedImportRequest={expectedActivityType:unknown;draftId:unknown;expectedDraftStatus:unknown};

const finite=(value:unknown,min:number,max:number)=>{
 const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};
const asInteger=(value:unknown,min:number,max:number)=>{const n=finite(value,min,max);return n===null?null:Math.round(n)};
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

const average=(values:number[])=>values.length?Math.round((values.reduce((sum,value)=>sum+value,0)/values.length)*10)/10:null;

/** Рабочие подходы силовой из сообщений set. Отдых отбрасывается. */
export function computeFitSets(rawSets:unknown):FitSet[]|null{
 if(!Array.isArray(rawSets))return null;
 return rawSets.filter((set:any)=>set?.setType==="active").map((set:any)=>({
  repetitions:asInteger(set?.repetitions,1,1000),
  // Ноль — это вес тела, а не пропуск: часы пишут его для отжиманий, планки
  // и отведений. Отбрасывать такие подходы нельзя, иначе половина силовой
  // тренировки для движка прогрессии перестанет существовать.
  weightKg:finite(set?.weight,0,1000),
  bodyweight:finite(set?.weight,0,1000)===0,
  durationSeconds:finite(set?.duration,0,86_400),
  category:Array.isArray(set?.category)?String(set.category[0]??"")||null:null,
 }));
}

/**
 * Длины бассейна и производные метрики. SWOLF в FIT не хранится: это время
 * длины в секундах плюс число гребков — стандартное определение.
 */
export function computeFitSwimDetail(
 rawLengths:unknown,session:{poolLengthMeters:number|null;totalDistanceMeters:number|null;durationSeconds:number},
):FitSwimDetail|null{
 if(!Array.isArray(rawLengths))return null;
 const lengths:FitSwimLength[]=rawLengths.filter((item:any)=>item?.lengthType==="active").map((item:any)=>{
  const strokes=asInteger(item?.totalStrokes,1,500);
  const seconds=finite(item?.totalTimerTime??item?.totalElapsedTime,1,3600);
  return {
   strokes,durationSeconds:seconds,
   swolf:strokes!==null&&seconds!==null?Math.round(seconds+strokes):null,
   stroke:typeof item?.swimStroke==="string"?item.swimStroke:null,
  };
 });
 const distance=session.totalDistanceMeters;
 return {
  poolLengthMeters:session.poolLengthMeters,
  activeLengths:lengths.length,
  avgSwolf:average(lengths.map(item=>item.swolf).filter((value):value is number=>value!==null)),
  avgStrokesPerLength:average(lengths.map(item=>item.strokes).filter((value):value is number=>value!==null)),
  paceSecondsPer100m:distance!==null&&distance>0?Math.round(session.durationSeconds/distance*100):null,
  lengths,
 };
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
  const sets=activityType==="strength"?computeFitSets((messages as any).setMesgs):null;
  const swim=activityType==="swim"?computeFitSwimDetail((messages as any).lengthMesgs,{
   poolLengthMeters:finite((session as any).poolLength,1,100),
   totalDistanceMeters:finite(session.totalDistance,1,1_000_000),
   durationSeconds:duration,
  }):null;
  // Вело: названия полей мощности взяты из профиля FIT. Если прибор их не
  // пишет, значения останутся null и прогрессия честно скажет о нехватке
  // данных, вместо того чтобы считать по выдуманным числам.
  const power:FitPowerDetail|null=activityType==="bike"?{
   avgWatts:finite((session as any).avgPower,0,3000),
   maxWatts:finite((session as any).maxPower,0,5000),
   normalizedWatts:finite((session as any).normalizedPower,0,3000),
   kilojoules:(()=>{const joules=finite((session as any).totalWork,0,100_000_000);return joules===null?null:Math.round(joules/1000)})(),
  }:null;

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
    sets,
    swim,
    power,
   },
  }};
 }catch{
  return {ok:false,error:"FIT-файл повреждён или не может быть безопасно прочитан",status:422};
 }
}

type DraftRow={id:number;date:string;snapshot:string;startedAt:string|null;finishedAt:string|null};
const dbDate=(value:string|null)=>value?asDate(value.includes("T")?value:`${value.replace(" ","T")}Z`):null;
// Классификация тренировки по её типу и названию. Экспортируется, потому что
// тем же правилом должна пользоваться история дисциплин (AI-15).
export const draftFamily=(type:string,title:string):ActivityFamily=>{
 const value=`${type} ${title}`.toLowerCase();
 if(value.includes("плав"))return "swim";
 if(isCyclingSlot({type,title}))return "bike";
 if(value.includes("сил"))return "strength";
 if(value.includes("восстанов")||value.includes("отдых"))return "recovery";
 return "cardio";
};

export function rankDrafts(workout:ImportedWorkout,rows:DraftRow[]):DraftCandidate[]{
 const start=new Date(workout.startedAt);
 const activityDate=typeof workout.metadata.localDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(workout.metadata.localDate)?workout.metadata.localDate:workout.startedAt.slice(0,10);
 return rows.map(row=>{
  let snapshot:any={};try{snapshot=JSON.parse(row.snapshot)}catch{}
  const reasons:string[]=[];
  const sameDate=row.date===activityDate;
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
  metadata:{...extra,averageCadence:row.averageCadence,trainingEffect:row.trainingEffect,fitSport:extra.fitSport??"",
   distanceMeters:typeof extra.distanceMeters==="number"?extra.distanceMeters:null,laps:Array.isArray(extra.laps)?extra.laps:[]}};
}
const selectImport=`SELECT id,source,external_id externalId,fingerprint,started_at startedAt,duration_seconds duration,activity_type activityType,average_heart_rate averageHeartRate,max_heart_rate maxHeartRate,calories,average_cadence averageCadence,training_effect trainingEffect,metadata,draft_id draftId FROM workout_imports`;
const stravaCacheExpiry=(workout:ImportedWorkout)=>{
 if(workout.source!=="strava")return null;
 const retrieved=new Date(typeof workout.metadata.retrievedAt==="string"?workout.metadata.retrievedAt:new Date().toISOString());
 return new Date(retrieved.getTime()+7*86_400_000).toISOString();
};

export function storeImportedWorkout(workout:ImportedWorkout):ImportSuccess{
 let response!:ImportSuccess;
 db.transaction(()=>{
  // Устойчивая личность активности — external_id (для FIT его строит parseFit
  // из содержимого файла). Fingerprint считается по байтам, а один и тот же
  // заезд, полученный разными путями — ручной загрузкой и через intervals.icu —
  // приходит байт-в-байт разными файлами и раньше создавал второй импорт.
  // Поэтому сначала ищем по external_id для любого источника, и лишь затем по
  // хешу — для записей, у которых внешнего идентификатора нет.
  const duplicate=((workout.externalId
   ?db.prepare(`${selectImport} WHERE source=? AND external_id=?`).get(workout.source,workout.externalId)
   :null)
   ??db.prepare(`${selectImport} WHERE source=? AND fingerprint=?`).get(workout.source,workout.fingerprint)) as any;
  const draftRows=db.prepare("SELECT id,date,snapshot,started_at startedAt,finished_at finishedAt FROM workout_drafts WHERE status='awaiting_confirmation' ORDER BY id DESC LIMIT 50").all() as DraftRow[];
  const candidates=rankDrafts(workout,draftRows);
  if(duplicate){
   // Тот же файл, разобранный более новым парсером, несёт больше подробностей
   // (подходы силовой, длины и SWOLF бассейна, мощность вело). Обновляем
   // только метаданные: связь с черновиком, статус ревью и всё остальное
   // принадлежит пользователю и переразбором файла не затрагивается.
   if(workout.source!=="strava"){
    db.prepare("UPDATE workout_imports SET metadata=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
     .run(JSON.stringify(workout.metadata),duplicate.id);
   }
   // Strava activity details may change after the original upload. Refresh the
   // normalized cache in place while preserving the existing draft link.
   if(workout.source==="strava"){
    db.prepare(`UPDATE workout_imports SET fingerprint=?,started_at=?,duration_seconds=?,activity_type=?,average_heart_rate=?,max_heart_rate=?,calories=?,average_cadence=?,training_effect=?,metadata=?,updated_at=CURRENT_TIMESTAMP,cache_expires_at=?,review_status=CASE WHEN review_status='dismissed' THEN review_status ELSE 'new' END WHERE id=?`).run(
     workout.fingerprint,workout.startedAt,workout.duration,workout.activityType,workout.averageHeartRate,workout.maxHeartRate,
     workout.calories,workout.metadata.averageCadence,workout.metadata.trainingEffect,JSON.stringify(workout.metadata),stravaCacheExpiry(workout),duplicate.id);
   }
   response={ok:true,result:{id:duplicate.id,workout:workout.source==="strava"?workout:workoutFromRow(duplicate),draftId:duplicate.draftId,duplicate:true,autoLinked:false,candidates}};
   return;
  }
  const high=candidates.filter(x=>x.confidence==="High");
  const candidateDraftId=high.length===1?high[0].id:null;
  const alreadyLinked=candidateDraftId===null?null:db.prepare("SELECT 1 FROM workout_imports WHERE draft_id=? LIMIT 1").get(candidateDraftId);
  const autoDraftId=alreadyLinked?null:candidateDraftId;
  const result=db.prepare(`INSERT INTO workout_imports
   (source,external_id,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,max_heart_rate,calories,average_cadence,training_effect,metadata,draft_id,updated_at,cache_expires_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).run(workout.source,workout.externalId,workout.fingerprint,workout.startedAt,workout.duration,workout.activityType,
    workout.averageHeartRate,workout.maxHeartRate,workout.calories,workout.metadata.averageCadence,workout.metadata.trainingEffect,
    JSON.stringify(workout.metadata),autoDraftId,stravaCacheExpiry(workout));
  response={ok:true,result:{id:Number(result.lastInsertRowid),workout,draftId:autoDraftId,duplicate:false,autoLinked:autoDraftId!==null,candidates}};
 })();
 return response;
}

export function importFit(bytes:Uint8Array):ImportResponse{
 const parsed=parseFit(bytes);
 return parsed.ok?storeImportedWorkout(parsed.workout):parsed;
}

// Targeted imports are used by discipline-specific result screens. Parsing,
// activity validation and persistence happen in one server-side transaction,
// so a client cannot first persist an incompatible FIT and link it later.
export function importFitForDraft(bytes:Uint8Array,target:TargetedImportRequest):ImportResponse{
 const did=Number(target.draftId);
 const expectedActivityType=String(target.expectedActivityType??"");
 const expectedDraftStatus=String(target.expectedDraftStatus??"");
 if(!Number.isSafeInteger(did)||did<1||!(["strength","swim","bike","cardio","recovery"] as string[]).includes(expectedActivityType)){
  return {ok:false,error:"Некорректный тип активности или черновик",status:400};
 }
 if(expectedDraftStatus!=="awaiting_confirmation"){
  return {ok:false,error:"Поддерживается только черновик, ожидающий подтверждения",status:400};
 }
 const parsed=parseFit(bytes);
 if(!parsed.ok)return parsed;
 if(parsed.workout.activityType!==expectedActivityType){
  return {ok:false,error:`FIT имеет тип ${parsed.workout.activityType}, ожидался ${expectedActivityType}`,status:422};
 }

 let response:ImportResponse={ok:false,error:"Черновик не найден",status:404};
 db.transaction(()=>{
  const draft=db.prepare("SELECT id,date,status,snapshot,started_at startedAt,finished_at finishedAt FROM workout_drafts WHERE id=?").get(did) as (DraftRow&{status:string})|undefined;
  if(!draft)return;
  if(draft.status!==expectedDraftStatus){
   response={ok:false,error:"Статус черновика изменился; обновите экран",status:409};
   return;
  }
  let snapshot:any={};try{snapshot=JSON.parse(draft.snapshot)}catch{}
  if(draftFamily(String(snapshot.type??""),String(snapshot.title??""))!==expectedActivityType){
   response={ok:false,error:"Тип черновика не соответствует FIT",status:409};
   return;
  }

  const workout=parsed.workout;
  const candidate=rankDrafts(workout,[draft]);
  const linkedToDraft=db.prepare(`${selectImport} WHERE draft_id=? ORDER BY id DESC LIMIT 1`).get(did) as any;
  if(linkedToDraft&&(linkedToDraft.source!==workout.source||linkedToDraft.fingerprint!==workout.fingerprint)){
   response={ok:false,error:"С этим черновиком уже связан другой FIT",status:409};
   return;
  }
  const duplicate=db.prepare(`${selectImport} WHERE source=? AND fingerprint=?`).get(workout.source,workout.fingerprint) as any;
  if(duplicate){
   if(duplicate.draftId!==null&&duplicate.draftId!==did){
    response={ok:false,error:"Импорт уже связан с другим черновиком",status:409};
    return;
   }
   if(duplicate.draftId===null){
    const linked=db.prepare("UPDATE workout_imports SET draft_id=? WHERE id=? AND draft_id IS NULL").run(did,duplicate.id);
    if(linked.changes!==1){
     response={ok:false,error:"Импорт уже связан с другим черновиком",status:409};
     return;
    }
   }
   response={ok:true,result:{id:duplicate.id,workout:workoutFromRow(duplicate),draftId:did,duplicate:true,autoLinked:false,candidates:candidate}};
   return;
  }

  const inserted=db.prepare(`INSERT INTO workout_imports
   (source,external_id,fingerprint,started_at,duration_seconds,activity_type,average_heart_rate,max_heart_rate,calories,average_cadence,training_effect,metadata,draft_id,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(workout.source,workout.externalId,workout.fingerprint,workout.startedAt,workout.duration,workout.activityType,
    workout.averageHeartRate,workout.maxHeartRate,workout.calories,workout.metadata.averageCadence,workout.metadata.trainingEffect,
    JSON.stringify(workout.metadata),did);
  response={ok:true,result:{id:Number(inserted.lastInsertRowid),workout,draftId:did,duplicate:false,autoLinked:false,candidates:candidate}};
 })();
 return response;
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
