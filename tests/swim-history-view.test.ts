import assert from "node:assert/strict";
import test from "node:test";
import { groupHistoryByMonth, summarizeHistory } from "../lib/swim/history-view.ts";
import type { SwimHistoryItem } from "../app/swim/types.ts";

const item = (over: Partial<SwimHistoryItem> & { id: number; date: string }): SwimHistoryItem => ({
  title: "Заплыв", distanceMeters: 1000, durationSeconds: 1800, paceLabel: "3:00",
  avgHeartRate: null, source: "manual", effort: null, route: null, ...over,
});

test("summarizeHistory складывает только реальные метрики, пропуски не считаются нулями в счётчике заплывов", () => {
  const totals = summarizeHistory([
    item({ id: 1, date: "2026-08-02", distanceMeters: 1000, durationSeconds: 1800 }),
    item({ id: 2, date: "2026-08-01", distanceMeters: null, durationSeconds: null }),
  ]);
  assert.equal(totals.count, 2);
  assert.equal(totals.distanceMeters, 1000);
  assert.equal(totals.durationSeconds, 1800);
});

test("summarizeHistory на пустом журнале даёт нули, а не NaN", () => {
  assert.deepEqual(summarizeHistory([]), { count: 0, distanceMeters: 0, durationSeconds: 0 });
});

test("groupHistoryByMonth разбивает по месяцам и сохраняет исходный порядок записей", () => {
  const chapters = groupHistoryByMonth([
    item({ id: 1, date: "2026-08-10" }),
    item({ id: 2, date: "2026-08-02" }),
    item({ id: 3, date: "2026-07-28" }),
  ]);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].key, "2026-08");
  assert.deepEqual(chapters[0].items.map((row) => row.id), [1, 2]);
  assert.equal(chapters[1].key, "2026-07");
  assert.equal(chapters[1].items.length, 1);
});

test("один и тот же месяц разных годов не сливается в одну главу", () => {
  const chapters = groupHistoryByMonth([item({ id: 1, date: "2026-08-01" }), item({ id: 2, date: "2025-08-01" })]);
  assert.equal(chapters.length, 2);
});

test("глава несёт собственный итог месяца", () => {
  const chapters = groupHistoryByMonth([
    item({ id: 1, date: "2026-08-10", distanceMeters: 1200, durationSeconds: 2000 }),
    item({ id: 2, date: "2026-08-02", distanceMeters: 800, durationSeconds: 1500 }),
  ]);
  assert.equal(chapters[0].totals.count, 2);
  assert.equal(chapters[0].totals.distanceMeters, 2000);
  assert.equal(chapters[0].totals.durationSeconds, 3500);
});

test("featuredId — самый длинный заплыв месяца, отдельно в каждой главе", () => {
  const chapters = groupHistoryByMonth([
    item({ id: 1, date: "2026-08-10", distanceMeters: 900 }),
    item({ id: 2, date: "2026-08-05", distanceMeters: 2100 }),
    item({ id: 3, date: "2026-07-20", distanceMeters: 700 }),
  ]);
  assert.equal(chapters[0].featuredId, 2);
  assert.equal(chapters[1].featuredId, 3);
});

test("месяц без дистанций не выделяет ничего вместо выдуманного лидера", () => {
  const chapters = groupHistoryByMonth([
    item({ id: 1, date: "2026-08-10", distanceMeters: null }),
    item({ id: 2, date: "2026-08-05", distanceMeters: null }),
  ]);
  assert.equal(chapters[0].featuredId, null);
});

test("при равной дистанции выделяется первая (более свежая) запись — результат детерминирован", () => {
  const chapters = groupHistoryByMonth([
    item({ id: 1, date: "2026-08-10", distanceMeters: 1000 }),
    item({ id: 2, date: "2026-08-05", distanceMeters: 1000 }),
  ]);
  assert.equal(chapters[0].featuredId, 1);
  assert.equal(groupHistoryByMonth([]).length, 0);
});
