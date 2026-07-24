import { requireAuth, sameOrigin } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
export const runtime="nodejs";
const sig:{[k:string]:(b:Buffer)=>boolean}={"image/jpeg":b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff,"image/png":b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"image/webp":b=>b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WEBP"};
const prompt="Ты нутрициолог. На фото — приём пищи. Определи каждое блюдо, оцени размер порции на глаз и её КБЖУ. Фотографий может быть несколько: само блюдо и, возможно, чек или меню с названиями и граммовками — если чек есть, бери точные названия и веса блюд из него, а состав и размер порций сверяй с фото еды. Чек сам по себе едой не является, перечисли только съеденные блюда. Ответь ТОЛЬКО строками строго в формате:\nНазвание блюда — 250 ккал (Б 20 / Ж 10 / У 15)\nОдна строка на блюдо, числа целые, названия по-русски. После списка блюд добавь ровно одну строку, начинающуюся с «Итог: » — короткая оценка приёма пищи (1–2 предложения) для человека на дефиците ~1700 ккал/день с целью 150 г белка в день: насколько сбалансировано, чего не хватает или что лишнее, дружелюбно и без морализаторства. Больше никакого текста. Если еды на фото нет, ответь ровно: НЕТ ЕДЫ";
export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 const key=getSetting("anthropic_api_key")||process.env.ANTHROPIC_API_KEY;if(!key)return Response.json({error:"Распознавание по фото не настроено на сервере"},{status:503});
 const form=await req.formData(),files=form.getAll("photo").filter(f=>f instanceof File) as File[];
 if(!files.length||files.length>3||files.some(f=>!sig[f.type]||f.size<16||f.size>8_000_000))return Response.json({error:"1–3 файла JPEG, PNG или WebP до 8 МБ каждый"},{status:400});
 const content:any[]=[];
 for(const f of files){const bytes=Buffer.from(await f.arrayBuffer());if(!sig[f.type](bytes))return Response.json({error:"Содержимое файла не соответствует формату"},{status:400});content.push({type:"image",source:{type:"base64",media_type:f.type,data:bytes.toString("base64")}})}
 content.push({type:"text",text:prompt});
 try{
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},signal:AbortSignal.timeout(60000),body:JSON.stringify({model:"claude-sonnet-5",max_tokens:8000,messages:[{role:"user",content}]})});
  if(!r.ok)return Response.json({error:`Сервис распознавания недоступен (${r.status})`},{status:502});
  const j=await r.json(),text=String((j.content||[]).map((p:any)=>p.text||"").join("\n")).trim();
  const rows=text.split(/\r?\n/).map(s=>s.trim()),lines=rows.filter(s=>/ккал/i.test(s)&&/\(\s*Б\s*\d/i.test(s)),note=(rows.find(s=>/^итог\s*:/i.test(s))||"").replace(/^итог\s*:\s*/i,"").slice(0,600);
  if(!lines.length)return Response.json({error:/НЕТ ЕДЫ/i.test(text)?"На фото не нашлось еды":"Не удалось распознать блюда, попробуйте другое фото"},{status:422});
  return Response.json({ok:true,text:lines.join("\n"),note});
 }catch{return Response.json({error:"Сервис распознавания не ответил, попробуйте ещё раз"},{status:504})}
}
