import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { exchangeStravaCode, hasStravaActivityScope, requestedStravaScope } from "@/lib/strava-client";
import { getStravaConfig, saveStravaConnection } from "@/lib/strava-service";

export const runtime="nodejs";
const STATE_COOKIE="volt_strava_oauth_state";
const safeEqual=(left:string,right:string)=>{const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b)};
const profileRedirect=(origin:string,status:string)=>{const url=new URL("/",origin);url.searchParams.set("section","profile");url.searchParams.set("strava",status);return url};

export async function GET(req:Request){
 const denied=await requireAuth();if(denied)return denied;
 let config;try{config=getStravaConfig()}catch{return Response.json({error:"Strava не настроена"},{status:503})}
 const url=new URL(req.url),jar=await cookies(),expected=jar.get(STATE_COOKIE)?.value||"";
 jar.set(STATE_COOKIE,"",{httpOnly:true,secure:new URL(config.redirectUri).protocol==="https:",sameSite:"lax",path:"/api/strava/callback",maxAge:0});
 const origin=new URL(config.redirectUri).origin;
 if(url.searchParams.get("error")==="access_denied")return Response.redirect(profileRedirect(origin,"denied"),303);
 const state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
 if(!expected||!state||!safeEqual(expected,state))return Response.redirect(profileRedirect(origin,"state_error"),303);
 if(!code||code.length>512)return Response.redirect(profileRedirect(origin,"code_error"),303);
 try{
  const tokens=await exchangeStravaCode({clientId:config.clientId,clientSecret:config.clientSecret,code,redirectUri:config.redirectUri});
  const acceptedScope=tokens.scope||url.searchParams.get("scope")||"";
  if(!hasStravaActivityScope(acceptedScope,requestedStravaScope()))return Response.redirect(profileRedirect(origin,"scope_error"),303);
  saveStravaConnection({...tokens,scope:acceptedScope});
  return Response.redirect(profileRedirect(origin,"connected"),303);
 }catch{return Response.redirect(profileRedirect(origin,"connect_error"),303)}
}
