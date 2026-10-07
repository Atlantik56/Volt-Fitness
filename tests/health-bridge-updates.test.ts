import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-bridge-updates-"));
const health = await import("../lib/health-connect.ts");
const { USERNAME } = await import("../lib/user.ts");
const { HEALTH_BRIDGE_RELEASE } = await import("../lib/health-bridge-release.ts");
const { GET: metadata } = await import("../app/api/health-connect/release/route.ts");
const { GET: apk } = await import("../app/api/health-connect/apk/route.ts");
const req = (token: string) => new Request("https://volt.test/api/health-connect/release", {
  headers: { authorization: `Bearer ${token}` },
});

test("a paired companion can discover and download the exact published update without a PWA session", async () => {
  const pairing = health.createHealthPairing(USERNAME);
  const claim = health.claimHealthPairing(pairing.token, "Synthetic update QA");
  assert.ok(claim.ok);
  const response = await metadata(req(claim.deviceToken));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const release = await response.json();
  assert.equal(release.versionCode, HEALTH_BRIDGE_RELEASE.versionCode);
  assert.equal(release.applicationId, "com.voltfitness.healthbridge");
  assert.equal(release.downloadPath, "/api/health-connect/apk");
  const download = await apk(req(claim.deviceToken));
  assert.equal(download.status, 200);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.length, release.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), release.sha256);
  health.revokeHealthDevice(claim.deviceId, USERNAME);
  assert.equal((await metadata(req(claim.deviceToken))).status, 401);
  assert.equal((await apk(req(claim.deviceToken))).status, 401);
});

test("invalid device credentials cannot read release metadata or APK", async () => {
  assert.equal((await metadata(req("invalid"))).status, 401);
  assert.equal((await apk(req("invalid"))).status, 401);
});
