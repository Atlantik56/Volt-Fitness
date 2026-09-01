import assert from "node:assert/strict";
import test from "node:test";
import { rankActivityMatches, scoreActivityMatch } from "../lib/activity-matcher.ts";

const cycling={activityType:"bike",startedAt:"2026-09-01T07:05:00Z",durationSeconds:3600,distanceMeters:25000,localDate:"2026-09-01",subtype:"endurance"};
const planned={id:1,date:"2026-09-01",activityType:"bike",title:"Zone 2",startedAt:"2026-09-01T07:00:00Z",durationSeconds:3700,distanceMeters:24200,subtype:"endurance"};

test("cycling exact candidate has deterministic score and reasons",()=>{
 const first=scoreActivityMatch(cycling,planned),second=scoreActivityMatch(cycling,planned);
 assert.deepEqual(first,second);assert.equal(first.confidence,"high");assert.ok(first.score>=.9);
 assert.ok(first.reasons.includes("sport matched"));assert.ok(first.reasons.includes("same planned day"));
});
test("swim candidate matches while wrong sport is no_match",()=>{
 const swim=scoreActivityMatch({...cycling,activityType:"swim",distanceMeters:1500},{...planned,activityType:"swim",distanceMeters:1520,title:"Техника плавания"});
 const wrong=scoreActivityMatch(cycling,{...planned,activityType:"swim"});
 assert.equal(swim.confidence,"high");assert.equal(wrong.confidence,"no_match");
});
test("wrong day and ambiguous candidates remain explicit",()=>{
 const far=scoreActivityMatch(cycling,{...planned,date:"2026-09-05",startedAt:null});assert.notEqual(far.confidence,"high");
 const ranked=rankActivityMatches(cycling,[planned,{...planned,id:2,title:"Alternative"}]);
 assert.equal(ranked.length,2);assert.equal(ranked[0].score,ranked[1].score);assert.equal(ranked[0].planId,1);
});
