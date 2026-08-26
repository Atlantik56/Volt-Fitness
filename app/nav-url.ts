import { VOLT_NAV_ITEMS, type VoltSection } from "./volt-nav-items.ts";

export type AnalyticsMode = "insights" | "coach";

// Единственное место, строящее канонический URL раздела — используется и при
// начальной нормализации (replaceState), и при последующей навигации
// (pushState), чтобы оба места не могли разойтись в формате.
export function sectionUrl(section: VoltSection, mode: AnalyticsMode): string {
  if (section === "Сегодня") return "/";
  const modeSuffix = section === "Аналитика" && mode === "coach" ? "&mode=coach" : "";
  return `/?section=${encodeURIComponent(section)}${modeSuffix}`;
}

// Обратная операция: из query-параметров текущего URL восстанавливает
// валидное состояние раздела. Неизвестный/отсутствующий section безопасно
// схлопывается в "Сегодня" (Home) — тот же fallback, что используется для
// невалидных deep links.
export function resolveSectionFromQuery(query: URLSearchParams): { section: VoltSection; mode: AnalyticsMode } {
  const raw = query.get("section");
  const section: VoltSection = raw && VOLT_NAV_ITEMS.some((item) => item.id === raw) ? (raw as VoltSection) : "Сегодня";
  const mode: AnalyticsMode = section === "Аналитика" && query.get("mode") === "coach" ? "coach" : "insights";
  return { section, mode };
}
