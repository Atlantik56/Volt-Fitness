// AI-16 — автоматическое подтверждение импорта.
//
// Импорт сам по себе тренировкой не является: он должен связаться с плановой
// сессией и быть подтверждён. Раньше связывать было не с чем, если владелец не
// открывал приложение перед тренировкой, и импорт оставался висеть в статусе
// «новый». На проде так накопилось 12 записей из 14.
//
// Здесь импорт подтверждает плановую тренировку сам, но только когда
// сопоставление уверенное. Принцип — «сделать и дать откатить»: запись
// появляется в истории, и её можно удалить обычным способом. Всё неуверенное
// по-прежнему ждёт ручного разбора.
import { db } from "@/lib/db";
import { rankActivityMatches, type ActivityMatch } from "@/lib/activity-matcher";
import { buildProgramDayForDate } from "@/app/personal-data";
import { startWorkoutDraft, finishWorkoutDraft, confirmWorkoutDraft } from "@/lib/active-workout-service";
import { buildSwimSnapshot } from "@/lib/swim/workout-engine";
import { getProgram } from "@/lib/swim/program-engine";
import { resolveScheduledSwimWorkout } from "@/lib/swim/services";

export type AutoConfirmSkip={confirmed:false;reason:string;match?:ActivityMatch|null};
export type AutoConfirmDone={confirmed:true;draftId:number;match:ActivityMatch};
export type AutoConfirmResult=AutoConfirmSkip|AutoConfirmDone;

type ImportRow={id:number;startedAt:string;duration:number;activityType:string;draftId:number|null;reviewStatus:string;metadata:string};

const parse=(value:unknown):Record<string,any>=>{try{const p=JSON.parse(String(value??"{}"));return p&&typeof p==="object"?p:{}}catch{return {}}};
const skip=(reason:string,match:ActivityMatch|null=null):AutoConfirmSkip=>({confirmed:false,reason,match});

/** Насколько свежей должна быть тренировка, чтобы подтвердиться сама. */
export const AUTO_CONFIRM_MAX_AGE_DAYS=3;

/** Локальная дата тренировки: у FIT она уже разобрана в metadata, иначе берём из времени старта. */
export function importLocalDate(startedAt:string,metadata:Record<string,any>):string|null{
 const fromMetadata=typeof metadata.localDate==="string"?metadata.localDate.slice(0,10):null;
 if(fromMetadata&&/^\d{4}-\d{2}-\d{2}$/.test(fromMetadata))return fromMetadata;
 const parsed=new Date(startedAt);
 return Number.isFinite(parsed.getTime())?parsed.toISOString().slice(0,10):null;
}

function planDates(){
 const row=db.prepare("SELECT program_start programStart,training_plan_v3_started_at v3 FROM profile WHERE id=1").get() as any;
 const cycle=db.prepare("SELECT id FROM training_plan_cycles WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1").get() as any;
 return {programStart:row?.programStart as string|undefined,v3:row?.v3 as string|null,cycleId:cycle?.id as number|undefined};
}

/**
 * Снимок для черновика. Плавание обязано использовать buildSwimSnapshot — тот
 * же, что и экран тренировки Swim: иначе plan_key не совпадёт и программа не
 * засчитает выполнение. Остальные дисциплины берут состав из дня плана.
 */
function snapshotForSession(date:string,session:any):Record<string,any>|null{
 if(session.discipline==="swim"){
  const slot=resolveScheduledSwimWorkout(date);
  if(!slot||slot.kind!=="workout")return null;
  const program=getProgram(slot.programId);
  if(!program)return null;
  return buildSwimSnapshot(program,slot.workout,planDates().cycleId??null) as any;
 }
 if(!Array.isArray(session.exercises)||!session.exercises.length)return null;
 return {
  title:session.title,type:session.type,rounds:session.rounds??1,
  origin:"original",scheduleChangeId:null,programIdentity:session.programIdentity,
  exercises:session.exercises.map((exercise:any[])=>({name:exercise[0],target:exercise[2],recommendedWeight:0})),
 };
}

/**
 * Подтверждает импорт плановой тренировкой, если сопоставление уверенное.
 * Ничего не делает, когда импорт уже связан, план не найден, уверенность ниже
 * high или на эту дату уже есть тренировка — дублей быть не должно.
 */
