import { claimHealthPairing } from "@/lib/health-connect";
export const runtime="nodejs";

export async function POST(req:Request){
 const contentLength=Number(req.headers.get("content-length")||0);
 if(contentLength>8_192)return Response.json({error:"Запрос слишком большой"},{status:413});
 const text=await req.text();
 if(new TextEncoder().encode(text).byteLength>8_192)return Response.json({error:"Запрос слишком большой"},{status:413});
 let body:unknown;try{body=JSON.parse(text)}catch{body=null}
 if(!body)return Response.json({error:"Некорректный JSON"},{status:400});
 const value=body as Record<string,unknown>;
 const result=claimHealthPairing(value.pairingToken,value.deviceName);
 if(!result.ok)return Response.json({error:result.error},{status:result.status});
 return Response.json({ok:true,deviceToken:result.deviceToken,deviceId:result.deviceId});
}
