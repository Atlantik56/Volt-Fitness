import assert from "node:assert/strict";
import test from "node:test";
import { getSwimInsights } from "../lib/swim/insight-service.ts";

test("getSwimInsights возвращает типизированный пустой массив (Sprint 4 наполнит контракт)", () => {
  const insights = getSwimInsights();
  assert.deepEqual(insights, []);
});
