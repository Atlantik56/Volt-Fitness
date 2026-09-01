import { timingSafeEqual } from "node:crypto";
import { getStravaWebhookConfig } from "@/lib/strava-service";
import { processPendingStravaWebhookEvents } from "@/lib/strava-webhook";

export const runtime="nodejs";
const safeEqual=(left:string,right:string)=>{const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b)};

export async function POST(req:Request){
 let config;try{config=getStravaWebhookConfig()}catch{return Response.json({error:"Webhook Strava не настроен"},{status:503})}
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!bearer||!safeEqual(bearer,config.processToken))return new Response(null,{status:401});
 return Response.json({ok:true,...await processPendingStravaWebhookEvents({limit:20})},{headers:{"cache-control":"no-store"}});
}
