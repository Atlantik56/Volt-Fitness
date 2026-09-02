import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Sanitized production-like snapshot built from the read-only facts confirmed
// for 2026-09-02: migrations through 30, open v3 cycle id=1 and a completed
// Swim draft whose immutable identity already uses that cycle.
const dataDir=mkdtempSync(path.join(tmpdir(),"volt-cycle-v31-"));
const dbPath=path.join(dataDir,"volt.sqlite");
const seed=new Database(dbPath);
const identity={programId:"volt-training",programVersion:3,weekIndex:9,sessionId:"swim-v3-aerobic",cycleId:1};
const snapshot=JSON.stringify({title:"VOLT Swim · Aerobic",type:"Плавание v1",programIdentity:identity,exercises:[]});
const planKey="b1049f7c1dc5447369299e1acc6e5adc";
seed.exec(`
 CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE training_plan_cycles(
  id INTEGER PRIMARY KEY AUTOINCREMENT,program_id TEXT NOT NULL,program_version INTEGER NOT NULL,
  started_at TEXT NOT NULL,ended_at TEXT,restarted_from_cycle_id INTEGER REFERENCES training_plan_cycles(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(ended_at IS NULL OR ended_at>=started_at)
 );
 CREATE UNIQUE INDEX idx_training_plan_cycles_open ON training_plan_cycles(program_id,program_version) WHERE ended_at IS NULL;
 CREATE TABLE workout_drafts(id INTEGER PRIMARY KEY,date TEXT NOT NULL,plan_key TEXT NOT NULL,status TEXT NOT NULL,snapshot TEXT NOT NULL);
 INSERT INTO training_plan_cycles(id,program_id,program_version,started_at) VALUES(1,'volt-training',3,'2026-09-02');
`);
seed.prepare("INSERT INTO workout_drafts(id,date,plan_key,status,snapshot) VALUES(17,'2026-09-02',?,'completed',?)").run(planKey,snapshot);
for(let version=1;version<=30;version++)seed.prepare("INSERT INTO schema_migrations(version) VALUES(?)").run(version);
seed.close();

process.env.DATA_DIR=dataDir;
const {db,applyDatabaseMigrations}=await import("@/lib/db.ts");

test("v31 upgrades the production-like index without rewriting v3 history",()=>{
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=31").get());
 assert.deepEqual(db.prepare(`SELECT id,program_id programId,program_version programVersion,started_at startedAt,ended_at endedAt
  FROM training_plan_cycles WHERE id=1`).get(),{id:1,programId:"volt-training",programVersion:3,startedAt:"2026-09-02",endedAt:null});
 const draft=db.prepare("SELECT plan_key planKey,snapshot FROM workout_drafts WHERE id=17").get() as any;
 assert.equal(draft.planKey,planKey);
 assert.deepEqual(JSON.parse(draft.snapshot).programIdentity,identity);
 const sql=String((db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_training_plan_cycles_open'").get() as any).sql);
 assert.match(sql,/training_plan_cycles\s*\(program_id\)\s*WHERE ended_at IS NULL/i);
 assert.throws(()=>db.prepare("INSERT INTO training_plan_cycles(program_id,program_version,started_at) VALUES('volt-training',4,'2026-09-03')").run(),/UNIQUE constraint failed/);
});

test("re-running the migration runner is an idempotent no-op",()=>{
 const before=JSON.stringify(db.prepare("SELECT * FROM training_plan_cycles ORDER BY id").all());
 const draftBefore=db.prepare("SELECT plan_key planKey,snapshot FROM workout_drafts WHERE id=17").get();
 applyDatabaseMigrations(db);
 assert.equal(JSON.stringify(db.prepare("SELECT * FROM training_plan_cycles ORDER BY id").all()),before);
 assert.deepEqual(db.prepare("SELECT plan_key planKey,snapshot FROM workout_drafts WHERE id=17").get(),draftBefore);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM schema_migrations WHERE version=31").get() as any).count,1);
});

test("an invalid partial schema fails transactionally and can be repaired without data loss",()=>{
 db.exec("DROP INDEX idx_training_plan_cycles_open;DELETE FROM schema_migrations WHERE version=31");
 const conflictingId=Number(db.prepare("INSERT INTO training_plan_cycles(program_id,program_version,started_at) VALUES('volt-training',4,'2026-09-03')").run().lastInsertRowid);
 assert.throws(()=>applyDatabaseMigrations(db),/UNIQUE constraint failed/);
 assert.equal(db.prepare("SELECT 1 FROM schema_migrations WHERE version=31").get(),undefined);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM training_plan_cycles WHERE ended_at IS NULL").get() as any).count,2);
 assert.equal((db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_training_plan_cycles_open'").get() as any).count,0);

 db.prepare("DELETE FROM training_plan_cycles WHERE id=?").run(conflictingId);
 applyDatabaseMigrations(db);
 assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version=31").get());
 assert.equal((db.prepare("SELECT COUNT(*) count FROM training_plan_cycles").get() as any).count,1);
 assert.equal((db.prepare("SELECT plan_key planKey FROM workout_drafts WHERE id=17").get() as any).planKey,planKey);
});
