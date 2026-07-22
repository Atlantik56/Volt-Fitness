import { db } from "@/lib/db";
import { requireAuth,sameOrigin } from "@/lib/auth";
export const runtime="nodejs";
const dateOk=(x:any)=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const num=(x:any,min=0,max=100000)=>{const n=Number(x);return Number.isFinite(n)&&n>=min&&n<=max?n:null};
const text=(x:any,max=120)=>typeof x==="string"?x.trim().slice(0,max):"";

export async function GET(){
 const denied=await requireAuth();if(denied)return denied;
 const profile=db.prepare("SELECT id,name,height,start_weight startWeight,target_weight targetWeight,program_start programStart FROM profile WHERE id=1").get();
 const workouts=db.prepare("SELECT * FROM workout_logs ORDER BY date DESC,id DESC").all();
 const measurements=db.prepare("SELECT * FROM measurements ORDER BY date DESC,id DESC").all();
 const photos=(db.prepare("SELECT id,date,created_at createdAt FROM photos ORDER BY created_at ASC,id ASC").all() as any[]).map(x=>({...x,url:`/api/photos?id=${x.id}`}));
 const activity=db.prepare("SELECT id,date,steps,active_minutes activeMinutes,calories FROM daily_activity ORDER BY date DESC").all();
 const foodLogs=(db.prepare("SELECT id,date,items_json itemsJson,calories,protein,fat,carbs,created_at createdAt FROM food_logs ORDER BY date DESC,id DESC").all() as any[]).map(x=>({...x,items:JSON.parse(x.itemsJson),itemsJson:undefined}));
 return Response.json({profile,workouts,measurements,activity,photos,foodLogs},{headers:{"cache-control":"no-store"}})
}

export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 let b:any;try{b=await req.json()}catch{return Response.json({error:"Некорректный JSON"},{status:400})}
 if(b.action==="profile"){
  const name=text(b.name,40),height=num(b.height,100,250),start=num(b.startWeight,30,350),target=num(b.targetWeight,30,350);if(!name||!height||!start||!target)return Response.json({error:"Проверьте данные профиля"},{status:400});db.prepare("UPDATE profile SET name=?,height=?,start_weight=?,target_weight=? WHERE id=1").run(name,height,start,target)
 }else if(b.action==="measurement"){
  if(!dateOk(b.date))return Response.json({error:"Некорректная дата"},{status:400});const keys=["weight","waist","chest","biceps","thigh","neck"],vals=keys.map(k=>b[k]===""||b[k]==null?null:num(b[k],1,400));if(vals.some((x,i)=>x===null&&b[keys[i]]))return Response.json({error:"Некорректный замер"},{status:400});db.prepare("INSERT INTO measurements (date,weight,waist,chest,biceps,thigh,neck) VALUES (?,?,?,?,?,?,?)").run(b.date,...vals)
 }else if(b.action==="workout"){
  if(!dateOk(b.date)||!text(b.title)||!Array.isArray(b.completed))return Response.json({error:"Некорректная тренировка"},{status:400});db.prepare("INSERT INTO workout_logs (date,type,title,completed,rounds) VALUES (?,?,?,?,?)").run(b.date,text(b.type,40),text(b.title),JSON.stringify(b.completed.slice(0,200)),num(b.rounds,1,20)||1)
 }else if(b.action==="activity"){
  if(!dateOk(b.date))return Response.json({error:"Некорректная дата"},{status:400});db.prepare("INSERT INTO daily_activity (date,steps,active_minutes,calories) VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET steps=excluded.steps,active_minutes=excluded.active_minutes,calories=excluded.calories").run(b.date,num(b.steps)||0,num(b.activeMinutes,0,1440)||0,num(b.calories,0,20000)||0)
 }else if(b.action==="food"){
  const raw=typeof b.rawText==="string"?b.rawText.trim().slice(0,12000):"";if(!dateOk(b.date)||!raw)return Response.json({error:"Добавьте дату и текст приёма пищи"},{status:400});const parsed=parseFood(raw);if(!parsed.items.length)return Response.json({error:"Не удалось распознать строки. Формат: Блюдо — 130 ккал (Б 10 / Ж 8 / У 2)"},{status:400});db.prepare("INSERT INTO food_logs(date,raw_text,items_json,calories,protein,fat,carbs) VALUES(?,?,?,?,?,?,?)").run(b.date,raw,JSON.stringify(parsed.items),parsed.calories,parsed.protein,parsed.fat,parsed.carbs);return Response.json({ok:true,parsed})
 }else return Response.json({error:"Неизвестное действие"},{status:400});
 return Response.json({ok:true})
}

function parseFood(raw:string){const items:any[]=[];for(const line of raw.split(/\r?\n/)){const clean=line.replace(/\*\*/g,"").trim(),kcal=clean.match(/(.+?)(?:—|-)\s*[≈~]?\s*(\d+(?:[.,]\d+)?)\s*ккал/i),macros=clean.match(/\(\s*Б\s*(\d+(?:[.,]\d+)?)\s*\/\s*Ж\s*(\d+(?:[.,]\d+)?)\s*\/\s*У\s*(\d+(?:[.,]\d+)?)\s*\)/i);if(kcal&&macros){const n=(s:string)=>Number(s.replace(",","."));items.push({name:kcal[1].replace(/^[^\p{L}\p{N}]+/u,"").trim(),calories:n(kcal[2]),protein:n(macros[1]),fat:n(macros[2]),carbs:n(macros[3])})}}return items.reduce((t,x)=>({items,calories:t.calories+x.calories,protein:t.protein+x.protein,fat:t.fat+x.fat,carbs:t.carbs+x.carbs}),{items,calories:0,protein:0,fat:0,carbs:0})}
