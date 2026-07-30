import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir=mkdtempSync(path.join(tmpdir(),"volt-active-migration-"));
const legacy=new Database(path.join(dataDir,"volt.sqlite"));
legacy.exec(`
 CREATE TABLE workout_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,completed TEXT NOT NULL DEFAULT '[]',rounds INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO workout_logs(date,type,title,completed,rounds) VALUES('2026-06-01','Силовая','Историческая','[]',1);
`);
legacy.close();
process.env.DATA_DIR=dataDir;
const {db}=await import("@/lib/db.ts");

test("миграция v14 аддитивна и не меняет существующие workout_logs",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=14").get());
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workout_drafts'").get());
 const historical=db.prepare("SELECT date,title FROM workout_logs").all();
 assert.deepEqual(historical,[{date:"2026-06-01",title:"Историческая"}]);
 assert.equal((db.prepare("SELECT COUNT(*) n FROM workout_drafts").get() as any).n,0);
});

test("частичный unique index разрешает повтор после completed, но не два открытых черновика",()=>{
 const snapshot='{"title":"A","type":"Силовая","rounds":1,"exercises":[]}';
 db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES (?,?,?,?)").run("2026-06-02","key","active",snapshot);
 assert.throws(()=>db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES (?,?,?,?)").run("2026-06-02","key","planned",snapshot));
 db.prepare("UPDATE workout_drafts SET status='completed' WHERE date='2026-06-02'").run();
 assert.doesNotThrow(()=>db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot) VALUES (?,?,?,?)").run("2026-06-02","key","active",snapshot));
});
