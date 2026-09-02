import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source=(relative:string)=>readFileSync(fileURLToPath(new URL(`../${relative}`,import.meta.url)),"utf8");

test("client Swim entry points do not pull the server-only plan-key/crypto bridge",()=>{
 const clientFiles=[
  "app/page.tsx",
  "app/swim/components/swim-plan-screen.tsx",
  "app/swim/workouts/[programId]/[workoutId]/page.tsx",
  "lib/swim/workout-engine.ts",
 ];
 for(const file of clientFiles){
  const body=source(file);
  assert.doesNotMatch(body,/from\s+["'](?:@\/lib\/swim\/workout-plan-key|@\/lib\/plan-key|node:crypto)["']/,
   `${file} must remain browser-safe`);
 }
 assert.match(source("lib/swim/workout-plan-key.ts"),/from\s+["']@\/lib\/plan-key["']/,
  "the crypto-dependent plan-key remains behind its server-only bridge");
});
