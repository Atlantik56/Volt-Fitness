import assert from "node:assert/strict";
import test from "node:test";
import { LATEST_WHATS_NEW_VERSION, pendingReleases, WHATS_NEW_RELEASES } from "../app/whats-new.ts";

test("pendingReleases: unseen releases (seenVersion=0) include everything", () => {
  const pending = pendingReleases(0);
  assert.equal(pending.length, WHATS_NEW_RELEASES.length);
});

test("pendingReleases: fully seen (seenVersion=latest) returns nothing", () => {
  assert.deepEqual(pendingReleases(LATEST_WHATS_NEW_VERSION), []);
});

test("pendingReleases: seenVersion above latest still returns nothing, no negative-index bugs", () => {
  assert.deepEqual(pendingReleases(LATEST_WHATS_NEW_VERSION + 5), []);
});

test("every release has non-empty summary and highlights with a target selector", () => {
  for (const release of WHATS_NEW_RELEASES) {
    assert.ok(release.summary.length > 0);
    assert.ok(release.highlights.length > 0);
    for (const h of release.highlights) assert.ok(h.target.length > 0);
  }
});
