import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-intervals-"));
const { downloadIntervalsActivityFit, IntervalsApiError, isStravaSourced, listIntervalsActivities } = await import("@/lib/intervals-client.ts");
const { syncWindowStart } = await import("@/lib/intervals-service.ts");

const API_KEY = "0123456789abcdef0123";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const binary = (bytes: number[], status = 200) => new Response(new Uint8Array(bytes), { status });

type Call = { url: string; auth: string };
function recorder(handler: (url: string) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (input: any, init: any) => {
    calls.push({ url: String(input), auth: String(init?.headers?.authorization || "") });
    return handler(String(input));
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

test("listIntervalsActivities authenticates with the literal API_KEY username", async () => {
  const { calls, fetcher } = recorder(() => json([]));
  await listIntervalsActivities(API_KEY, "i123", { oldest: "2026-08-01", newest: "2026-09-02" }, fetcher);
  assert.equal(calls[0].auth, `Basic ${Buffer.from(`API_KEY:${API_KEY}`).toString("base64")}`);
  assert.match(calls[0].url, /athlete\/i123\/activities\?oldest=2026-08-01&newest=2026-09-02/);
});

test("listIntervalsActivities keeps well-formed rows and drops entries without a usable id", async () => {
  const { fetcher } = recorder(() => json([
    { id: "i777", start_date_local: "2026-09-01T18:30:00", type: "VirtualRide", name: "WattAttack", source: "GARMIN" },
    { id: null, start_date_local: "2026-09-01T09:00:00" },
    { id: "bad id/../etc", start_date_local: "2026-09-01T09:00:00" },
  ]), );
  const activities = await listIntervalsActivities(API_KEY, "i123", { oldest: "2026-08-01", newest: "2026-09-02" }, fetcher);
  assert.equal(activities.length, 1);
  assert.deepEqual(activities[0], { id: "i777", startDateLocal: "2026-09-01T18:30:00", type: "VirtualRide", name: "WattAttack", source: "GARMIN" });
});

test("listIntervalsActivities rejects a non-array payload instead of returning nothing", async () => {
  const { fetcher } = recorder(() => json({ error: "nope" }));
  await assert.rejects(
    () => listIntervalsActivities(API_KEY, "i123", { oldest: "2026-08-01", newest: "2026-09-02" }, fetcher),
    (error: unknown) => error instanceof IntervalsApiError && error.status === 502,
  );
});

test("a rejected key surfaces as 401 so the caller can stop retrying", async () => {
  const { fetcher } = recorder(() => new Response("", { status: 401 }));
  await assert.rejects(
    () => listIntervalsActivities(API_KEY, "i123", { oldest: "2026-08-01", newest: "2026-09-02" }, fetcher),
    (error: unknown) => error instanceof IntervalsApiError && error.status === 401,
  );
});

test("downloadIntervalsActivityFit prefers the original watch file", async () => {
  const { calls, fetcher } = recorder(() => binary([0x0e, 0x10, 0x46, 0x49, 0x54]));
  const result = await downloadIntervalsActivityFit(API_KEY, "i777", fetcher);
  assert.equal(result.original, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/activity\/i777\/file$/);
});

test("downloadIntervalsActivityFit falls back to the generated FIT when no original exists", async () => {
  const { calls, fetcher } = recorder((url) => (url.endsWith("/file") ? new Response("", { status: 404 }) : binary([0x0e, 0x10, 0x46])));
  const result = await downloadIntervalsActivityFit(API_KEY, "i777", fetcher);
  assert.equal(result.original, false);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/activity\/i777\/fit-file$/);
});

test("downloadIntervalsActivityFit does not mask a rejected key as a missing original", async () => {
  const { calls, fetcher } = recorder(() => new Response("", { status: 403 }));
  await assert.rejects(
    () => downloadIntervalsActivityFit(API_KEY, "i777", fetcher),
    (error: unknown) => error instanceof IntervalsApiError && error.status === 403,
  );
  assert.equal(calls.length, 1, "не должно быть отката на fit-file при отказе доступа");
});

test("downloadIntervalsActivityFit refuses an id that could escape the URL path", async () => {
  const { fetcher } = recorder(() => binary([0x0e]));
  await assert.rejects(() => downloadIntervalsActivityFit(API_KEY, "../../athlete/i1/profile", fetcher));
});

test("an empty body is an error rather than a zero-byte import", async () => {
  const { fetcher } = recorder(() => binary([]));
  await assert.rejects(
    () => downloadIntervalsActivityFit(API_KEY, "i777", fetcher),
    (error: unknown) => error instanceof IntervalsApiError && error.status === 502,
  );
});

test("syncWindowStart looks back 90 days on the first run and overlaps a day afterwards", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  assert.equal(syncWindowStart(undefined, now), "2026-06-03");
  assert.equal(syncWindowStart({ lastActivityDate: null }, now), "2026-06-03");
  assert.equal(syncWindowStart({ lastActivityDate: "2026-08-30" }, now), "2026-08-29");
});

test("syncWindowStart ignores a malformed stored date instead of building a broken range", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  assert.equal(syncWindowStart({ lastActivityDate: "не дата" }, now), "2026-06-03");
});

test("a 422 'no original file' falls back to the generated FIT", async () => {
  // Реальный ответ intervals.icu: {"status":422,"error":"Activity has no original file to download"}
  const { calls, fetcher } = recorder((url) => (url.endsWith("/file") ? new Response(JSON.stringify({ status: 422, error: "Activity has no original file to download" }), { status: 422 }) : binary([0x0e, 0x10, 0x46])));
  const result = await downloadIntervalsActivityFit(API_KEY, "i777", fetcher);
  assert.equal(result.original, false);
  assert.equal(calls.length, 2);
});

test("isStravaSourced flags what intervals.icu refuses to serve over the API", () => {
  assert.equal(isStravaSourced({ source: "STRAVA" }), true);
  assert.equal(isStravaSourced({ source: "strava" }), true);
  assert.equal(isStravaSourced({ source: "GARMIN" }), false);
  assert.equal(isStravaSourced({ source: null }), false);
});