export function autoConfirmImport(importId:number):AutoConfirmResult{
 const row=db.prepare("SELECT id,started_at startedAt,duration_seconds duration,activity_type activityType,draft_id draftId,review_status reviewStatus,metadata FROM workout_imports WHERE id=?").get(importId) as ImportRow|undefined;
 if(!row)return skip("импорт не найден");
 if(row.draftId!==null)return skip("импорт уже связан с тренировкой");
 // Отклонённый импорт — это удалённая владельцем тренировка. Подтверждать
 // его заново нельзя: запись вернулась бы после следующей синхронизации.
 if(row.reviewStatus==="dismissed")return skip("импорт отклонён владельцем");

 const metadata=parse(row.metadata);
 const date=importLocalDate(row.startedAt,metadata);
 if(!date)return skip("не удалось определить дату тренировки");

 const {programStart,v3,cycleId}=planDates();
 if(!programStart)return skip("план не настроен");

 // Автоматически подтверждаем только свежее. Разом дописать в историю
 // тренировки многомесячной давности — слишком грубое вмешательство: их
 // владелец должен разобрать осознанно.
 const ageDays=Math.floor((Date.now()-new Date(`${date}T00:00:00Z`).getTime())/86_400_000);
 if(ageDays>AUTO_CONFIRM_MAX_AGE_DAYS)return skip(`тренировка старше ${AUTO_CONFIRM_MAX_AGE_DAYS} дн. — только ручное подтверждение`);

 const day=buildProgramDayForDate(programStart,v3,date,cycleId??null);
 const sessions=(day.sessions??[day]).filter((session:any)=>session.discipline&&session.discipline!=="recovery");
 if(!sessions.length)return skip("на эту дату нет плановой тренировки");

 const matches=rankActivityMatches({
  activityType:row.activityType,startedAt:row.startedAt,durationSeconds:Number(row.duration),
  distanceMeters:Number.isFinite(Number(metadata.distanceMeters))?Number(metadata.distanceMeters):null,
  subtype:typeof metadata.fitSport==="string"?metadata.fitSport:null,localDate:date,
 },sessions.map((session:any,index:number)=>({
  id:index,date,activityType:session.discipline,title:session.title,
  startedAt:null,durationSeconds:null,distanceMeters:null,subtype:session.role??null,
 })));

 const best=matches[0]??null;

 // Шкала confidence калибровалась под черновики, где известны время старта и
 // длительность. У плановой сессии их нет, поэтому больше 0.60 там набрать
 // нельзя, и порог high недостижим. Подгонять счёт неправильно — для
 // сопоставления с планом действует своё, явно сформулированное правило.
 const sameDiscipline=sessions.filter((session:any)=>session.discipline===row.activityType);
 if(!sameDiscipline.length)return skip(`в плане на ${date} нет тренировки дисциплины «${row.activityType}»`,best);
 if(sameDiscipline.length>1)return skip("в плане несколько тренировок этой дисциплины — нужен ручной выбор",best);
 const session=sameDiscipline[0];

 // Правдоподобность длительности: защищает от подтверждения случайной
 // короткой записи вместо настоящей тренировки. Верхнюю границу не проверяем —
 // тренироваться дольше плана нормально.
 const plannedMinutes=Number(String(session.time??"").match(/\d+/)?.[0]??0);
 const actualMinutes=Number(row.duration)/60;
 if(actualMinutes<5)return skip(`тренировка слишком короткая (${Math.round(actualMinutes)} мин)`,best);
 if(plannedMinutes>0&&actualMinutes<plannedMinutes*0.5)
  return skip(`длительность ${Math.round(actualMinutes)} мин против плановых ${plannedMinutes} — нужен ручной разбор`,best);
 const snapshot=snapshotForSession(date,session);
 if(!snapshot)return skip("не удалось собрать план тренировки",best);

 // Уже есть подтверждённая тренировка на эту дату с тем же названием —
 // повторно создавать нельзя.
 const existing=db.prepare("SELECT 1 FROM workout_logs WHERE date=? AND title=? LIMIT 1").get(date,String(snapshot.title??session.title));
 if(existing)return skip("тренировка на эту дату уже подтверждена",best);

 const started=startWorkoutDraft({date,snapshot}) as any;
 if(!started.ok||!started.draft)return skip(`не удалось создать черновик: ${started.error??"неизвестно"}`,best);
 const draftId=Number(started.draft.id);
 if(started.draft.status!=="active")return skip("черновик уже в работе — оставляем ручное подтверждение",best);

 // Связываем ДО завершения: confirmWorkoutDraft читает метрики импорта по
 // draft_id, и без связи тренировка получила бы нулевые длительность и пульс.
 db.prepare("UPDATE workout_imports SET draft_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(draftId,row.id);

 const finished=finishWorkoutDraft({id:draftId,expectedStatus:"active"}) as any;
 if(!finished.ok)return skip(`не удалось завершить черновик: ${finished.error??"неизвестно"}`,best);

 const confirmed=confirmWorkoutDraft({
  id:draftId,expectedStatus:"awaiting_confirmation",
  ...(Number.isFinite(Number(metadata.distanceMeters))&&Number(metadata.distanceMeters)>0?{distanceMeters:Number(metadata.distanceMeters)}:{}),
 }) as any;
 if(!confirmed.ok)return skip(`не удалось подтвердить: ${confirmed.error??"неизвестно"}`,best);

 return {confirmed:true,draftId,match:best};
}
