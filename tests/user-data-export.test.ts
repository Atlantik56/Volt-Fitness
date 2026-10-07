import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {buildUserDataExport} from "../lib/user-data-export.ts";
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-export-"));
const {db}=await import("@/lib/db.ts");

test("export includes historical activity, measurements and photo metadata without credentials or storage paths",()=>{
 const counts={measurements:(db.prepare("SELECT count(*) n FROM measurements").get() as {n:number}).n,activity:(db.prepare("SELECT count(*) n FROM daily_activity").get() as {n:number}).n,photos:(db.prepare("SELECT count(*) n FROM photos").get() as {n:number}).n};
 db.prepare("INSERT INTO measurements(date,weight) VALUES(?,?)").run("2026-10-01",80);
 db.prepare("INSERT INTO daily_activity(date,steps,water_liters) VALUES(?,?,?)").run("2026-10-01",1234,2);
 db.prepare("INSERT INTO photos(filename,date,content_type) VALUES(?,?,?)").run("private-storage-name.jpg","2026-10-01","image/jpeg");
 db.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run("anthropic_api_key","fixture-secret-do-not-export");
 const before=db.prepare("SELECT count(*) n FROM workout_logs").get();
 const value=buildUserDataExport(db,"2026-10-07T00:00:00Z");
 assert.equal(value.version,1);assert.equal(value.measurements.length,counts.measurements+1);assert.equal(value.activity.length,counts.activity+1);assert.equal(value.photos.length,counts.photos+1);
 assert.ok(value.workouts.length);assert.equal(value.photoFilesIncluded,false);
 assert.equal(JSON.stringify(value).includes("fixture-secret-do-not-export"),false);
 assert.equal(JSON.stringify(value).includes("private-storage-name.jpg"),false);
 assert.deepEqual(db.prepare("SELECT count(*) n FROM workout_logs").get(),before);
});
