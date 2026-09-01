import { requireAuth, sameOrigin } from "@/lib/auth";
import { IntervalsApiError } from "@/lib/intervals-client";
import { getIntervalsStatus, syncIntervalsActivities } from "@/lib/intervals-service";

export const runtime="nodejs";

export async function GET(){
 const denied=await requireAuth();if(denied)return denied;
 return Response.json(getIntervalsStatus(),{headers:{"cache-control":"no-store"}});
}

const failure=(error:unknown)=>{
 if(error instanceof IntervalsApiError){
  const status=error.status===429?429:error.status===401||error.status===403?409:502;
  return Response.json({
   error:error.status===401||error.status===403?"intervals.icu отклонил API-ключ. Проверьте INTERVALS_API_KEY.":error.message,
   retryAfterSeconds:error.retryAfterSeconds,
  },{status});
 }
 return Response.json({error:error instanceof Error?error.message:"Не удалось синхронизировать intervals.icu"},{status:400});
};

/** Ручная синхронизация: первичный импорт и запасной путь, если вебхук не дошёл. */
export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 try{return Response.json({ok:true,...await syncIntervalsActivities()},{headers:{"cache-control":"no-store"}})}
 catch(error){return failure(error)}
}
