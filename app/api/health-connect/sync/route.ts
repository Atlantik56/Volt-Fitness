import { readBoundedBody } from "@/lib/bounded-request-body";
import { authenticateHealthDevice,ingestHealthSync,MAX_HEALTH_SYNC_BYTES } from "@/lib/health-connect";
export const runtime="nodejs";

export async function POST(req:Request){
 const device=authenticateHealthDevice(req);
 if(!device)return Response.json({error:"Устройство Health Bridge не авторизовано"},{status:401});
 const contentLength=Number(req.headers.get("content-length")||0);
 if(contentLength>MAX_HEALTH_SYNC_BYTES)return Response.json({error:"Пакет Health Connect слишком большой"},{status:413});
 let text:string;try{text=await readBoundedBody(req,256000)}catch{return Response.json({error:"Запрос слишком большой или некорректный"},{status:413})}
 if(new TextEncoder().encode(text).byteLength>MAX_HEALTH_SYNC_BYTES)return Response.json({error:"Пакет Health Connect слишком большой"},{status:413});
 let body:unknown;try{body=JSON.parse(text)}catch{return Response.json({error:"Некорректный JSON"},{status:400})}
 const result=ingestHealthSync(device,body);
 return result.ok?Response.json(result):Response.json({error:result.error,issues:result.issues},{status:"status" in result?result.status:422});
}
