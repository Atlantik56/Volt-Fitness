import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldShowInsight, markInsightShown, dismissInsight, resolveInsight,
  COOLDOWN_DAYS, DISMISS_COOLDOWN_DAYS, SAFETY_DISMISS_COOLDOWN_DAYS,
  type MemoryRecord,
} from "../lib/insights/memory.ts";

const REF = { id: "weight-plateau", evidenceHash: "hash-1", sourceRevision: "ai4-v1" };
const REF2 = { ...REF, evidenceHash: "hash-2" };
const NOW = new Date("2026-08-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

function rec(ref: typeof REF, overrides: Partial<NonNullable<MemoryRecord>> = {}): NonNullable<MemoryRecord> {
  return {
    insightId: ref.id, evidenceHash: ref.evidenceHash, sourceRevision: ref.sourceRevision,
    firstShownAt: null, lastShownAt: null, dismissedAt: null, resolvedAt: null, showCount: 0,
    ...overrides,
  };
}

test("первый показ: insight_id встречается впервые — показывается", () => {
  const decision = shouldShowInsight(REF, null, null, NOW);
  assert.deepEqual(decision, { show: true, kind: "new" });
});

test("повтор с тем же hash: до истечения COOLDOWN_DAYS подавляется, после — показывается снова", () => {
  const record = rec(REF, { firstShownAt: daysAgo(3), lastShownAt: daysAgo(3), showCount: 1 });
  const before = shouldShowInsight(REF, record, null, NOW);
  assert.deepEqual(before, { show: false, kind: "suppressed-repeat" });

  const oldRecord = { ...record, lastShownAt: daysAgo(COOLDOWN_DAYS + 1) };
  const after = shouldShowInsight(REF, oldRecord, null, NOW);
  assert.deepEqual(after, { show: true, kind: "repeat" });
});

test("новый hash: до dismiss-cooldown подавляется, после — показывается как обновление", () => {
  const latest = rec(REF, { firstShownAt: daysAgo(10), lastShownAt: daysAgo(10), dismissedAt: daysAgo(2), showCount: 1 });
  const before = shouldShowInsight(REF2, null, latest, NOW);
  assert.deepEqual(before, { show: false, kind: "suppressed-dismissed" });

  const oldDismiss = { ...latest, dismissedAt: daysAgo(DISMISS_COOLDOWN_DAYS + 1) };
  const after = shouldShowInsight(REF2, null, oldDismiss, NOW);
  assert.deepEqual(after, { show: true, kind: "update" });
});

test("новый hash без dismiss: применяется обычный cooldown обновления от lastShownAt", () => {
  const latest = rec(REF, { firstShownAt: daysAgo(3), lastShownAt: daysAgo(3), showCount: 2 });
  const soon = shouldShowInsight(REF2, null, latest, NOW);
  assert.deepEqual(soon, { show: false, kind: "suppressed-repeat" });

  const later = shouldShowInsight(REF2, null, { ...latest, lastShownAt: daysAgo(COOLDOWN_DAYS + 1) }, NOW);
  assert.deepEqual(later, { show: true, kind: "update" });
});

test("dismiss скрывает конкретную evidence-версию бессрочно (без revision/safety)", () => {
  const record = rec(REF, { firstShownAt: daysAgo(30), lastShownAt: daysAgo(30), dismissedAt: daysAgo(20), showCount: 1 });
  const decision = shouldShowInsight(REF, record, null, NOW);
  assert.deepEqual(decision, { show: false, kind: "suppressed-dismissed" });
});

test("resolve: без нового evidence/revision не возвращается", () => {
  const record = rec(REF, { firstShownAt: daysAgo(30), lastShownAt: daysAgo(30), resolvedAt: daysAgo(20), showCount: 3 });
  const decision = shouldShowInsight(REF, record, null, NOW);
  assert.deepEqual(decision, { show: false, kind: "suppressed-resolved" });
});

test("resolve: новая evidence-версия (другой hash) считается новым evidence — показывается сразу", () => {
  const latestResolved = rec(REF, { firstShownAt: daysAgo(30), lastShownAt: daysAgo(30), resolvedAt: daysAgo(1), showCount: 3 });
  const decision = shouldShowInsight(REF2, null, latestResolved, NOW);
  assert.deepEqual(decision, { show: true, kind: "update" });
});

test("смена source_revision показывает немедленно, даже если версия была dismissed/resolved", () => {
  const dismissed = rec(REF, { sourceRevision: "ai4-v0", firstShownAt: daysAgo(30), lastShownAt: daysAgo(30), dismissedAt: daysAgo(1), showCount: 1 });
  assert.deepEqual(shouldShowInsight(REF, dismissed, null, NOW), { show: true, kind: "update" });

  const resolved = rec(REF, { sourceRevision: "ai4-v0", firstShownAt: daysAgo(30), lastShownAt: daysAgo(30), resolvedAt: daysAgo(1), showCount: 1 });
  assert.deepEqual(shouldShowInsight(REF, resolved, null, NOW), { show: true, kind: "update" });
});

test("safety-инсайт: dismiss не скрывает навсегда, только на SAFETY_DISMISS_COOLDOWN_DAYS", () => {
  const safetyIds = new Set(["pain-warning"]);
  const ref = { id: "pain-warning", evidenceHash: "h", sourceRevision: "v1" };
  const justDismissed = rec(ref, { firstShownAt: daysAgo(2), lastShownAt: daysAgo(2), dismissedAt: daysAgo(0.1), showCount: 1 });
  const suppressed = shouldShowInsight(ref, justDismissed, null, NOW, safetyIds);
  assert.deepEqual(suppressed, { show: false, kind: "suppressed-dismissed" });

  const longDismissed = { ...justDismissed, dismissedAt: daysAgo(SAFETY_DISMISS_COOLDOWN_DAYS + 1) };
  const reappears = shouldShowInsight(ref, longDismissed, null, NOW, safetyIds);
  assert.deepEqual(reappears, { show: true, kind: "repeat" });

  // Тот же insight_id, но не входит в safetyIds — обычное бессрочное dismiss-поведение.
  const nonSafety = shouldShowInsight(ref, longDismissed, null, NOW, new Set());
  assert.deepEqual(nonSafety, { show: false, kind: "suppressed-dismissed" });
});

test("идемпотентный markInsightShown: первый показ создаёт запись, повтор в течение окна не увеличивает show_count", () => {
  const first = markInsightShown(null, REF, NOW);
  assert.equal(first.showCount, 1);
  assert.equal(first.firstShownAt, NOW.toISOString());

  const dupNow = new Date(NOW.getTime() + 2000); // 2 секунды спустя — в пределах SHOWN_DEDUP_WINDOW_SECONDS
  const dup = markInsightShown(first, REF, dupNow);
  assert.equal(dup.showCount, 1); // без изменений — тот же фактический показ
  assert.equal(dup.lastShownAt, first.lastShownAt);
});

test("markInsightShown после окончания dedup-окна увеличивает show_count и last_shown_at", () => {
  const first = markInsightShown(null, REF, NOW);
  const later = new Date(NOW.getTime() + 10000);
  const second = markInsightShown(first, REF, later);
  assert.equal(second.showCount, 2);
  assert.equal(second.lastShownAt, later.toISOString());
  assert.equal(second.firstShownAt, first.firstShownAt); // firstShownAt не переписывается
});

test("markInsightShown снимает dismissed/resolved у ЭТОЙ ТОЧНОЙ пары, раз показ разрешён", () => {
  const dismissed = rec(REF, { firstShownAt: daysAgo(30), lastShownAt: daysAgo(30), dismissedAt: daysAgo(1), showCount: 1 });
  const updated = markInsightShown(dismissed, REF, NOW);
  assert.equal(updated.dismissedAt, null);
});

test("конкурентные повторные вызовы markInsightShown с параллельными таймстемпами не создают двойной инкремент", () => {
  // Симуляция гонки: два "почти одновременных" запроса передают record ДО
  // применения первого — оба видят record=null. Итоговое состояние после
  // применения обоих подряд не должно быть 2 при вызовах в один момент времени
  // (реальная защита от гонки — на уровне БД через ON CONFLICT в
  // lib/insight-memory-store.ts; здесь проверяем, что чистая функция сама по
  // себе детерминирована и не завышает счётчик при одинаковом now).
  const a = markInsightShown(null, REF, NOW);
  const b = markInsightShown(null, REF, NOW);
  assert.deepEqual(a, b);
});

test("dismissInsight идемпотентен: повторный вызов сохраняет первый dismissedAt", () => {
  const shown = rec(REF, { firstShownAt: daysAgo(5), lastShownAt: daysAgo(5), showCount: 1 });
  const dismissedFirst = dismissInsight(shown, REF, NOW);
  const later = new Date(NOW.getTime() + 86400000);
  const dismissedAgain = dismissInsight(dismissedFirst, REF, later);
  assert.equal(dismissedAgain.dismissedAt, dismissedFirst.dismissedAt);
});

test("resolveInsight идемпотентен: повторный вызов сохраняет первый resolvedAt", () => {
  const shown = rec(REF, { firstShownAt: daysAgo(5), lastShownAt: daysAgo(5), showCount: 1 });
  const resolvedFirst = resolveInsight(shown, REF, NOW);
  const later = new Date(NOW.getTime() + 86400000);
  const resolvedAgain = resolveInsight(resolvedFirst, REF, later);
  assert.equal(resolvedAgain.resolvedAt, resolvedFirst.resolvedAt);
});

test("null/0/undefined: firstShownAt=null отличается от '0' и не путается с ещё не показанным", () => {
  const record = rec(REF); // firstShownAt/lastShownAt строго null, showCount строго 0
  // Запись существует (например создана dismissInsight без предварительного
  // показа), но lastShownAt строго null — не должно трактоваться как "только
  // что показано" (repeat-cooldown не должен применяться к null).
  const decision = shouldShowInsight(REF, record, null, NOW);
  assert.deepEqual(decision, { show: true, kind: "new" });
  assert.equal(record.showCount, 0); // явный 0, а не null/undefined — реальное отсутствие показов
});
