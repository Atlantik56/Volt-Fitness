import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-analytics-service-"));
const {db}=await import("@/lib/db.ts");
const {buildAnalyticsBundle}=await import("@/lib/analytics-service.ts");

db.prepare("UPDATE profile SET program_start=?,training_plan_v3_started_at=? WHERE id=1").run("2026-08-03","2026-08-31");
db.prepare("INSERT INTO training_plan_cycles(program_id,program_version,started_at) VALUES('volt-training',3,'2026-08-31')").run();
const gymId=Number(db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,duration_seconds,details,calories,metrics_source)
 VALUES('2026-08-31','Силовая','Зал: тренажёры','[]',1,2400,'[]',260,'manual')`).run().lastInsertRowid);
db.prepare("INSERT INTO strength_logs(date,exercise,weight,reps,difficulty,workout_id) VALUES('2026-08-31','Жим в тренажёре',40,10,'Нормально',?)").run(gymId);
db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,duration_seconds,details,distance_meters,avg_heart_rate,metrics_source,external_activity_source)
 VALUES('2026-09-01','Плавание','Бассейн','[]',1,1800,'[]',800,118,'imported_metric','garmin_fit')`).run();
const stravaId=Number(db.prepare(`INSERT INTO workout_logs(date,type,title,completed,rounds,duration_seconds,details,distance_meters,metrics_source,external_activity_source)
 VALUES('2026-09-01','Кардио','Cycling','[]',1,7200,'[]',50000,'imported_metric','strava')`).run().lastInsertRowid);
db.prepare("INSERT INTO strength_logs(date,exercise,weight,reps,difficulty,workout_id) VALUES('2026-09-01','Strava fake set',100,100,'Тяжело',?)").run(stravaId);

test("server bundle uses confirmed rows, linked sets, historical plan and strict Strava exclusion",()=>{
 const bundle=buildAnalyticsBundle("2026-09-01");
 const week=bundle.ranges.current_week;
 assert.equal(bundle.defaultRange,"4_weeks");
 assert.equal(week.overview.workouts,2);
 assert.equal(week.overview.durationMinutes,70);
 assert.equal(week.overview.distanceMeters,800);
 assert.equal(week.dataCoverage.excludedStravaWorkouts,1);
 assert.equal(week.dataCoverage.manualWorkouts,1);
 assert.equal(week.dataCoverage.importedFitWorkouts,1);
 assert.equal(week.strength.sets,1);
 assert.equal(week.strength.exercises,1);
 assert.equal(week.strength.progression.some(row=>row.exercise==="Strava fake set"),false);
 assert.ok(week.plan.planned>=2);
 assert.ok(week.plan.bySport.some(row=>row.sport==="strength"&&row.planned>=1));
 assert.ok(week.plan.bySport.some(row=>row.sport==="swim"&&row.planned>=1));
});

test("all required service ranges are materialized in one typed bundle",()=>{
 const bundle=buildAnalyticsBundle("2026-09-01");
 assert.deepEqual(Object.keys(bundle.ranges).sort(),["12_weeks","4_weeks","8_weeks","current_month","current_week","previous_month","previous_week"].sort());
 assert.equal(bundle.ranges.previous_week.period.to,"2026-08-30");
 assert.equal(bundle.ranges.previous_month.period.from,"2026-08-01");
});
