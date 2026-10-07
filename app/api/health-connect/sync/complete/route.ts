import { z } from "zod";
import { authenticateHealthDevice } from "@/lib/health-connect";
import { finishHealthSync } from "@/lib/health-sync-requests";
import { readBoundedBody, RequestBodyTooLarge } from "@/lib/bounded-request-body";
export const runtime="nodejs";
export async function POST(req:Request){
 const device=authenticateHealthDevice(req);if(!device)return Response.json({error:"Устройство отключено"},{status:401});
 let body:unknown;try{body=JSON.parse(await readBoundedBody(req,2048))}catch(error){return Response.json({error:"Некорректный запрос"},{status:error instanceof RequestBodyTooLarge?413:400})}
 const parsed=z.object({requestId:z.string().uuid().nullable(),success:z.boolean()}).strict().safeParse(body);
 if(!parsed.success)return Response.json({error:"Некорректный запрос"},{status:400});
 return finishHealthSync(device,parsed.data.requestId,parsed.data.success)?Response.json({ok:true},{headers:{"cache-control":"private, no-store"}}):Response.json({error:"Синхронизация недействительна"},{status:409});
}
