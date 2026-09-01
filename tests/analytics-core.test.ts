import assert from "node:assert/strict";
import test from "node:test";
import {
  addIsoDays, buildAnalyticsCoachContext, buildAnalyticsOverview, compareMetric, normalizeAnalyticsWorkouts,
  normalizeStrengthSets, resolveAnalyticsPeriod, type AnalyticsPlannedSlot, type AnalyticsWorkout, type RawAnalyticsWorkout,
} from "@/lib/analytics-core.ts";

const raw=(id:number,date:string,overrides:Partial<RawAnalyticsWorkout>={}):RawAnalyticsWorkout=>({
 id,date,type:"Силовая",title:`Тренировка ${id}`,durationSeconds:1800,distanceMeters:0,calories:200,avgHeartRate:120,maxHeartRate:150,avgSpeed:0,metricsSource:"manual",externalActivitySource:null,...overrides,
});
const workout=(id:number,date:string,sport:AnalyticsWorkout["sport"],overrides:Partial<AnalyticsWorkout>={}):AnalyticsWorkout=>({
 id,date,sport,title:`Workout ${id}`,durationSeconds:1800,distanceMeters:null,calories:null,avgHeartRate:null,maxHeartRate:null,avgSpeedKph:null,metricsSource:"manual",...overrides,
});
const period=resolveAnalyticsPeriod("4_weeks","2026-09-01");

test("periods use inclusive local-calendar boundaries and equivalent previous ranges",()=>{
 assert.deepEqual(resolveAnalyticsPeriod("current_week","2026-09-01"),{key:"current_week",from:"2026-08-31",to:"2026-09-01",previousFrom:"2026-08-24",previousTo:"2026-08-25",label:"Эта неделя"});
 assert.deepEqual(resolveAnalyticsPeriod("previous_week","2026-09-01"),{key:"previous_week",from:"2026-08-24",to:"2026-08-30",previousFrom:"2026-08-17",previousTo:"2026-08-23",label:"Прошлая неделя"});
 assert.equal(resolveAnalyticsPeriod("4_weeks","2026-09-01").from,"2026-08-05");
 assert.equal(resolveAnalyticsPeriod("8_weeks","2026-09-01").from,"2026-07-08");
 assert.equal(resolveAnalyticsPeriod("12_weeks","2026-09-01").from,"2026-06-10");
 assert.deepEqual(resolveAnalyticsPeriod("current_month","2026-09-01"),{key:"current_month",from:"2026-09-01",to:"2026-09-01",previousFrom:"2026-08-01",previousTo:"2026-08-01",label:"Этот месяц"});
 assert.deepEqual(resolveAnalyticsPeriod("previous_month","2026-09-01"),{key:"previous_month",from:"2026-08-01",to:"2026-08-31",previousFrom:"2026-07-01",previousTo:"2026-07-31",label:"Прошлый месяц"});
 assert.deepEqual(resolveAnalyticsPeriod("previous_month","2026-03-01"),{key:"previous_month",from:"2026-02-01",to:"2026-02-28",previousFrom:"2026-01-01",previousTo:"2026-01-31",label:"Прошлый месяц"});
});

test("date arithmetic is stable across DST and month changes",()=>{
 assert.equal(addIsoDays("2026-03-29",1),"2026-03-30");
 assert.equal(addIsoDays("2026-12-31",1),"2027-01-01");
});

test("normalization excludes Strava before classification and aggregation",()=>{
 const result=normalizeAnalyticsWorkouts([raw(1,"2026-08-20"),raw(2,"2026-08-21",{externalActivitySource:"strava",durationSeconds:99999})]);
 assert.equal(result.excludedStrava,1);
 assert.deepEqual(result.included.map(row=>row.id),[1]);
 assert.equal(result.included[0].durationSeconds,1800);
});

test("zero placeholders become missing metrics, not measured zero",()=>{
 const result=normalizeAnalyticsWorkouts([raw(1,"2026-08-20",{durationSeconds:0,distanceMeters:0,calories:0,avgHeartRate:0,maxHeartRate:0,avgSpeed:0})]).included[0];
 assert.deepEqual({duration:result.durationSeconds,distance:result.distanceMeters,calories:result.calories,heartRate:result.avgHeartRate,speed:result.avgSpeedKph},{duration:null,distance:null,calories:null,heartRate:null,speed:null});
});

test("provider-neutral classifier keeps Gym, Swim and Cycling separate",()=>{
 const rows=normalizeAnalyticsWorkouts([
  raw(1,"2026-08-20"),
  raw(2,"2026-08-21",{type:"Плавание",title:"Бассейн"}),
  raw(3,"2026-08-22",{type:"Кардио",title:"Велотренировка в зоне 2"}),
 ]).included;
 assert.deepEqual(rows.map(row=>row.sport),["strength","swim","cycling"]);
});

