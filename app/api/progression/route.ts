// Sprint 6.12 — принятие, отклонение и отмена предложений прогрессии нагрузки.
// Само предложение уже посчитано и сохранено детерминированным кодом при сохранении
// тренировки (app/api/fitness/route.ts). Здесь только смена статуса — с обязательным
// свежим пересчётом перед принятием, чтобы устаревшие или подменённые значения
// не могли попасть в exercise_load_overrides.
import { db } from "@/lib/db";
import { requireAuth,sameOrigin } from "@/lib/auth";
import { getSetting,setSetting } from "@/lib/settings";
import { buildAiCoachContext } from "@/lib/ai-context";
import { AiCoachError } from "@/lib/ai-coach";
import { askAiHub } from "@/lib/ai-hub";
import { COACH_CHAT_DAILY_LIMIT,dateInTimeZone,releaseDailyQuota,reserveDailyQuota } from "@/lib/coach-chat-quota";
import { buildExerciseProgression,canTransitionStatus,validateProgressionMatch,type ProgressionAction,type ProgressionStatus } from "@/lib/progression-engine";

export const runtime="nodejs";

const quotaStore={get:getSetting,set:setSetting};
const reserveQuota=db.transaction((date:string)=>reserveDailyQuota(quotaStore,date));
const releaseQuota=db.transaction((date:string)=>releaseDailyQuota(quotaStore,date));

function mapRow(row:any){
 return {
  id:row.id,workoutId:row.workout_id,exercise:row.exercise,action:row.action,
  reasonCode:row.reason_code,reason:row.reason,
  usedSignals:jsonArray(row.used_signals),limitedData:!!row.limited_data,
  from:{weight:row.from_weight,reps:row.from_reps},to:{weight:row.to_weight,reps:row.to_reps},
  status:row.status,createdAt:row.created_at,decidedAt:row.decided_at,
 };
}
function jsonArray(raw:any){try{const value=JSON.parse(raw);return Array.isArray(value)?value:[]}catch{return []}}

export async function GET(){
 const denied=await requireAuth();if(denied)return denied;
 const rows=db.prepare("SELECT * FROM progression_decisions WHERE status IN ('pending','accepted') ORDER BY id DESC LIMIT 30").all() as any[];
 return Response.json({proposals:rows.map(mapRow)},{headers:{"cache-control":"no-store"}});
}

// Пересчитывает предложение заново из текущих сохранённых данных — не доверяет
// значениям, переданным клиентом (клиент присылает только id).
function recompute(row:any){
 const history=db.prepare("SELECT date,weight,reps,difficulty FROM strength_logs WHERE exercise=? ORDER BY date DESC,id DESC LIMIT 10").all(row.exercise) as {date:string;weight:number;reps:number;difficulty:string}[];
 return buildExerciseProgression({
  exercise:row.exercise,painAfter:row.pain_after,effort:row.effort,workoutComplete:!!row.workout_complete,
  coachAction:(row.coach_action||null) as any,history,targetMaxReps:row.target_max_reps,
 });
}

