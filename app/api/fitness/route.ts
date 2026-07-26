import { db } from "@/lib/db";
import { requireAuth,sameOrigin } from "@/lib/auth";
import { getSetting,setSetting } from "@/lib/settings";
import { buildCoachSummary,decideCoach } from "@/lib/coach";
import { buildExerciseProgression,shouldSuppressRepeat,type ProgressionAction,type ProgressionStatus } from "@/lib/progression-engine";
import { targetMaxRepsFor } from "@/app/exercise-catalog";
export const runtime="nodejs";
const dateOk=(x:any)=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const num=(x:any,min=0,max=100000)=>{const n=Number(x);return Number.isFinite(n)&&n>=min&&n<=max?n:null};
const text=(x:any,max=120)=>typeof x==="string"?x.trim().slice(0,max):"";

export async function GET(){
 const denied=await requireAuth();if(denied)return denied;
 const profile=db.prepare("SELECT id,name,height,start_weight startWeight,target_weight targetWeight,program_start programStart FROM profile WHERE id=1").get();
 const workouts=(db.prepare("SELECT id,date,type,title,completed,rounds,duration_seconds durationSeconds,rest_seconds restSeconds,details,min_heart_rate minHeartRate,avg_heart_rate avgHeartRate,max_heart_rate maxHeartRate,calories,distance_meters distanceMeters,avg_speed avgSpeed,effort,pain_after painAfter,created_at createdAt FROM workout_logs ORDER BY date DESC,id DESC LIMIT 400").all() as any[]).map(x=>({...x,completed:jsonArray(x.completed),details:jsonArray(x.details)}));
 const measurements=db.prepare("SELECT * FROM measurements ORDER BY date DESC,id DESC LIMIT 200").all();
 const photos=(db.prepare("SELECT id,date,created_at createdAt FROM photos ORDER BY created_at ASC,id ASC").all() as any[]).map(x=>({...x,url:`/api/photos?id=${x.id}`}));
 const activity=db.prepare("SELECT id,date,steps,active_minutes activeMinutes,calories,beers,sleep_hours sleepHours FROM daily_activity ORDER BY date DESC LIMIT 400").all();
 const foodLogs=(db.prepare("SELECT id,date,meal_type mealType,items_json itemsJson,calories,protein,fat,carbs,note,created_at createdAt FROM food_logs ORDER BY date DESC,id DESC LIMIT 400").all() as any[]).map(x=>({...x,items:JSON.parse(x.itemsJson),itemsJson:undefined}));
 const moodLogs=db.prepare("SELECT id,date,mood,note,created_at createdAt FROM mood_logs ORDER BY created_at DESC,id DESC LIMIT 30").all();
 const strengthLogs=db.prepare("SELECT id,date,exercise,weight,reps,difficulty,created_at createdAt FROM strength_logs ORDER BY date DESC,id DESC LIMIT 300").all();
 const wellnessLogs=db.prepare("SELECT id,date,energy,pain,pain_area painArea,note FROM wellness_logs ORDER BY date DESC LIMIT 120").all();
 const scheduleOverrides=db.prepare("SELECT * FROM (SELECT id,original_date originalDate,scheduled_date scheduledDate,plan_title planTitle,replacement_title replacementTitle FROM schedule_overrides ORDER BY scheduled_date DESC,id DESC LIMIT 200) ORDER BY scheduledDate ASC,id ASC").all();
 const whatsNewSeenVersion=Number(getSetting("whats_new_seen_version"))||0;
 // Принятые предложения прогрессии (Sprint 6.12) — влияют только на стартовый вес/повторы
 // следующей сессии, историю тренировок не переписывают. Override перестаёт отдаваться,
 // как только по упражнению появилась более новая сохранённая попытка — предложение уже сработало.
 const progressionOverrides=Object.fromEntries((db.prepare(`SELECT o.exercise,o.weight,o.reps FROM exercise_load_overrides o
  WHERE NOT EXISTS (SELECT 1 FROM strength_logs s WHERE s.exercise=o.exercise AND s.created_at>o.created_at)`).all() as any[]).map(x=>[x.exercise,{weight:x.weight,reps:x.reps}]));
 return Response.json({profile,workouts,measurements,activity,photos,foodLogs,moodLogs,strengthLogs,wellnessLogs,scheduleOverrides,whatsNewSeenVersion,progressionOverrides},{headers:{"cache-control":"no-store"}})
}

