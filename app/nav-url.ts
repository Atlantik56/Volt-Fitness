import { VOLT_NAV_ITEMS, type VoltSection } from "./volt-nav-items.ts";

export type AnalyticsMode = "insights" | "coach";

export function sectionUrl(section: VoltSection, mode: AnalyticsMode): string {
  if (section === "Сегодня") return "/";
  const modeSuffix = section === "Аналитика" && mode === "coach" ? "&mode=coach" : "";
  return `/?section=${encodeURIComponent(section)}${modeSuffix}`;
}

export function resolveSectionFromQuery(query: URLSearchParams): { section: VoltSection; mode: AnalyticsMode } {
  const raw = query.get("section");
  const section: VoltSection = raw && VOLT_NAV_ITEMS.some((item) => item.id === raw) ? (raw as VoltSection) : "Сегодня";
  const mode: AnalyticsMode = section === "Аналитика" && query.get("mode") === "coach" ? "coach" : "insights";
  return { section, mode };
}