export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;
 if(!sameOrigin(req))return new Response(null,{status:403});
 let body:any;try{body=await req.json()}catch{return Response.json({error:"Некорректный JSON"},{status:400})}

 const id=Number(body.id);
 if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректный идентификатор"},{status:400});
 const row=db.prepare("SELECT * FROM progression_decisions WHERE id=?").get(id) as any;
 if(!row)return Response.json({error:"Предложение не найдено"},{status:404});

 if(body.action==="accept"){
  if(!canTransitionStatus(row.status as ProgressionStatus,"accepted"))return Response.json({error:"Предложение уже обработано"},{status:409});
  const recomputed=recompute(row);
  const matches=validateProgressionMatch({action:row.action as ProgressionAction,to:{weight:row.to_weight,reps:row.to_reps}},recomputed);
  if(!matches){
   db.prepare("UPDATE progression_decisions SET status='rejected',decided_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
   return Response.json({error:"Предложение устарело: данные изменились, обновите страницу"},{status:409});
  }
  db.transaction(()=>{
   db.prepare("UPDATE progression_decisions SET status='accepted',decided_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
   db.prepare(`INSERT INTO exercise_load_overrides(exercise,weight,reps,source_decision_id) VALUES(?,?,?,?)
    ON CONFLICT(exercise) DO UPDATE SET weight=excluded.weight,reps=excluded.reps,source_decision_id=excluded.source_decision_id,created_at=CURRENT_TIMESTAMP`)
    .run(row.exercise,row.to_weight,row.to_reps,id);
  })();
  return Response.json({ok:true});
 }

 if(body.action==="reject"){
  if(!canTransitionStatus(row.status as ProgressionStatus,"rejected"))return Response.json({error:"Предложение уже обработано"},{status:409});
  db.prepare("UPDATE progression_decisions SET status='rejected',decided_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
  return Response.json({ok:true});
 }

 if(body.action==="cancel"){
  if(!canTransitionStatus(row.status as ProgressionStatus,"cancelled"))return Response.json({error:"Отменить можно только применённое предложение"},{status:409});
  db.transaction(()=>{
   db.prepare("UPDATE progression_decisions SET status='cancelled',decided_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
   db.prepare("DELETE FROM exercise_load_overrides WHERE exercise=? AND source_decision_id=?").run(row.exercise,id);
  })();
  return Response.json({ok:true});
 }

 if(body.action==="explain"){
  const provider=body.provider==="anthropic"||body.provider==="mws"||body.provider==="consensus"?body.provider:"auto";
  const hubConfig={
   anthropicKey:getSetting("anthropic_api_key")||process.env.ANTHROPIC_API_KEY,
   mwsKey:getSetting("mws_api_key")||process.env.MWS_API_KEY,
   mwsProject:getSetting("mws_project")||process.env.MWS_PROJECT,
   mwsModel:getSetting("mws_model")||process.env.MWS_MODEL,
  };
  if(!hubConfig.anthropicKey&&!(hubConfig.mwsKey&&hubConfig.mwsProject&&hubConfig.mwsModel))
   return Response.json({error:"AI Hub не настроен на сервере"},{status:503});

  const today=dateInTimeZone(new Date());
  const profile=db.prepare("SELECT name,height,start_weight startWeight,target_weight targetWeight FROM profile WHERE id=1").get() as any;
  const context=buildAiCoachContext({date:today,ready:true,plan:null,profile,measurements:[],foodLogs:[],workouts:[],wellnessLogs:[],activity:[]});
  const proposal=mapRow(row);
  const question=`Объясни человеку простым языком это уже посчитанное локально предложение по прогрессии нагрузки. Ничего не пересчитывай и не придумывай новых чисел — только объясни, почему разумно так поступить, и что делать дальше.\n`
   +`Упражнение: ${proposal.exercise}. Действие: ${proposal.action}. Было: ${proposal.from.weight} кг × ${proposal.from.reps}. Станет: ${proposal.to.weight} кг × ${proposal.to.reps}.\n`
   +`Причина: ${proposal.reason}${proposal.usedSignals.length?` Использованные сигналы: ${proposal.usedSignals.join(", ")}.`:""}`;

  if(!reserveQuota(today))
   return Response.json({error:`Дневной лимит сообщений тренеру исчерпан (${COACH_CHAT_DAILY_LIMIT}). Продолжите завтра.`},{status:429});
  try{
   const reply=await askAiHub(hubConfig,context,[],question,provider);
   return Response.json({ok:true,...reply});
  }catch(err){
   releaseQuota(today);
   if(err instanceof AiCoachError)return Response.json({error:err.message},{status:err.status});
   return Response.json({error:"Не удалось получить объяснение от ИИ-тренера"},{status:500});
  }
 }

 return Response.json({error:"Неизвестное действие"},{status:400});
}
