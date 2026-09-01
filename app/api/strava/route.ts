import { requireAuth, sameOrigin } from "@/lib/auth";
import { StravaApiError } from "@/lib/strava-client";
import { disconnectStrava, getStravaStatus, reviewStravaImport, syncStravaActivities } from "@/lib/strava-service";
import { processPendingStravaWebhookEvents } from "@/lib/strava-webhook";

export const runtime="nodejs";

export async function GET(){
 const denied=await requireAuth();if(denied)return denied;
 return Response.json(getStravaStatus(),{headers:{"cache-control":"no-store"}});
}

const failure=(error:unknown)=>{
 if(error instanceof StravaApiError){
  const status=error.status===429?429:error.status===401||error.status===403?409:502;
  return Response.json({error:error.status===401||error.status===403?"Доступ Strava истёк или был отозван. Подключите аккаунт заново.":error.message,rateLimit:error.rateLimit,retryAfterSeconds:error.retryAfterSeconds},{status});
 }
 return Response.json({error:error instanceof Error?error.message:"Не удалось выполнить запрос Strava"},{status:400});
};

export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const drained=await processPendingStravaWebhookEvents({limit:10});
  if(drained.retried>0)return Response.json({error:"Webhook retry отложен из-за временной ошибки или лимита Strava"},{status:429,headers:{"cache-control":"no-store"}});
  return Response.json({ok:true,...await syncStravaActivities()},{headers:{"cache-control":"no-store"}});
 }catch(error){return failure(error)}
}

export async function DELETE(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 try{return Response.json(await disconnectStrava(),{headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}
}

export async function PATCH(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 const body=await req.json().catch(()=>null),result=reviewStravaImport({importId:body?.importId,action:body?.action,draftId:body?.draftId});
 return result.ok?Response.json(result):Response.json({error:result.error},{status:result.status});
}
