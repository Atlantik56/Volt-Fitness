import assert from "node:assert/strict";
import test from "node:test";
import { createAuthStatusClient } from "../lib/auth-status-client.ts";

const response = (authenticated: boolean) => Response.json({ authenticated, setupRequired: false });

test("concurrent mounts share one status request; cached decisions expire", async () => {
  let calls = 0, now = 0;
  const client = createAuthStatusClient(async () => { calls++; return response(true); }, () => now, 5);
  const [a,b] = await Promise.all([client.load(), client.load()]);
  assert.equal(calls, 1); assert.deepEqual(a,b);
  await client.load(); assert.equal(calls,1);
  now = 5; assert.equal(client.peek(),null);
  await client.load(); assert.equal(calls,2);
});

test("logout invalidation prevents a late response from restoring the old session", async () => {
  let finish!: (r:Response)=>void;
  let calls=0;
  const client=createAuthStatusClient(()=> ++calls===1 ? new Promise(resolve=>{finish=resolve}) : Promise.resolve(response(false)));
  const first=client.load();
  client.invalidate();
  assert.equal((await client.load()).authenticated,false);
  finish(response(true));
  await assert.rejects(first,/устарела/);
  assert.equal(client.peek()?.authenticated,false);
});

test("failed or malformed responses are never cached and can be retried", async () => {
  let calls=0;
  const client=createAuthStatusClient(async()=> {
    calls++;
    if(calls===1)return new Response(null,{status:503});
    if(calls===2)return Response.json({authenticated:"true",setupRequired:false});
    return response(false);
  });
  await assert.rejects(client.load());assert.equal(client.peek(),null);
  await assert.rejects(client.load());assert.equal(client.peek(),null);
  assert.equal((await client.load()).authenticated,false);
});

test("a forced check discovers a changed server session before cache expiry", async () => {
  let authenticated=true;
  const client=createAuthStatusClient(async()=>response(authenticated));
  await client.load(); authenticated=false;
  assert.equal((await client.load()).authenticated,true);
  assert.equal((await client.load(true)).authenticated,false);
});
