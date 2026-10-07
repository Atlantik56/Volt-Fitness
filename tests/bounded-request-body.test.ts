import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedBody, RequestBodyTooLarge } from "../lib/bounded-request-body.ts";

test("body limit counts UTF-8 bytes even without content-length", async()=>{
  const request=new Request("https://example.test",{method:"POST",body:"я".repeat(6)});
  await assert.rejects(readBoundedBody(request,10),RequestBodyTooLarge);
});
test("chunked body is cancelled at the bound",async()=>{
  let cancelled=false;
  const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(6));controller.enqueue(new Uint8Array(6));},cancel(){cancelled=true}});
  const request=new Request("https://example.test",{method:"POST",body,duplex:"half"} as RequestInit);
  await assert.rejects(readBoundedBody(request,10),RequestBodyTooLarge);
  assert.equal(cancelled,true);
});
test("valid bodies preserve their text",async()=>{
  assert.equal(await readBoundedBody(new Request("https://example.test",{method:"POST",body:"Привет"}),12),"Привет");
});
