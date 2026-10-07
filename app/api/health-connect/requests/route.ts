import { requireAuth,sameOrigin,USERNAME } from "@/lib/auth";
import { createHealthSyncRequest,getHealthSyncRequest } from "@/lib/health-sync-requests";
import { readBoundedBody, RequestBodyTooLarge } from "@/lib/bounded-request-body";
import { z } from "zod";
export const runtime="nodejs";
const headers={"cache-control":"private, no-store"};
export async function GET(req:Request){
 const denied=await requireAuth();if(denied)return denied;
 const id=new URL(req.url).searchParams.get("id")||"";
 const result=getHealthSyncRequest(USERNAME,id);
 return result?Response.json(result,{headers}):Response.json({error:"Синхронизация не найдена"},{status:404,headers});
}
export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 let body: unknown;
 try { body=JSON.parse(await readBoundedBody(req,2048)); }
 catch(error) { return Response.json({error:"Некорректный запрос"},{status:error instanceof RequestBodyTooLarge?413:400,headers}); }
 const parsed=z.object({deviceId:z.number().int().positive()}).strict().safeParse(body);
 if(!parsed.success)return Response.json({error:"Некорректный запрос"},{status:400,headers});
 const result=createHealthSyncRequest(USERNAME,parsed.data.deviceId);
 return result?Response.json(result,{status:201,headers}):Response.json({error:"Устройство не подключено"},{status:400,headers});
}
