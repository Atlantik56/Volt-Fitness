export const STRAVA_API_BASE="https://www.strava.com/api/v3";
export const STRAVA_AUTHORIZE_URL="https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL="https://www.strava.com/oauth/token";
export const STRAVA_REVOKE_URL="https://www.strava.com/oauth/revoke";

export type StravaActivityScope="activity:read"|"activity:read_all";
export type StravaRateLimit={limit15:number|null;limitDaily:number|null;usage15:number|null;usageDaily:number|null;readLimit15:number|null;readLimitDaily:number|null;readUsage15:number|null;readUsageDaily:number|null};
export type StravaTokenResponse={accessToken:string;refreshToken:string;expiresAt:number;scope:string;athlete:{id:string;name:string}};
export type StravaApiResponse<T>={data:T;rateLimit:StravaRateLimit};

export class StravaApiError extends Error{
 status:number;
 rateLimit:StravaRateLimit;
 retryAfterSeconds:number|null;
 constructor(message:string,status:number,rateLimit:StravaRateLimit,retryAfterSeconds:number|null=null){super(message);this.name="StravaApiError";this.status=status;this.rateLimit=rateLimit;this.retryAfterSeconds=retryAfterSeconds}
}

const pair=(value:string|null)=>{
 const values=String(value||"").split(",").map(item=>Number(item.trim()));
 return [Number.isFinite(values[0])?values[0]:null,Number.isFinite(values[1])?values[1]:null] as const;
};
export function readStravaRateLimit(headers:Headers):StravaRateLimit{
 const [limit15,limitDaily]=pair(headers.get("x-ratelimit-limit"));
 const [usage15,usageDaily]=pair(headers.get("x-ratelimit-usage"));
 const [readLimit15,readLimitDaily]=pair(headers.get("x-readratelimit-limit"));
 const [readUsage15,readUsageDaily]=pair(headers.get("x-readratelimit-usage"));
 return {limit15,limitDaily,usage15,usageDaily,readLimit15,readLimitDaily,readUsage15,readUsageDaily};
}

const messageFrom=(body:unknown,status:number)=>{
 if(body&&typeof body==="object"&&typeof (body as any).message==="string")return String((body as any).message).slice(0,240);
 return status===429?"Strava временно ограничила число запросов":"Strava API вернул ошибку";
};

async function jsonRequest<T>(url:string,init:RequestInit,fetcher:typeof fetch):Promise<StravaApiResponse<T>>{
 let response:Response;
 try{response=await fetcher(url,{...init,signal:AbortSignal.timeout(20_000)})}
 catch{throw new StravaApiError("Не удалось связаться со Strava",503,readStravaRateLimit(new Headers()))}
 const rateLimit=readStravaRateLimit(response.headers);
 const body=await response.json().catch(()=>null);
 if(!response.ok){
  const retry=Number(response.headers.get("retry-after"));
  throw new StravaApiError(messageFrom(body,response.status),response.status,rateLimit,Number.isFinite(retry)?retry:null);
 }
 return {data:body as T,rateLimit};
}

const tokenBody=(values:Record<string,string>)=>new URLSearchParams(values);
const tokenResponse=(data:any):StravaTokenResponse=>{
 if(!data||typeof data.access_token!=="string"||typeof data.refresh_token!=="string"||!Number.isFinite(Number(data.expires_at)))throw new Error("Strava вернула неполный набор OAuth-токенов");
 const athleteId=data.athlete?.id;
 return {accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Number(data.expires_at),scope:String(data.scope||""),athlete:{
  id:athleteId===undefined||athleteId===null?"":String(athleteId),
  name:[data.athlete?.firstname,data.athlete?.lastname].filter(Boolean).join(" ").trim(),
 }};
};

