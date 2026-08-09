import test from "node:test";
import assert from "node:assert/strict";
import { LOGIN_ACCOUNT_LIMIT, LOGIN_BLOCK_MS, LOGIN_IP_LIMIT, loginThrottleKeys, nextLoginFailure, trustedClientIp } from "../lib/login-rate-limit.ts";

test("login throttling ignores spoofed X-Forwarded-For and uses proxy-set X-Real-IP",()=>{
  const headers=new Headers({"x-forwarded-for":"203.0.113.10, 198.51.100.4","x-real-ip":"198.51.100.4"});
  assert.equal(trustedClientIp(headers),"198.51.100.4");
  assert.deepEqual(loginThrottleKeys(headers,"Atlantik"),[
    {key:"login:ip:198.51.100.4",limit:LOGIN_IP_LIMIT},
    {key:"login:account:Atlantik",limit:LOGIN_ACCOUNT_LIMIT},
  ]);
});

test("missing or ambiguous trusted proxy address collapses to one safe bucket",()=>{
  assert.equal(trustedClientIp(new Headers({"x-forwarded-for":"203.0.113.10"})),"proxy-unknown");
  assert.equal(trustedClientIp(new Headers({"x-real-ip":"203.0.113.10, 198.51.100.4"})),"proxy-unknown");
});

test("failure state blocks exactly at the configured threshold",()=>{
  const now=1_700_000_000_000;
  assert.deepEqual(nextLoginFailure({failures:LOGIN_IP_LIMIT-2,blockedUntil:0},LOGIN_IP_LIMIT,now),{failures:LOGIN_IP_LIMIT-1,blockedUntil:0});
  assert.deepEqual(nextLoginFailure({failures:LOGIN_IP_LIMIT-1,blockedUntil:0},LOGIN_IP_LIMIT,now),{failures:0,blockedUntil:now+LOGIN_BLOCK_MS});
});
