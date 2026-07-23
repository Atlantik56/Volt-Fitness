import { requireAuth, sameOrigin } from "@/lib/auth";
export const runtime="nodejs";
const sig:{[k:string]:(b:Buffer)=>boolean}={"image/jpeg":b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff,"image/png":b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"image/webp":b=>b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WEBP"};
const prompt="Ты нутрициолог. На фото — приём пищи. Определи каждое блюдо, оцени размер порции на глаз и её КБЖУ. Ответь ТОЛЬКО строками строго в формате:\nНазвание блюда — 250 ккал (Б 20 / Ж 10 / У 15)\nОдна строка на блюдо, числа целые, названия по-русски, без пояснений и любого другого текста. Если еды на фото нет, ответь ровно: НЕТ ЕДЫ";
export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 const key=process.env.GEMINI_API_KEY;if(!key)return Response.json({error:"Распознавание по фото не настроено на сервере"},{status:503});
 const form=await req.formData(),file=form.get("photo");
 if(!(file instanceof File)||!sig[file.type]||file.size<16||file.size>8_000_000)return Response.json({error:"JPEG, PNG или WebP до 8 МБ"},{status:400});
 const bytes=Buffer.from(await file.arrayBuffer());if(!sig[file.type](bytes))return Response.json({error:"Содержимое файла не соответствует формату"},{status:400});
 try{
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":key},signal:AbortSignal.timeout(45000),body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:file.type,data:bytes.toString("base64")}},{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:2000}})});
  if(!r.ok)return Response.json({error:`Сервис распознавания недоступен (${r.status})`},{status:502});
  const j=await r.json(),text=String((j.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||"").join("\n")).trim();
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>/ккал/i.test(s)&&/\(\s*Б\s*\d/i.test(s));
  if(!lines.length)return Response.json({error:/НЕТ ЕДЫ/i.test(text)?"На фото не нашлось еды":"Не удалось распознать блюда, попробуйте другое фото"},{status:422});
  return Response.json({ok:true,text:lines.join("\n")});
 }catch{return Response.json({error:"Сервис распознавания не ответил, попробуйте ещё раз"},{status:504})}
}