export function requestedStravaScope(raw=process.env.STRAVA_ACTIVITY_SCOPE||""):StravaActivityScope{
 return raw.trim()==="activity:read_all"?"activity:read_all":"activity:read";
}
export function hasStravaActivityScope(scope:string,required=requestedStravaScope()){
 const granted=new Set(scope.split(/[ ,]+/).filter(Boolean));
 return required==="activity:read_all"?granted.has("activity:read_all"):granted.has("activity:read")||granted.has("activity:read_all");
}

export function buildStravaAuthorizeUrl(input:{clientId:string;redirectUri:string;state:string;scope?:StravaActivityScope}){
 const url=new URL(STRAVA_AUTHORIZE_URL);
 url.searchParams.set("client_id",input.clientId);
 url.searchParams.set("redirect_uri",input.redirectUri);
 url.searchParams.set("response_type","code");
 url.searchParams.set("approval_prompt","auto");
 url.searchParams.set("scope",input.scope||requestedStravaScope());
 url.searchParams.set("state",input.state);
 return url.toString();
}

export async function exchangeStravaCode(input:{clientId:string;clientSecret:string;code:string;redirectUri:string},fetcher:typeof fetch=fetch){
 const {data}=await jsonRequest<any>(STRAVA_TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:tokenBody({
  client_id:input.clientId,client_secret:input.clientSecret,code:input.code,grant_type:"authorization_code",redirect_uri:input.redirectUri,
 })},fetcher);
 return tokenResponse(data);
}

export async function refreshStravaAccessToken(input:{clientId:string;clientSecret:string;refreshToken:string},fetcher:typeof fetch=fetch){
 const {data}=await jsonRequest<any>(STRAVA_TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:tokenBody({
  client_id:input.clientId,client_secret:input.clientSecret,grant_type:"refresh_token",refresh_token:input.refreshToken,
 })},fetcher);
 return tokenResponse({...data,scope:data.scope||"",athlete:data.athlete||{id:""}});
}

export async function revokeStravaToken(input:{clientId:string;clientSecret:string;token:string},fetcher:typeof fetch=fetch){
 const authorization=Buffer.from(`${input.clientId}:${input.clientSecret}`,"utf8").toString("base64");
 let response:Response;
 try{response=await fetcher(STRAVA_REVOKE_URL,{method:"POST",headers:{authorization:`Basic ${authorization}`,"content-type":"application/x-www-form-urlencoded"},body:tokenBody({token:input.token,token_type_hint:"refresh_token"}),signal:AbortSignal.timeout(20_000)})}
 catch{throw new StravaApiError("Не удалось отозвать доступ Strava",503,readStravaRateLimit(new Headers()))}
 if(!response.ok)throw new StravaApiError("Strava не подтвердила отзыв доступа",response.status,readStravaRateLimit(response.headers));
}

export async function listStravaActivities(accessToken:string,options:{after?:number;page?:number;perPage?:number}={},fetcher:typeof fetch=fetch):Promise<StravaApiResponse<any[]>>{
 const url=new URL(`${STRAVA_API_BASE}/athlete/activities`);
 if(options.after)url.searchParams.set("after",String(Math.floor(options.after)));
 url.searchParams.set("page",String(options.page||1));
 url.searchParams.set("per_page",String(Math.min(30,Math.max(1,options.perPage||30))));
 const result=await jsonRequest<unknown>(url.toString(),{headers:{authorization:`Bearer ${accessToken}`}},fetcher);
 if(!Array.isArray(result.data))throw new StravaApiError("Strava вернула некорректный список активностей",502,result.rateLimit);
 return {data:result.data,rateLimit:result.rateLimit};
}

export async function getStravaActivity(accessToken:string,activityId:string,fetcher:typeof fetch=fetch):Promise<StravaApiResponse<any>>{
 if(!/^\d{1,24}$/.test(activityId))throw new StravaApiError("Некорректный идентификатор активности Strava",400,readStravaRateLimit(new Headers()));
 return jsonRequest<any>(`${STRAVA_API_BASE}/activities/${activityId}?include_all_efforts=false`,{headers:{authorization:`Bearer ${accessToken}`}},fetcher);
}
