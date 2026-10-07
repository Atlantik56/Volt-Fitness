import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HEALTH_BRIDGE_RELEASE } from "../lib/health-bridge-release.ts";

test("the distributed Android APK matches the pinned release bytes and checksum", () => {
  const file = readFileSync(new URL(`../releases/health-bridge/${HEALTH_BRIDGE_RELEASE.filename}`, import.meta.url));
  assert.equal(file.subarray(0, 4).toString("hex"), "504b0304");
  assert.equal(file.byteLength, HEALTH_BRIDGE_RELEASE.bytes);
  assert.equal(createHash("sha256").update(file).digest("hex"), HEALTH_BRIDGE_RELEASE.sha256);
});
