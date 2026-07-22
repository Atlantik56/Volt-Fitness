import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

export const USERNAME = "Atlantik";
const COOKIE = "volt_session";
export async function passwordDigest(password:string, salt:string){return scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString("hex")}
export async function verifyPassword(password:string, salt:string, expected:string){const actual=Buffer.from(await passwordDigest(password,salt),"hex"), wanted=Buffer.from(expected,"hex");return actual.length===wanted.length&&timingSafeEqual(actual,wanted)}
const hashToken=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function createSession(remember=true){const days=remember?180:1, maxAge=days*86400, token=randomBytes(32).toString("base64url"), expires=Date.now()+maxAge*1000;db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());db.prepare("INSERT INTO sessions(token_hash,username,expires_at) VALUES(?,?,?)").run(hashToken(token),USERNAME,expires);(await cookies()).set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge});}
export async function destroySession(){const jar=await cookies(),token=jar.get(COOKIE)?.value;if(token)db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));jar.delete(COOKIE)}
export async function isAuthenticated(){const token=(await cookies()).get(COOKIE)?.value;if(!token)return false;return !!db.prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?").get(hashToken(token),Date.now())}
export async function requireAuth(){if(!(await isAuthenticated()))return Response.json({error:"Требуется авторизация"},{status:401});return null}
export function sameOrigin(req:Request){const value=req.headers.get("origin");if(!value)return true;try{const origin=new URL(value),forwardedHost=req.headers.get("x-forwarded-host")?.split(",")[0].trim(),host=forwardedHost||req.headers.get("host")||new URL(req.url).host,forwardedProto=req.headers.get("x-forwarded-proto")?.split(",")[0].trim(),protocol=forwardedProto||new URL(req.url).protocol.replace(":","");return origin.host===host&&origin.protocol===`${protocol}:`}catch{return false}}