export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 let b:any;try{b=await req.json()}catch{return Response.json({error:"Некорректный JSON"},{status:400})}
 if(b.action==="profile"){
  const name=text(b.name,40),height=num(b.height,100,250),start=num(b.startWeight,30,350),target=num(b.targetWeight,30,350);if(!name||!height||!start||!target)return Response.json({error:"Проверьте данные профиля"},{status:400});db.prepare("UPDATE profile SET name=?,height=?,start_weight=?,target_weight=? WHERE id=1").run(name,height,start,target)
 }else if(b.action==="measurement"){
  if(!dateOk(b.date))return Response.json({error:"Некорректная дата"},{status:400});const keys=["weight","waist","chest","biceps","thigh","neck"],vals=keys.map(k=>b[k]===""||b[k]==null?null:num(b[k],1,400));if(vals.some((x,i)=>x===null&&b[keys[i]]))return Response.json({error:"Некорректный замер"},{status:400});db.prepare("INSERT INTO measurements (date,weight,waist,chest,biceps,thigh,neck) VALUES (?,?,?,?,?,?,?)").run(b.date,...vals)
 }else if(b.action==="updateMeasurement"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});
  if(!dateOk(b.date))return Response.json({error:"Некорректная дата"},{status:400});const keys=["weight","waist","chest","biceps","thigh","neck"],vals=keys.map(k=>b[k]===""||b[k]==null?null:num(b[k],1,400));if(vals.some((x,i)=>x===null&&b[keys[i]]))return Response.json({error:"Некорректный замер"},{status:400});
  const result=db.prepare("UPDATE measurements SET date=?,weight=?,waist=?,chest=?,biceps=?,thigh=?,neck=? WHERE id=?").run(b.date,...vals,id);if(!result.changes)return Response.json({error:"Запись не найдена"},{status:404})
 }else if(b.action==="deleteMeasurement"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});db.prepare("DELETE FROM measurements WHERE id=?").run(id)
 }else if(b.action==="workout"){
  const duration=num(b.durationSeconds,0,86400),rest=num(b.restSeconds,0,86400),minHr=num(b.minHeartRate,0,250),avgHr=num(b.avgHeartRate,0,250),maxHr=num(b.maxHeartRate,0,250),calories=num(b.calories,0,10000),distance=num(b.distanceMeters,0,1000000),speed=num(b.avgSpeed,0,200),details=Array.isArray(b.details)?b.details.slice(0,200).map((x:any)=>({key:text(x.key,40),name:text(x.name,120),originalName:text(x.originalName,120)||text(x.name,120),value:num(x.value,0,100000)||0,weight:num(x.weight,0,500)||0,difficulty:["Легко","Нормально","Тяжело","Боль"].includes(x.difficulty)?x.difficulty:"Нормально",unit:x.unit==="сек"?"сек":x.unit==="мин"?"мин":"повт."})):[];
  if(!dateOk(b.date)||!text(b.title)||!Array.isArray(b.completed)||duration===null||rest===null)return Response.json({error:"Некорректная тренировка"},{status:400});
  const workoutType=text(b.type,40),painAfter=num(b.painAfter,0,10)||0,effort=["Легко","Нормально","Тяжело","Боль"].includes(b.effort)?b.effort:"";
  let workoutId=0,groupedExercises:Map<string,{weight:number;reps:number;difficulty:string}>|null=null;
  db.transaction(()=>{
   const workout=db.prepare("INSERT INTO workout_logs (date,type,title,completed,rounds,duration_seconds,rest_seconds,details) VALUES (?,?,?,?,?,?,?,?)").run(b.date,workoutType,text(b.title),JSON.stringify(b.completed.slice(0,200)),num(b.rounds,1,20)||1,duration,rest,JSON.stringify(details));
   workoutId=Number(workout.lastInsertRowid);
   db.prepare("UPDATE workout_logs SET min_heart_rate=?,avg_heart_rate=?,max_heart_rate=?,calories=?,distance_meters=?,avg_speed=?,effort=?,pain_after=? WHERE id=?").run(minHr||0,avgHr||0,maxHr||0,calories||0,distance||0,speed||0,effort,painAfter,workoutId);
   if(workoutType==="Силовая"){
    const grouped=new Map<string,{weight:number;reps:number;difficulty:string}>();
    const difficultyRank:Record<string,number>={Легко:0,Нормально:1,Тяжело:2,Боль:3};
    for(const item of details){const current=grouped.get(item.originalName);if(!current)grouped.set(item.originalName,{weight:item.weight,reps:item.value,difficulty:item.difficulty});else{current.weight=Math.max(current.weight,item.weight);current.reps=Math.max(current.reps,item.value);if(difficultyRank[item.difficulty]>difficultyRank[current.difficulty])current.difficulty=item.difficulty}}
    const insert=db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps,difficulty) VALUES (?,?,?,?,?)");
    for(const [exercise,item] of grouped)insert.run(b.date,exercise,item.weight,item.reps,item.difficulty);
    groupedExercises=grouped;
   }
  })()
  if(groupedExercises)generateProgressionProposals({
   workoutId,date:b.date,plan:{title:text(b.title),type:workoutType},
   painAfter,effort,workoutComplete:Array.isArray(b.completed)&&b.completed.length>=details.length,
   exercises:groupedExercises,
  });
 }else if(b.action==="updateWorkout"){
  const id=Number(b.id),duration=num(b.durationSeconds,0,86400),rest=num(b.restSeconds,0,86400),rounds=num(b.rounds,1,20),minHr=num(b.minHeartRate,0,250),avgHr=num(b.avgHeartRate,0,250),maxHr=num(b.maxHeartRate,0,250),calories=num(b.calories,0,10000),distance=num(b.distanceMeters,0,1000000),speed=num(b.avgSpeed,0,200),details=Array.isArray(b.details)?b.details.slice(0,200).map((x:any)=>({key:text(x.key,40),name:text(x.name,120),originalName:text(x.originalName,120)||text(x.name,120),value:num(x.value,0,100000)||0,weight:num(x.weight,0,500)||0,difficulty:["Легко","Нормально","Тяжело","Боль"].includes(x.difficulty)?x.difficulty:"Нормально",unit:x.unit==="сек"?"сек":x.unit==="мин"?"мин":"повт."})):[];
  if(!Number.isSafeInteger(id)||id<1||!dateOk(b.date)||!text(b.title)||duration===null||rest===null||rounds===null)return Response.json({error:"Некорректные данные тренировки"},{status:400});
  const result=db.prepare("UPDATE workout_logs SET date=?,type=?,title=?,rounds=?,duration_seconds=?,rest_seconds=?,details=?,min_heart_rate=?,avg_heart_rate=?,max_heart_rate=?,calories=?,distance_meters=?,avg_speed=? WHERE id=?").run(b.date,text(b.type,40),text(b.title),rounds,duration,rest,JSON.stringify(details),minHr||0,avgHr||0,maxHr||0,calories||0,distance||0,speed||0,id);if(!result.changes)return Response.json({error:"Тренировка не найдена"},{status:404})
 }else if(b.action==="activity"){
  if(!dateOk(b.date))return Response.json({error:"Некорректная дата"},{status:400});db.prepare("INSERT INTO daily_activity (date,steps,active_minutes,calories,beers,sleep_hours) VALUES (?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET steps=excluded.steps,active_minutes=excluded.active_minutes,calories=excluded.calories,beers=excluded.beers,sleep_hours=excluded.sleep_hours").run(b.date,num(b.steps)||0,num(b.activeMinutes,0,1440)||0,num(b.calories,0,20000)||0,num(b.beers,0,100)||0,num(b.sleepHours,0,24)||0)
 }else if(b.action==="wellness"){
  const energy=num(b.energy,1,5),pain=num(b.pain,0,10);if(!dateOk(b.date)||energy===null||pain===null)return Response.json({error:"Проверьте самочувствие"},{status:400});db.prepare("INSERT INTO wellness_logs(date,energy,pain,pain_area,note) VALUES(?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET energy=excluded.energy,pain=excluded.pain,pain_area=excluded.pain_area,note=excluded.note").run(b.date,energy,pain,text(b.painArea,80),text(b.note,300))
 }else if(b.action==="schedule"){
  if(!dateOk(b.originalDate)||!dateOk(b.scheduledDate)||!text(b.planTitle))return Response.json({error:"Проверьте даты"},{status:400});db.prepare("INSERT INTO schedule_overrides(original_date,scheduled_date,plan_title,replacement_title) VALUES(?,?,?,?) ON CONFLICT(original_date) DO UPDATE SET scheduled_date=excluded.scheduled_date,replacement_title=excluded.replacement_title").run(b.originalDate,b.scheduledDate,text(b.planTitle),text(b.replacementTitle))
 }else if(b.action==="strength"){
  const weight=num(b.weight,0,500),reps=num(b.reps,0,200),difficulty=["Легко","Нормально","Тяжело","Боль"].includes(b.difficulty)?b.difficulty:"Нормально";if(!dateOk(b.date)||!text(b.exercise)||weight===null)return Response.json({error:"Укажите дату, упражнение и вес"},{status:400});db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps,difficulty) VALUES (?,?,?,?,?)").run(b.date,text(b.exercise,120),weight,reps||0,difficulty)
 }else if(b.action==="deleteStrength"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});db.prepare("DELETE FROM strength_logs WHERE id=?").run(id)
 }else if(b.action==="mood"){
  const moods=["😊","🙂","😐","😔","😢","😡"];if(!dateOk(b.date)||!moods.includes(b.mood))return Response.json({error:"Некорректная запись настроения"},{status:400});db.prepare("INSERT INTO mood_logs (date,mood,note) VALUES (?,?,?)").run(b.date,b.mood,text(b.note,300))
 }else if(b.action==="deleteMood"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});db.prepare("DELETE FROM mood_logs WHERE id=?").run(id)
 }else if(b.action==="food"){
  const raw=typeof b.rawText==="string"?b.rawText.trim().slice(0,12000):"",mealType=["Завтрак","Обед","Ужин","Перекус"].includes(b.mealType)?b.mealType:"Перекус";if(!dateOk(b.date)||!raw)return Response.json({error:"Добавьте дату и текст приёма пищи"},{status:400});
  let parsed=parseFood(raw);
  if(!parsed.items.length){const key=getSetting("anthropic_api_key")||process.env.ANTHROPIC_API_KEY;if(key)parsed=(await aiEstimateFood(raw,key))||parsed}
  if(!parsed.items.length)return Response.json({error:"Не удалось распознать приём пищи. Опишите блюда словами или в формате: Блюдо — 130 ккал (Б 10 / Ж 8 / У 2)"},{status:400});
  db.prepare("INSERT INTO food_logs(date,meal_type,raw_text,items_json,calories,protein,fat,carbs,note) VALUES(?,?,?,?,?,?,?,?,?)").run(b.date,mealType,raw,JSON.stringify(parsed.items),parsed.calories,parsed.protein,parsed.fat,parsed.carbs,text(b.note,600));return Response.json({ok:true,parsed})
 }else if(b.action==="deleteFood"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});db.prepare("DELETE FROM food_logs WHERE id=?").run(id)
 }else if(b.action==="markWhatsNewSeen"){
  const version=Number(b.version);if(!Number.isSafeInteger(version)||version<0)return Response.json({error:"Некорректная версия"},{status:400});
  const current=Number(getSetting("whats_new_seen_version"))||0;if(version>current)setSetting("whats_new_seen_version",String(version))
 }else return Response.json({error:"Неизвестное действие"},{status:400});
 return Response.json({ok:true})
}