test("strength sets are accepted only for included workout ids",()=>{
 const sets=normalizeStrengthSets([
  {workoutId:1,date:"2026-08-20",exercise:"Жим",weight:40,reps:10},
  {workoutId:2,date:"2026-08-20",exercise:"Чужой",weight:100,reps:10},
 ],new Set([1]));
 assert.equal(sets.length,1);
 assert.equal(sets[0].exercise,"Жим");
});

test("overview aggregates sport metrics, strength volume and transparent missing fields",()=>{
 const workouts=[
  workout(1,"2026-08-10","strength",{durationSeconds:2400,calories:250}),
  workout(2,"2026-08-12","swim",{durationSeconds:1800,distanceMeters:800,avgHeartRate:118}),
  workout(3,"2026-08-13","cycling",{durationSeconds:3600,distanceMeters:20000,avgHeartRate:125,maxHeartRate:158}),
 ];
 const strengthSets=[
  {workoutId:1,date:"2026-08-10",exercise:"Жим",weightKg:40,reps:10},
  {workoutId:1,date:"2026-08-10",exercise:"Жим",weightKg:42.5,reps:8},
 ];
 const overview=buildAnalyticsOverview({period,workouts,strengthSets,plans:[],excludedStravaWorkouts:2});
 assert.equal(overview.overview.workouts,3);
 assert.equal(overview.overview.durationMinutes,130);
 assert.equal(overview.overview.distanceMeters,20800);
 assert.deepEqual({sets:overview.strength.sets,reps:overview.strength.reps,volume:overview.strength.volumeKg},{sets:2,reps:18,volume:740});
 assert.equal(overview.swim.averagePaceSecondsPer100m,225);
 assert.equal(overview.cycling.avgSpeedKph,20);
 assert.equal(overview.cycling.cadenceRpm,null);
 assert.equal(overview.cycling.powerWatts,null);
 assert.equal(overview.dataCoverage.excludedStravaWorkouts,2);
});

test("plan matching is one-to-one by date and sport and reports skipped slots",()=>{
 const plans:AnalyticsPlannedSlot[]=[
  {date:"2026-08-10",sport:"strength",title:"Зал A",required:true},
  {date:"2026-08-10",sport:"strength",title:"Зал B",required:true},
  {date:"2026-08-12",sport:"swim",title:"Бассейн",required:true},
  {date:"2026-08-13",sport:"cycling",title:"Bike",required:false},
 ];
 const overview=buildAnalyticsOverview({period,workouts:[workout(1,"2026-08-10","strength"),workout(2,"2026-08-12","swim"),workout(3,"2026-08-13","cycling")],strengthSets:[],plans,excludedStravaWorkouts:0});
 assert.deepEqual({planned:overview.plan.planned,completed:overview.plan.completed,skipped:overview.plan.skipped,pct:overview.plan.completionPercent},{planned:3,completed:2,skipped:1,pct:67});
 assert.equal(overview.plan.bySport.find(row=>row.sport==="strength")?.completed,1);
 assert.equal(overview.plan.bySport.find(row=>row.sport==="cycling")?.planned,0);
});

test("comparisons handle zero baseline without Infinity or fake precision",()=>{
 assert.deepEqual(compareMetric(3,0),{current:3,previous:0,delta:3,percentChange:null,state:"new"});
 assert.deepEqual(compareMetric(0,0),{current:0,previous:0,delta:0,percentChange:0,state:"same"});
 assert.equal(compareMetric(10,8).percentChange,25);
 assert.equal(compareMetric(8,10).state,"down");
});

test("weekly trends are continuous and preserve empty weeks",()=>{
 const twelve=resolveAnalyticsPeriod("4_weeks","2026-09-01");
 const overview=buildAnalyticsOverview({period:twelve,workouts:[workout(1,"2026-08-06","strength"),workout(2,"2026-08-31","swim")],strengthSets:[],plans:[],excludedStravaWorkouts:0});
 assert.equal(overview.trends.weekly.length,5);
 assert.ok(overview.trends.weekly.some(point=>point.sessions===0));
 assert.equal(overview.trends.weekly.reduce((sum,point)=>sum+point.sessions,0),2);
});

test("Gym-only data keeps Swim/Cycling empty rather than synthesizing values",()=>{
 const overview=buildAnalyticsOverview({period,workouts:[workout(1,"2026-08-10","strength")],strengthSets:[],plans:[],excludedStravaWorkouts:0});
 assert.equal(overview.swim.workouts,0);
 assert.equal(overview.swim.distanceMeters,null);
 assert.equal(overview.cycling.workouts,0);
 assert.equal(overview.cycling.avgSpeedKph,null);
});

test("Coach context is compact aggregate-only and contains no raw workout rows",()=>{
 const overview=buildAnalyticsOverview({period,workouts:[workout(1,"2026-08-10","strength",{title:"Sensitive note"})],strengthSets:[],plans:[],excludedStravaWorkouts:0});
 const context=buildAnalyticsCoachContext(overview);
 const json=JSON.stringify(context);
 assert.equal(json.includes("Sensitive note"),false);
 assert.equal(json.includes('"workouts":1'),true);
 assert.equal("trends" in context,false);
 assert.equal("insights" in context,false);
});
