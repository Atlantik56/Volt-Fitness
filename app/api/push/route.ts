import { db } from "@/lib/db";
import { requireAuth,sameOrigin } from "@/lib/auth";
import { isSafePushEndpoint } from "@/lib/push";
export const runtime="nodejs";

export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 let b:any;try{b=await req.json()}catch{return Response.json({error:"Некорректный JSON"},{status:400})}
 const endpoint=typeof b?.endpoint==="string"?b.endpoint:"",p256dh=b?.keys?.p256dh,auth=b?.keys?.auth;
 if(!endpoint||!p256dh||!auth||!isSafePushEndpoint(endpoint))return Response.json({error:"Некорректная подписка"},{status:400});
 db.prepare("INSERT INTO push_subscriptions (endpoint,p256dh,auth) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth").run(endpoint,p256dh,auth);
 return Response.json({ok:true})
}

export async function DELETE(req:Request){
 const denied=await requireAuth();if(denied)return denied;if(!sameOrigin(req))return new Response(null,{status:403});
 let b:any;try{b=await req.json()}catch{return Response.json({error:"Некорректный JSON"},{status:400})}
 const endpoint=typeof b?.endpoint==="string"?b.endpoint:"";if(!endpoint)return Response.json({error:"Некорректная подписка"},{status:400});
 db.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").run(endpoint);
 return Response.json({ok:true})
}
