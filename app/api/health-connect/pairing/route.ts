import { requireAuth,sameOrigin,USERNAME } from "@/lib/auth";
import { createHealthPairing,healthBridgeStatus,revokeHealthDevice } from "@/lib/health-connect";
export const runtime="nodejs";

export async function GET(){
 const denied=await requireAuth();if(denied)return denied;
 return Response.json(healthBridgeStatus(USERNAME),{headers:{"cache-control":"no-store"}});
}

export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;
 if(!sameOrigin(req))return new Response(null,{status:403});
 const pairing=createHealthPairing(USERNAME);
 return Response.json({ok:true,pairingToken:pairing.token,expiresAt:new Date(pairing.expiresAt).toISOString()},{status:201,headers:{"cache-control":"no-store"}});
}

export async function DELETE(req:Request){
 const denied=await requireAuth();if(denied)return denied;
 if(!sameOrigin(req))return new Response(null,{status:403});
 const body=await req.json().catch(()=>({}));
 return revokeHealthDevice(body.deviceId,USERNAME)?Response.json({ok:true}):Response.json({error:"Устройство не найдено"},{status:404});
}
