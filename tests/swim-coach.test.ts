import test from "node:test";
import assert from "node:assert/strict";
import { buildSwimCoachContext, buildSwimCoachFallback, parseSwimCoachBriefing } from "../lib/swim/coach.ts";

const analytics:any={period:"30d",fromDate:"2026-07-08",toDate:"2026-08-06",workoutCount:2,distanceMeters:1800,durationSeconds:900,calories:null,avgHeartRate:null,avgPaceLabel:"0:50",averageDistanceMeters:900,distanceDeltaPercent:null,volume:[],hasAnyHistory:true};
const records:any={hasAnyHistory:true,largestSwim:{id:1,date:"2026-08-03",title:"Основы",value:900},fastestPace:null};
const home:any={nextWorkout:{status:"not_started",programId:"foundation",workoutId:"w2",title:"Ровный ритм",goal:"Спокойный темп",distanceMeters:1000,estimatedMinutes:25,weekIndex:1,progressPercent:10,calendarDate:null,weekday:null,isToday:false}};

test("swim coach context contains only available metrics",()=>{
  const context=buildSwimCoachContext("2026-08-06",analytics,records,home);
  assert.deepEqual(context.facts.map(f=>f.id),["recent_frequency","recent_volume","recent_duration","recent_pace","distance_record","next_session"]);
  assert.ok(context.unavailable.includes("Пульс"));
  assert.ok(context.unavailable.includes("SWOLF"));
});

test("swim coach fallback remains useful without a provider",()=>{
  const context=buildSwimCoachContext("2026-08-06",analytics,records,home);
  const briefing=buildSwimCoachFallback(context);
  assert.match(briefing.currentSummary,/2 заплывов/);
  assert.equal(briefing.guidance.primaryFocus,"Спокойный темп");
  assert.ok(briefing.observations.length<=3);
  assert.deepEqual(briefing.observations[0].evidenceIds,["recent_volume"]);
});

test("swim coach validation rejects fabricated evidence",()=>{
  const context=buildSwimCoachContext("2026-08-06",analytics,records,home);
  assert.throws(()=>parseSwimCoachBriefing({currentSummary:"Сводка",guidance:{recommendation:"По плану",primaryFocus:"Ритм",adjustment:null},observations:[{title:"Техника",text:"Техника улучшилась",evidenceIds:["swolf"]}]},context));
});
