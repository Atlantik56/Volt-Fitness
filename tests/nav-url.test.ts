import assert from "node:assert/strict";
import test from "node:test";
import { resolveSectionFromQuery, sectionUrl } from "@/app/nav-url.ts";

const resolve = (url: string) => resolveSectionFromQuery(new URLSearchParams(url.split("?")[1] ?? ""));

test("Home и неизвестный section канонизируются в /", () => {
  assert.deepEqual(resolve("/"), { section: "Сегодня", mode: "insights" });
  assert.deepEqual(resolve("/?section=НесуществующийРаздел"), { section: "Сегодня", mode: "insights" });
  assert.equal(sectionUrl("Сегодня", "insights"), "/");
});

test("валидный раздел сохраняется в каноническом URL", () => {
  const resolved = resolve("/?section=" + encodeURIComponent("План"));
  assert.deepEqual(resolved, { section: "План", mode: "insights" });
  assert.equal(sectionUrl(resolved.section, resolved.mode), "/?section=" + encodeURIComponent("План"));
});

test("mode=coach сохраняется только для Аналитики", () => {
  const analytics = resolve("/?section=" + encodeURIComponent("Аналитика") + "&mode=coach");
  assert.deepEqual(analytics, { section: "Аналитика", mode: "coach" });
  assert.equal(sectionUrl(analytics.section, analytics.mode), "/?section=" + encodeURIComponent("Аналитика") + "&mode=coach");
  assert.deepEqual(resolve("/?section=" + encodeURIComponent("План") + "&mode=coach"), { section: "План", mode: "insights" });
});

class FakeBrowserHistory {
  stack: string[];
  index = 0;
  constructor(initialUrl: string) { this.stack = [initialUrl] }
  get location() { return this.stack[this.index] }
  pushState(url: string) {
    this.stack = this.stack.slice(0, this.index + 1).concat(url);
    this.index = this.stack.length - 1;
  }
  back() { this.index = Math.max(0, this.index - 1) }
  forward() { this.index = Math.min(this.stack.length - 1, this.index + 1) }
}

function pushIfChanged(browser: FakeBrowserHistory, section: Parameters<typeof sectionUrl>[0], mode: Parameters<typeof sectionUrl>[1]) {
  const url = sectionUrl(section, mode);
  if (browser.location !== url) browser.pushState(url);
}

test("Back/Forward восстанавливают разделы без добавочных history entries", () => {
  const browser = new FakeBrowserHistory("/");
  pushIfChanged(browser, "План", "insights");
  pushIfChanged(browser, "Дорожная карта", "insights");
  assert.equal(browser.stack.length, 3);

  browser.back();
  const firstBack = resolve(browser.location);
  pushIfChanged(browser, firstBack.section, firstBack.mode);
  assert.deepEqual(firstBack, { section: "План", mode: "insights" });
  assert.equal(browser.stack.length, 3);

  browser.back();
  const secondBack = resolve(browser.location);
  pushIfChanged(browser, secondBack.section, secondBack.mode);
  assert.deepEqual(secondBack, { section: "Сегодня", mode: "insights" });
  assert.equal(browser.stack.length, 3);

  browser.forward();
  browser.forward();
  assert.deepEqual(resolve(browser.location), { section: "Дорожная карта", mode: "insights" });
});
