import assert from "node:assert/strict";
import test from "node:test";
import { resolveSectionFromQuery, sectionUrl } from "@/app/nav-url.ts";

const resolve = (url: string) => resolveSectionFromQuery(new URLSearchParams(url.split("?")[1] ?? ""));

test("/ резолвится в Сегодня/insights и канонический URL — /", () => {
  const resolved = resolve("/");
  assert.deepEqual(resolved, { section: "Сегодня", mode: "insights" });
  assert.equal(sectionUrl(resolved.section, resolved.mode), "/");
});

test("?section=Сегодня резолвится в Home, но канонический URL — /, а не сам query", () => {
  const resolved = resolve("/?section=Сегодня");
  assert.deepEqual(resolved, { section: "Сегодня", mode: "insights" });
  assert.equal(sectionUrl(resolved.section, resolved.mode), "/");
});

test("неизвестный section безопасно схлопывается в Сегодня -> /", () => {
  const resolved = resolve("/?section=НесуществующийРаздел");
  assert.deepEqual(resolved, { section: "Сегодня", mode: "insights" });
  assert.equal(sectionUrl(resolved.section, resolved.mode), "/");
});

test("валидный раздел сохраняется как есть", () => {
  const resolved = resolve("/?section=" + encodeURIComponent("План"));
  assert.deepEqual(resolved, { section: "План", mode: "insights" });
  assert.equal(sectionUrl(resolved.section, resolved.mode), "/?section=%D0%9F%D0%BB%D0%B0%D0%BD");
});

test("Аналитика без mode остаётся Insights, mode в URL не добавляется", () => {
  const resolved = resolve("/?section=" + encodeURIComponent("Аналитика"));
  assert.deepEqual(resolved, { section: "Аналитика", mode: "insights" });
  assert.equal(sectionUrl(resolved.section, resolved.mode), "/?section=" + encodeURIComponent("Аналитика"));
});

test("Аналитика с mode=coach сохраняет &mode=coach в каноническом URL", () => {
  const resolved = resolve("/?section=" + encodeURIComponent("Аналитика") + "&mode=coach");
  assert.deepEqual(resolved, { section: "Аналитика", mode: "coach" });
  assert.equal(sectionUrl(resolved.section, resolved.mode), "/?section=" + encodeURIComponent("Аналитика") + "&mode=coach");
});

test("mode=coach вне Аналитики игнорируется", () => {
  const resolved = resolve("/?section=" + encodeURIComponent("План") + "&mode=coach");
  assert.deepEqual(resolved, { section: "План", mode: "insights" });
});

// Мини-модель ровно того же правила, что использует app/page.tsx в трёх местах
// (начальная канонизация -> replaceState, переход по nav -> pushState,
// popstate -> только чтение): "не трогать историю, если целевой URL уже
// совпадает с текущим". Здесь она проверяется на реальной последовательности
// действий без рендера React/DOM — jsdom в проекте не используется.
class FakeBrowserHistory {
  stack: string[];
  index: number;
  constructor(initialUrl: string) {
    this.stack = [initialUrl];
    this.index = 0;
  }
  get location() { return this.stack[this.index]; }
  pushState(url: string) {
    this.stack = this.stack.slice(0, this.index + 1).concat(url);
    this.index = this.stack.length - 1;
  }
  replaceState(url: string) { this.stack[this.index] = url; }
  back() { this.index = Math.max(0, this.index - 1); }
  forward() { this.index = Math.min(this.stack.length - 1, this.index + 1); }
}

function pushIfChanged(browser: FakeBrowserHistory, section: Parameters<typeof sectionUrl>[0], mode: Parameters<typeof sectionUrl>[1]) {
  const url = sectionUrl(section, mode);
  if (browser.location !== url) browser.pushState(url);
}

test("Back/Forward воспроизводят разделы без лишних записей истории и без двойного Back", () => {
  const browser = new FakeBrowserHistory("/");

  // Начальная канонизация (mount): текущий URL уже канонический ("/"), запись
  // истории не создаётся.
  const initial = resolve(browser.location);
  const canonical = sectionUrl(initial.section, initial.mode);
  if (browser.location !== canonical) browser.replaceState(canonical);
  assert.equal(browser.stack.length, 1);

  // Пользователь переходит: Сегодня -> План -> Дорожная карта (2 push).
  pushIfChanged(browser, "План", "insights");
  pushIfChanged(browser, "Дорожная карта", "insights");
  assert.deepEqual(browser.stack, ["/", "/?section=%D0%9F%D0%BB%D0%B0%D0%BD", "/?section=" + encodeURIComponent("Дорожная карта")]);
  assert.equal(browser.index, 2);

  // Back: popstate резолвит состояние из уже изменённого браузером URL, затем
  // "эффект" пытается синхронизировать URL под текущее состояние — раз они уже
  // совпадают, новой записи быть не должно.
  browser.back();
  const afterFirstBack = resolve(browser.location);
  assert.deepEqual(afterFirstBack, { section: "План", mode: "insights" });
  pushIfChanged(browser, afterFirstBack.section, afterFirstBack.mode);
  assert.equal(browser.stack.length, 3, "первый Back не должен добавлять запись в историю");
  assert.equal(browser.index, 1);

  // Второй Back — до Home; тоже без лишней записи и без необходимости жать
  // Back дважды ради одного шага.
  browser.back();
  const afterSecondBack = resolve(browser.location);
  assert.deepEqual(afterSecondBack, { section: "Сегодня", mode: "insights" });
  pushIfChanged(browser, afterSecondBack.section, afterSecondBack.mode);
  assert.equal(browser.stack.length, 3);
  assert.equal(browser.index, 0);

  // Forward x2 возвращает на Дорожную карту, снова без роста стека.
  browser.forward();
  pushIfChanged(browser, resolve(browser.location).section, resolve(browser.location).mode);
  browser.forward();
  pushIfChanged(browser, resolve(browser.location).section, resolve(browser.location).mode);
  assert.equal(browser.stack.length, 3);
  assert.equal(browser.index, 2);
  assert.deepEqual(resolve(browser.location), { section: "Дорожная карта", mode: "insights" });
});
