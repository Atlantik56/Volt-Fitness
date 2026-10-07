import { randomUUID } from "node:crypto";
import { db } from "./db.ts";

export const HEALTH_SYNC_REQUEST_TTL_MS=30*60_000;
export function createHealthSyncRequest(username:string,deviceId:unknown){
 const id=Number(deviceId);
 if(!Number.isSafeInteger(id)||!db.prepare("SELECT 1 FROM health_bridge_devices WHERE id=? AND username=? AND revoked_at IS NULL").get(id,username))return null;
 const requestId=randomUUID(),now=new Date().toISOString(),expires=Date.now()+HEALTH_SYNC_REQUEST_TTL_MS;
 db.prepare("DELETE FROM health_sync_requests WHERE expires_at<?").run(Date.now()-86400_000);
 db.prepare("INSERT INTO health_sync_requests(id,username,device_id,expires_at,created_at) VALUES(?,?,?,?,?)").run(requestId,username,id,expires,now);
 return {id:requestId,expiresAt:new Date(expires).toISOString(),status:"pending"};
}
export function getHealthSyncRequest(username:string,id:string){
 const row=db.prepare("SELECT id,status,accepted,expires_at expiresAt,finished_at finishedAt,error FROM health_sync_requests WHERE id=? AND username=?").get(id,username) as any;
 if(!row)return null;
 if(row.expiresAt<Date.now()&&["pending","running"].includes(row.status))return {...row,status:"failed",error:"Синхронизация не завершилась вовремя. Повторите запуск на телефоне."};
 return row;
}
export function validHealthSyncRequest(device:{id:number;username:string},id:string){
 return !!db.prepare("SELECT 1 FROM health_sync_requests WHERE id=? AND username=? AND device_id=? AND expires_at>=? AND status IN ('pending','running')").get(id,device.username,device.id,Date.now());
}
export function finishHealthSync(device:{id:number;username:string},id:string|null,success:boolean){
 let ok=false;
 db.transaction(()=>{
  if(!db.prepare("SELECT 1 FROM health_bridge_devices WHERE id=? AND username=? AND revoked_at IS NULL").get(device.id,device.username))return;
  if(id){
   const finished=db.prepare("SELECT status FROM health_sync_requests WHERE id=? AND username=? AND device_id=?").get(id,device.username,device.id) as {status:string}|undefined;
   if(finished?.status===(success?"completed":"failed")){ok=true;return;}
  }
  if(id&&!validHealthSyncRequest(device,id))return;
  const now=new Date().toISOString();
  if(id)db.prepare("UPDATE health_sync_requests SET status=?,finished_at=?,error=? WHERE id=?").run(success?"completed":"failed",now,success?null:"Синхронизация прервана. Подробности доступны в Health Bridge.",id);
  if(success)db.prepare("UPDATE health_bridge_devices SET last_completed_at=?,last_seen_at=? WHERE id=?").run(now,now,device.id);
  ok=true;
 })();
 return ok;
}
