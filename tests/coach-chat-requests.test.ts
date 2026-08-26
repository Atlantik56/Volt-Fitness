import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { abandonCoachRequest, claimCoachRequest, completeCoachRequest, validCoachRequestId } from "../lib/coach-chat-requests.ts";

function database(){
  const db=new Database(":memory:");
  db.exec(`
    CREATE TABLE coach_conversation (id INTEGER PRIMARY KEY AUTOINCREMENT,role TEXT NOT NULL,text TEXT NOT NULL);
    CREATE TABLE coach_chat_requests (request_id TEXT PRIMARY KEY,status TEXT NOT NULL,response_json TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT);
  `);
  return db;
}

test("Coach request: один requestId сохраняет историю ровно один раз",()=>{
  const db=database(),requestId="request-id-000000000001";
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"new"});
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"pending"});
  const reply={answer:"OK",mainRecommendation:null,provider:"mws",routeReason:"primary_unavailable"};
  assert.deepEqual(completeCoachRequest(db,requestId,"Тест",reply.answer,reply),reply);
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"completed",reply});
  assert.deepEqual(completeCoachRequest(db,requestId,"Тест",reply.answer,reply),reply);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM coach_conversation").get() as any).count,2);
  db.close();
});

test("Coach request: ошибка освобождает requestId для retry",()=>{
  const db=database(),requestId="request-id-000000000002";
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"new"});
  abandonCoachRequest(db,requestId);
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"new"});
  db.close();
});

test("Coach request: зависшая обработка безопасно возвращается в retry",()=>{
  const db=database(),requestId="request-id-000000000004";
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"new"});
  db.prepare("UPDATE coach_chat_requests SET created_at=datetime('now','-3 minutes') WHERE request_id=?").run(requestId);
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"new"});
  assert.deepEqual(claimCoachRequest(db,requestId),{kind:"pending"});
  db.close();
});

test("Coach request: принимается только ограниченный безопасный id",()=>{
  assert.equal(validCoachRequestId("request-id-000000000003"),true);
  assert.equal(validCoachRequestId("short"),false);
  assert.equal(validCoachRequestId("bad id with spaces 0000"),false);
});
