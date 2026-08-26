import assert from "node:assert/strict";
import test from "node:test";
import { canSubmitCoachQuestion, coachErrorMessage, coachRequestForQuestion } from "../lib/coach-chat-client.ts";

test("Coach input: пустое значение и loading блокируют отправку",()=>{
  assert.equal(canSubmitCoachQuestion("   ",false),false);
  assert.equal(canSubmitCoachQuestion("Вопрос",true),false);
  assert.equal(canSubmitCoachQuestion(" Вопрос ",false),true);
});

test("Coach retry: тот же текст повторно использует requestId",()=>{
  let sequence=0;
  const create=()=>`request-id-000000${++sequence}`;
  const first=coachRequestForQuestion(null," Тест связи ",create);
  const retry=coachRequestForQuestion(first,"Тест связи",create);
  const edited=coachRequestForQuestion(first,"Другой вопрос",create);
  assert.equal(retry.id,first.id);
  assert.notEqual(edited.id,first.id);
});

test("Coach error: серверное объяснение сохраняется, HTTP fallback понятен",()=>{
  assert.equal(coachErrorMessage({error:"Anthropic отключён на сервере",code:"provider_disabled"},503),"Anthropic отключён на сервере");
  assert.match(coachErrorMessage({},502),/HTTP 502/);
  assert.match(coachErrorMessage({code:"network"}),/соединение/);
});
