import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionSteps,
  parseWorkoutDraft,
  WORKOUT_DRAFT_VERSION,
  type WorkoutPlan,
} from "../app/training-session-model.ts";

const exercise=(name:string)=>[name,"Техника","3 × 10"] as const;
const strengthPlan:WorkoutPlan={
  type:"Силовая",title:"Домашняя силовая",rounds:2,
  warmup:[exercise("Разминка")],exercises:[exercise("Присед"),exercise("Тяга")],
};

test("buildSessionSteps creates a flat domain sequence without UI flags",()=>{
  const steps=buildSessionSteps(strengthPlan);
  assert.deepEqual(steps.map(step=>step.kind),["exercise","exercise","rest","exercise","rest","exercise","rest","exercise"]);
  assert.equal(steps[2].kind==="rest"&&steps[2].durationSeconds,45);
  assert.equal("showLoad" in steps[1],false);
});

test("buildSessionSteps remains deterministic and does not mutate the plan",()=>{
  const before=structuredClone(strengthPlan);
  assert.deepEqual(buildSessionSteps(strengthPlan),buildSessionSteps(strengthPlan));
  assert.deepEqual(strengthPlan,before);
});

test("cardio sequence has no automatic strength rest steps",()=>{
  const steps=buildSessionSteps({...strengthPlan,type:"Кардио",title:"Велосипед"});
  assert.equal(steps.some(step=>step.kind==="rest"),false);
});

test("version 4 draft is migrated to version 5 with safe defaults",()=>{
  const savedAt=1_000_000;
  const draft=parseWorkoutDraft(JSON.stringify({version:4,title:"Домашняя силовая",cursor:2,done:{"0-0":true},values:{"0-0":"10"},savedAt}),"Домашняя силовая",savedAt+100);
  assert.equal(draft?.version,WORKOUT_DRAFT_VERSION);
  assert.deepEqual(draft?.metrics,{});
  assert.equal(draft?.effort,"Нормально");
  assert.equal("done" in (draft??{}),false);
});

test("invalid, expired and incompatible drafts are rejected",()=>{
  assert.equal(parseWorkoutDraft("{","x"),null);
  assert.equal(parseWorkoutDraft(JSON.stringify({version:3,title:"x",savedAt:100}),"x",101),null);
  assert.equal(parseWorkoutDraft(JSON.stringify({version:5,title:"x",savedAt:100}),"x",50_000_000),null);
});