// Sprint 6.12 — коуч-решение на дату уже сохранённой тренировки, для проверки,
// не щадящее ли оно (reduce/replace/rest блокируют увеличение нагрузки).
function computeCoachActionForDate(date:string,plan:{title:string;type:string}):string|null{
 const profile=db.prepare("SELECT name,height,start_weight startWeight,target_weight targetWeight FROM profile WHERE id=1").get() as any;
 const measurements=db.prepare("SELECT date,weight FROM measurements WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
 const foodLogs=db.prepare("SELECT date,calories,protein,fat,carbs FROM food_logs WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
 const workouts=db.prepare("SELECT date,type,title,effort,pain_after painAfter FROM workout_logs WHERE date<=? ORDER BY date DESC,id DESC LIMIT 20").all(date) as any[];
 const wellnessRow=db.prepare("SELECT energy,pain,pain_area painArea FROM wellness_logs WHERE date=?").get(date) as any;
 const activityRow=db.prepare("SELECT steps,active_minutes activeMinutes,sleep_hours sleepHours FROM daily_activity WHERE date=?").get(date) as any;
 const summary=buildCoachSummary({
  date,plan,profile,measurements,foodLogs,workouts,
  wellnessLogs:wellnessRow?[{date,...wellnessRow}]:[],
  activity:activityRow?[{date,...activityRow}]:[],
 });
 return decideCoach(summary)?.action??null;
}

// Строит и сохраняет предложения прогрессии по каждому силовому упражнению только что
// сохранённой тренировки. Само предложение считается детерминированно в
// lib/progression-engine.ts; здесь — только сборка входных данных и запись в БД.
function generateProgressionProposals(params:{
 workoutId:number;date:string;plan:{title:string;type:string};
 painAfter:number;effort:string;workoutComplete:boolean;
 exercises:Map<string,{weight:number;reps:number;difficulty:string}>;
}){
 const coachAction=computeCoachActionForDate(params.date,params.plan);
 const insertDecision=db.prepare(`INSERT INTO progression_decisions
  (workout_id,exercise,action,reason_code,reason,used_signals,limited_data,from_weight,from_reps,to_weight,to_reps,pain_after,effort,workout_complete,coach_action,target_max_reps,status)
  VALUES (@workoutId,@exercise,@action,@reasonCode,@reason,@usedSignals,@limitedData,@fromWeight,@fromReps,@toWeight,@toReps,@painAfter,@effort,@workoutComplete,@coachAction,@targetMaxReps,'pending')`);
 for(const exercise of params.exercises.keys()){
  const history=db.prepare("SELECT date,weight,reps,difficulty FROM strength_logs WHERE exercise=? ORDER BY date DESC,id DESC LIMIT 10").all(exercise) as {date:string;weight:number;reps:number;difficulty:string}[];
  const targetMaxReps=targetMaxRepsFor(exercise);
  const proposal=buildExerciseProgression({
   exercise,painAfter:params.painAfter,effort:params.effort,workoutComplete:params.workoutComplete,
   coachAction:coachAction as any,history,targetMaxReps,
  });
  if(proposal.action==="no-change")continue;
  const previous=db.prepare("SELECT status,action,reason_code reasonCode,from_weight fromWeight,from_reps fromReps,to_weight toWeight,to_reps toReps FROM progression_decisions WHERE exercise=? ORDER BY id DESC LIMIT 1").get(exercise) as any;
  const previousDecision=previous?{
   status:previous.status as ProgressionStatus,action:previous.action as ProgressionAction,reasonCode:previous.reasonCode,
   from:{weight:previous.fromWeight,reps:previous.fromReps},to:{weight:previous.toWeight,reps:previous.toReps},
  }:null;
  if(shouldSuppressRepeat(previousDecision,proposal))continue;
  insertDecision.run({
   workoutId:params.workoutId,exercise,action:proposal.action,reasonCode:proposal.reasonCode,reason:proposal.reason,
   usedSignals:JSON.stringify(proposal.usedSignals),limitedData:proposal.limitedData?1:0,
   fromWeight:proposal.from.weight,fromReps:proposal.from.reps,toWeight:proposal.to.weight,toReps:proposal.to.reps,
   painAfter:params.painAfter,effort:params.effort,workoutComplete:params.workoutComplete?1:0,
   coachAction:coachAction||"",targetMaxReps:targetMaxReps,
  });
 }
}

async function aiEstimateFood(raw:string,key:string){
 const prompt=`Ты нутрициолог. Пользователь описал приём пищи обычным текстом, без точных граммовок. Определи каждое блюдо и оцени его КБЖУ по типичному размеру порции. Ответь ТОЛЬКО строками строго в формате:\nНазвание блюда — 250 ккал (Б 20 / Ж 10 / У 15)\nОдна строка на блюдо, числа целые, названия по-русски. Больше никакого текста.\n\nОписание приёма пищи: ${raw}`;
 try{
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:"claude-sonnet-5",max_tokens:2000,temperature:0.2,messages:[{role:"user",content:[{type:"text",text:prompt}]}]})});
  if(!r.ok)return null;
  const j=await r.json(),textOut=String((j.content||[]).map((p:any)=>p.text||"").join("\n")).trim();
  const parsed=parseFood(textOut);
  return parsed.items.length?parsed:null;
 }catch{return null}
}
function parseFood(raw:string){const items:any[]=[];for(const line of raw.split(/\r?\n/)){const clean=line.replace(/\*\*/g,"").trim(),kcal=clean.match(/(.+?)(?:—|-)\s*[≈~]?\s*(\d+(?:[.,]\d+)?)\s*ккал/i),macros=clean.match(/\(\s*Б\s*(\d+(?:[.,]\d+)?)\s*\/\s*Ж\s*(\d+(?:[.,]\d+)?)\s*\/\s*У\s*(\d+(?:[.,]\d+)?)\s*\)/i);if(kcal&&macros){const n=(s:string)=>Number(s.replace(",","."));items.push({name:kcal[1].replace(/^[^\p{L}\p{N}]+/u,"").trim(),calories:n(kcal[2]),protein:n(macros[1]),fat:n(macros[2]),carbs:n(macros[3])})}}return items.reduce((t,x)=>({items,calories:t.calories+x.calories,protein:t.protein+x.protein,fat:t.fat+x.fat,carbs:t.carbs+x.carbs}),{items,calories:0,protein:0,fat:0,carbs:0})}
function jsonArray(raw:any){try{const value=JSON.parse(raw);return Array.isArray(value)?value:[]}catch{return[]}}
