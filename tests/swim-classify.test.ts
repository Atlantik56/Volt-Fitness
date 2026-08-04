import assert from "node:assert/strict";
import test from "node:test";
import { isSwimActivity } from "../lib/swim-classify.ts";

test("isSwimActivity распознаёт плавание по типу или названию", () => {
  assert.equal(isSwimActivity("Плавание", "Бассейн"), true);
  assert.equal(isSwimActivity("Кардио", "Бассейн"), true);
  assert.equal(isSwimActivity("Силовая", "Гантели по кругу"), false);
  assert.equal(isSwimActivity("", ""), false);
});
