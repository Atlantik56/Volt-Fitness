import assert from "node:assert/strict";
import test from "node:test";
import { buildStravaAuthorizeUrl, hasStravaActivityScope, readStravaRateLimit, refreshStravaAccessToken, requestedStravaScope } from "@/lib/strava-client.ts";

test("OAuth URL запрашивает только настроенный activity read scope и state",()=>{
 const url=new URL(buildStravaAuthorizeUrl({clientId:"123",redirectUri:"http://localhost:3000/api/strava/callback",state:"state-123",scope:"activity:read"}));
 assert.equal(url.origin,"https://www.strava.com");
 assert.equal(url.pathname,"/oauth/authorize");
 assert.equal(url.searchParams.get("response_type"),"code");
 assert.equal(url.searchParams.get("scope"),"activity:read");
 assert.equal(url.searchParams.get("state"),"state-123");
 assert.equal(url.searchParams.has("activity:write"),false);
});

test("scope helper принимает read_all вместо read, но не наоборот",()=>{
 assert.equal(hasStravaActivityScope("activity:read_all","activity:read"),true);
 assert.equal(hasStravaActivityScope("activity:read","activity:read_all"),false);
 assert.equal(requestedStravaScope("unexpected"),"activity:read");
 assert.equal(requestedStravaScope("activity:read_all"),"activity:read_all");
});

test("rate-limit headers нормализуются без догадок",()=>{
 const parsed=readStravaRateLimit(new Headers({"x-ratelimit-limit":"200,2000","x-ratelimit-usage":"12,345","x-readratelimit-limit":"100,1000","x-readratelimit-usage":"7,88"}));
 assert.deepEqual(parsed,{limit15:200,limitDaily:2000,usage15:12,usageDaily:345,readLimit15:100,readLimitDaily:1000,readUsage15:7,readUsageDaily:88});
});

test("refresh lifecycle использует refresh_token grant и принимает ротацию токена",async()=>{
 let request:RequestInit|undefined;
 const fetcher=async(_url:string|URL|Request,init?:RequestInit)=>{request=init;return new Response(JSON.stringify({access_token:"new-access",refresh_token:"new-refresh",expires_at:2_000_000_000}),{status:200,headers:{"content-type":"application/json"}})};
 const token=await refreshStravaAccessToken({clientId:"123",clientSecret:"secret-secret",refreshToken:"old-refresh"},fetcher as typeof fetch);
 assert.equal(token.accessToken,"new-access");
 assert.equal(token.refreshToken,"new-refresh");
 const body=new URLSearchParams(String(request?.body));
 assert.equal(body.get("grant_type"),"refresh_token");
 assert.equal(body.get("refresh_token"),"old-refresh");
});
