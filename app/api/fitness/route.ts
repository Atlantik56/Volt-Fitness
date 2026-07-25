import { db } from "@/lib/db";
import { requireAuth,sameOrigin } from "@/lib/auth";
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
 return Response.json({profile,workouts,measurements,activity,photos,foodLogs,moodLogs,strengthLogs,wellnessLogs,scheduleOverrides},{headers:{"cache-control":"no-store"}})
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
  const duration=num(b.durationSeconds,0,86400),rest=num(b.restSeconds,0,86400),minHr=num(b.minHeartRate,0,250),avgHr=num(b.avgHeartRate,0,250),maxHr=num(b.maxHeartRate,0,250),calories=num(b.calories,0,10000),distance=num(b.distanceMeters,0,1000000),speed=num(b.avgSpeed,0,200),details=Array.isArray(b.details)?b.details.slice(0,200).map((x:any)=>({key:text(x.key,40),name:text(x.name,120),originalName:text(x.originalName,120)||text(x.name,120),value:num(x.value,0,100000)||0,weight:num(x.weight,0,500)||0,difficulty:["Легко","Нормально","Тяжело","Боль"].includes(x.difficulty)?x.difficulty:"Нормально",unit:x.unit==="сек"?"сек":"повт."})):[];
  if(!dateOk(b.date)||!text(b.title)||!Array.isArray(b.completed)||duration===null||rest===null)return Response.json({error:"Некорректная тренировка"},{status:400});
  db.transaction(()=>{
   const workout=db.prepare("INSERT INTO workout_logs (date,type,title,completed,rounds,duration_seconds,rest_seconds,details) VALUES (?,?,?,?,?,?,?,?)").run(b.date,text(b.type,40),text(b.title),JSON.stringify(b.completed.slice(0,200)),num(b.rounds,1,20)||1,duration,rest,JSON.stringify(details));
   db.prepare("UPDATE workout_logs SET min_heart_rate=?,avg_heart_rate=?,max_heart_rate=?,calories=?,distance_meters=?,avg_speed=?,effort=?,pain_after=? WHERE id=?").run(minHr||0,avgHr||0,maxHr||0,calories||0,distance||0,speed||0,["Легко","Нормально","Тяжело","Боль"].includes(b.effort)?b.effort:"",num(b.painAfter,0,10)||0,workout.lastInsertRowid);
   if(text(b.type,40)==="Силовая"){
    const grouped=new Map<string,{weight:number;reps:number;difficulty:string}>();
    const difficultyRank:Record<string,number>={Легко:0,Нормально:1,Тяжело:2,Боль:3};
    for(const item of details){const current=grouped.get(item.originalName);if(!current)grouped.set(item.originalName,{weight:item.weight,reps:item.value,difficulty:item.difficulty});else{current.weight=Math.max(current.weight,item.weight);current.reps=Math.max(current.reps,item.value);if(difficultyRank[item.difficulty]>difficultyRank[current.difficulty])current.difficulty=item.difficulty}}
    const insert=db.prepare("INSERT INTO strength_logs (date,exercise,weight,reps,difficulty) VALUES (?,?,?,?,?)");
    for(const [exercise,item] of grouped)insert.run(b.date,exercise,item.weight,item.reps,item.difficulty);
   }
  })()
 }else if(b.action==="updateWorkout"){
  const id=Number(b.id),duration=num(b.durationSeconds,0,86400),rest=num(b.restSeconds,0,86400),rounds=num(b.rounds,1,20),minHr=num(b.minHeartRate,0,250),avgHr=num(b.avgHeartRate,0,250),maxHr=num(b.maxHeartRate,0,250),calories=num(b.calories,0,10000),distance=num(b.distanceMeters,0,1000000),speed=num(b.avgSpeed,0,200),details=Array.isArray(b.details)?b.details.slice(0,200).map((x:any)=>({key:text(x.key,40),name:text(x.name,120),originalName:text(x.originalName,120)||text(x.name,120),value:num(x.value,0,100000)||0,weight:num(x.weight,0,500)||0,difficulty:["Легко","Нормально","Тяжело","Боль"].includes(x.difficulty)?x.difficulty:"Нормально",unit:x.unit==="сек"?"сек":"повт."})):[];
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
  const raw=typeof b.rawText==="string"?b.rawText.trim().slice(0,12000):"",mealType=["Завтрак","Обед","Ужин","Перекус"].includes(b.mealType)?b.mealType:"Перекус";if(!dateOk(b.date)||!raw)return Response.json({error:"Добавьте дату и текст приёма пищи"},{status:400});const parsed=parseFood(raw);if(!parsed.items.length)return Response.json({error:"Не удалось распознать строки. Формат: Блюдо — 130 ккал (Б 10 / Ж 8 / У 2)"},{status:400});db.prepare("INSERT INTO food_logs(date,meal_type,raw_text,items_json,calories,protein,fat,carbs,note) VALUES(?,?,?,?,?,?,?,?,?)").run(b.date,mealType,raw,JSON.stringify(parsed.items),parsed.calories,parsed.protein,parsed.fat,parsed.carbs,text(b.note,600));return Response.json({ok:true,parsed})
 }else if(b.action==="deleteFood"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});db.prepare("DELETE FROM food_logs WHERE id=?").run(id)
 }else return Response.json({error:"Неизвестное действие"},{status:400});
 return Response.json({ok:true})
}

function parseFood(raw:string){const items:any[]=[];for(const line of raw.split(/\r?\n/)){const clean=line.replace(/\*\*/g,"").trim(),kcal=clean.match(/(.+?)(?:—|-)\s*[≈~]?\s*(\d+(?:[.,]\d+)?)\s*ккал/i),macros=clean.match(/\(\s*Б\s*(\d+(?:[.,]\d+)?)\s*\/\s*Ж\s*(\d+(?:[.,]\d+)?)\s*\/\s*У\s*(\d+(?:[.,]\d+)?)\s*\)/i);if(kcal&&macros){const n=(s:string)=>Number(s.replace(",","."));items.push({name:kcal[1].replace(/^[^\p{L}\p{N}]+/u,"").trim(),calories:n(kcal[2]),protein:n(macros[1]),fat:n(macros[2]),carbs:n(macros[3])})}}return items.reduce((t,x)=>({items,calories:t.calories+x.calories,protein:t.protein+x.protein,fat:t.fat+x.fat,carbs:t.carbs+x.carbs}),{items,calories:0,protein:0,fat:0,carbs:0})}
function jsonArray(raw:any){try{const value=JSON.parse(raw);return Array.isArray(value)?value:[]}catch{return[]}}
