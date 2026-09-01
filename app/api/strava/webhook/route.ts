import { after } from "next/server";
import { getStravaWebhookConfig } from "@/lib/strava-service";
import { enqueueStravaWebhookEvent, parseStravaWebhookPayload, processPendingStravaWebhookEvents, verifyStravaWebhookChallenge } from "@/lib/strava-webhook";

export const runtime="nodejs";

export async function GET(req:Request){
 let config;try{config=getStravaWebhookConfig()}catch{return Response.json({error:"Webhook Strava не настроен"},{status:503})}
 const url=new URL(req.url),challenge=verifyStravaWebhookChallenge({mode:url.searchParams.get("hub.mode")||"",challenge:url.searchParams.get("hub.challenge")||"",token:url.searchParams.get("hub.verify_token")||""},config.verifyToken);
 if(!challenge)return Response.json({error:"Webhook verification failed"},{status:403});
 return Response.json({"hub.challenge":challenge},{headers:{"cache-control":"no-store"}});
}

export async function POST(req:Request){
 let config;try{config=getStravaWebhookConfig()}catch{return Response.json({error:"Webhook Strava не настроен"},{status:503})}
 const length=Number(req.headers.get("content-length")||0);if(length>20_000)return Response.json({error:"Payload too large"},{status:413});
 const text=await req.text();if(text.length>20_000)return Response.json({error:"Payload too large"},{status:413});
 let payload:unknown;try{payload=JSON.parse(text)}catch{return Response.json({error:"Malformed JSON"},{status:400})}
 const event=parseStravaWebhookPayload(payload);if(!event)return Response.json({error:"Malformed webhook event"},{status:400});
 const queued=enqueueStravaWebhookEvent(event,config.subscriptionId);if(queued.reason==="subscription_mismatch")return Response.json({error:"Unknown subscription"},{status:403});
 // Strava requires a 200 response within two seconds. Durable processing runs
 // after the acknowledgement; duplicate delivery only reuses the same event id.
 after(async()=>{await processPendingStravaWebhookEvents({limit:5})});
 return Response.json({ok:true,queued:queued.accepted,duplicate:queued.reason==="duplicate"},{headers:{"cache-control":"no-store"}});
}
