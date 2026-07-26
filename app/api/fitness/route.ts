import { db } from "@/lib/db";
import { requireAuth,sameOrigin } from "@/lib/auth";
import { getSetting,setSetting } from "@/lib/settings";
import { saveWorkout,updateWorkout,insertStrengthLog,deleteStrengthLog } from "@/lib/workout-service";
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
  const result=saveWorkout(b);if(!result.ok)return Response.json({error:result.error},{status:result.status})
 }else if(b.action==="updateWorkout"){
  const result=updateWorkout(b);if(!result.ok)return Response.json({error:result.error},{status:result.status})
 }else if(b.action==="activity"){
  if(!dateOk(b.date))return Response.json({error:"Некорректная дата"},{status:400});db.prepare("INSERT INTO daily_activity (date,steps,active_minutes,calories,beers,sleep_hours) VALUES (?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET steps=excluded.steps,active_minutes=excluded.active_minutes,calories=excluded.calories,beers=excluded.beers,sleep_hours=excluded.sleep_hours").run(b.date,num(b.steps)||0,num(b.activeMinutes,0,1440)||0,num(b.calories,0,20000)||0,num(b.beers,0,100)||0,num(b.sleepHours,0,24)||0)
 }else if(b.action==="wellness"){
  const energy=num(b.energy,1,5),pain=num(b.pain,0,10);if(!dateOk(b.date)||energy===null||pain===null)return Response.json({error:"Проверьте самочувствие"},{status:400});db.prepare("INSERT INTO wellness_logs(date,energy,pain,pain_area,note) VALUES(?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET energy=excluded.energy,pain=excluded.pain,pain_area=excluded.pain_area,note=excluded.note").run(b.date,energy,pain,text(b.painArea,80),text(b.note,300))
 }else if(b.action==="schedule"){
  if(!dateOk(b.originalDate)||!dateOk(b.scheduledDate)||!text(b.planTitle))return Response.json({error:"Проверьте даты"},{status:400});db.prepare("INSERT INTO schedule_overrides(original_date,scheduled_date,plan_title,replacement_title) VALUES(?,?,?,?) ON CONFLICT(original_date) DO UPDATE SET scheduled_date=excluded.scheduled_date,replacement_title=excluded.replacement_title").run(b.originalDate,b.scheduledDate,text(b.planTitle),text(b.replacementTitle))
 }else if(b.action==="strength"){
  const result=insertStrengthLog(b);if(!result.ok)return Response.json({error:result.error},{status:result.status})
 }else if(b.action==="deleteStrength"){
  const result=deleteStrengthLog(b);if(!result.ok)return Response.json({error:result.error},{status:result.status})
 }else if(b.action==="mood"){
  const moods=["😊","🙂","😐","😔","😢","😡"];if(!dateOk(b.date)||!moods.includes(b.mood))return Response.json({error:"Некорректная запись настроения"},{status:400});db.prepare("INSERT INTO mood_logs (date,mood,note) VALUES (?,?,?)").run(b.date,b.mood,text(b.note,300))
 }else if(b.action==="deleteMood"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});db.prepare("DELETE FROM mood_logs WHERE id=?").run(id)
 }else if(b.action==="food"){
  const raw=typeof b.rawText==="string"?b.rawText.trim().slice(0,12000):"",mealType=["Завтрак","Обед","Ужин","Перекус"].includes(b.mealType)?b.mealType:"Перекус";if(!dateOk(b.date)||!raw)return Response.json({error:"Добавьте дату и текст приёма пищи"},{status:400});
  let parsed=parseFood(raw);
  if(!parsed.items.length){const key=getSetting("anthropic_api_key")||process.env.ANTHROPIC_API_KEY;if(key)parsed=await aiEstimateFood(raw,key)}
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

async function callAnthropic(key:string,body:string){
 // Долгоживущий Node-процесс переиспользует keep-alive сокеты; после простоя
 // они иногда рвутся на стороне сети (ECONNRESET), и fetch падает с generic
 // "TypeError: fetch failed". Один быстрый повтор на свежем сокете лечит это.
 for(let attempt=0;attempt<2;attempt++){
  try{
   return await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},signal:AbortSignal.timeout(30000),body});
  }catch(err){
   if(attempt===1)throw err;
   await new Promise(r=>setTimeout(r,300));
  }
 }
 throw new Error("unreachable");
}

async function aiEstimateFood(raw:string,key:string){
 const prompt=`Ты нутрициолог. Пользователь описал приём пищи обычным текстом, без точных граммовок. Определи каждое блюдо и оцени его КБЖУ по типичному размеру порции. Ответь ТОЛЬКО строками строго в формате:\nНазвание блюда — 250 ккал (Б 20 / Ж 10 / У 15)\nОдна строка на блюдо, числа целые, названия по-русски. Больше никакого текста.\n\nОписание приёма пищи: ${raw}`;
 try{
  const body=JSON.stringify({model:"claude-sonnet-5",max_tokens:2000,messages:[{role:"user",content:[{type:"text",text:prompt}]}]});
  const r=await callAnthropic(key,body);
  if(!r.ok){console.error("aiEstimateFood: Anthropic вернул",r.status);return{items:[],calories:0,protein:0,fat:0,carbs:0}}
  const j=await r.json(),textOut=String((j.content||[]).map((p:any)=>p.text||"").join("\n")).trim();
  return parseFood(textOut);
 }catch(err){console.error("aiEstimateFood:",err);return{items:[],calories:0,protein:0,fat:0,carbs:0}}
}
function parseFood(raw:string){const items:any[]=[];for(const line of raw.split(/\r?\n/)){const clean=line.replace(/\*\*/g,"").trim(),kcal=clean.match(/(.+?)(?:—|-)\s*[≈~]?\s*(\d+(?:[.,]\d+)?)\s*ккал/i),macros=clean.match(/\(\s*Б\s*(\d+(?:[.,]\d+)?)\s*\/\s*Ж\s*(\d+(?:[.,]\d+)?)\s*\/\s*У\s*(\d+(?:[.,]\d+)?)\s*\)/i);if(kcal&&macros){const n=(s:string)=>Number(s.replace(",","."));items.push({name:kcal[1].replace(/^[^\p{L}\p{N}]+/u,"").trim(),calories:n(kcal[2]),protein:n(macros[1]),fat:n(macros[2]),carbs:n(macros[3])})}}return items.reduce((t,x)=>({items,calories:t.calories+x.calories,protein:t.protein+x.protein,fat:t.fat+x.fat,carbs:t.carbs+x.carbs}),{items,calories:0,protein:0,fat:0,carbs:0})}
function jsonArray(raw:any){try{const value=JSON.parse(raw);return Array.isArray(value)?value:[]}catch{return[]}}
