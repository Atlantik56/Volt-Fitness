import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { exerciseVideoId } from "../app/exercise-videos.ts";
import { home } from "../app/personal-data.ts";

test("домашний план содержит отжимания с изображением и видео",()=>{
 const pushUp=home.find(([name])=>name==="Отжимания от пола");
 assert.ok(pushUp);
 assert.equal(pushUp[3],"/exercises/push-up.webp");
 assert.ok(existsSync(`public${pushUp[3]}`));
 assert.equal(exerciseVideoId(pushUp[0]),"IODxDxX7oi4");
});

test("планка явно предлагает облегчённую вариацию с колен",()=>{
 const plank=home.find(([name])=>name==="Планка на предплечьях");
 assert.ok(plank);
 assert.match(plank[1],/Если тяжело/);
 assert.match(plank[1],/колени на коврик/);
});
