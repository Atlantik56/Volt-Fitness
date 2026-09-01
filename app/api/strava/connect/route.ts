import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { buildStravaAuthorizeUrl, requestedStravaScope } from "@/lib/strava-client";
import { getStravaConfig } from "@/lib/strava-service";

export const runtime="nodejs";
const STATE_COOKIE="volt_strava_oauth_state";

export async function GET(){
 const denied=await requireAuth();if(denied)return denied;
 try{
  const config=getStravaConfig(),state=randomBytes(32).toString("base64url");
  (await cookies()).set(STATE_COOKIE,state,{httpOnly:true,secure:new URL(config.redirectUri).protocol==="https:",sameSite:"lax",path:"/api/strava/callback",maxAge:600});
  return Response.redirect(buildStravaAuthorizeUrl({clientId:config.clientId,redirectUri:config.redirectUri,state,scope:requestedStravaScope()}),302);
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Strava не настроена"},{status:503})}
}
