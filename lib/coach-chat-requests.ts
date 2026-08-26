import type Database from "better-sqlite3";

type DatabaseLike=Pick<Database.Database,"prepare"|"transaction">;
export type CoachRequestReply=Record<string,unknown>;
export type CoachRequestClaim=
  |{kind:"new"}
  |{kind:"pending"}
  |{kind:"completed";reply:CoachRequestReply};

export function validCoachRequestId(value:unknown):value is string{
  return typeof value==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{15,79}$/.test(value);
}

function parseReply(value:string):CoachRequestReply|null{
  try{
    const parsed=JSON.parse(value);
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:null;
  }catch{return null}
}

export function claimCoachRequest(database:DatabaseLike,requestId:string):CoachRequestClaim{
  const inserted=database.prepare("INSERT OR IGNORE INTO coach_chat_requests (request_id,status,response_json) VALUES (?,'processing','')").run(requestId);
  if(inserted.changes===1)return {kind:"new"};
  const row=database.prepare("SELECT status,response_json responseJson FROM coach_chat_requests WHERE request_id=?").get(requestId) as {status:string;responseJson:string}|undefined;
  const reply=row?.status==="completed"?parseReply(row.responseJson):null;
  if(reply)return {kind:"completed",reply};
  const reclaimed=database.prepare("UPDATE coach_chat_requests SET created_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='processing' AND created_at<=datetime('now','-2 minutes')").run(requestId);
  return reclaimed.changes===1?{kind:"new"}:{kind:"pending"};
}

export function completeCoachRequest(database:DatabaseLike,requestId:string,question:string,answer:string,reply:CoachRequestReply,storedMessagesLimit=40):CoachRequestReply{
  return database.transaction(()=>{
    const current=database.prepare("SELECT status,response_json responseJson FROM coach_chat_requests WHERE request_id=?").get(requestId) as {status:string;responseJson:string}|undefined;
    const existing=current?.status==="completed"?parseReply(current.responseJson):null;
    if(existing)return existing;
    if(current?.status!=="processing")throw new Error("Coach request is not claimed");
    const insert=database.prepare("INSERT INTO coach_conversation (role,text) VALUES (?,?)");
    insert.run("user",question);
    insert.run("assistant",answer);
    database.prepare("DELETE FROM coach_conversation WHERE id NOT IN (SELECT id FROM coach_conversation ORDER BY id DESC LIMIT ?)").run(storedMessagesLimit);
    database.prepare("UPDATE coach_chat_requests SET status='completed',response_json=?,completed_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='processing'").run(JSON.stringify(reply),requestId);
    database.prepare("DELETE FROM coach_chat_requests WHERE status='completed' AND request_id NOT IN (SELECT request_id FROM coach_chat_requests WHERE status='completed' ORDER BY completed_at DESC LIMIT 100)").run();
    return reply;
  })();
}

export function abandonCoachRequest(database:DatabaseLike,requestId:string){
  database.prepare("DELETE FROM coach_chat_requests WHERE request_id=? AND status='processing'").run(requestId);
}
