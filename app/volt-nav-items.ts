import { Apple, CalendarDays, ChartColumn, ChartNoAxesCombined, Home, Moon, Route, UserRound } from "lucide-react";

// Плейн-модуль (не .tsx) — это позволяет чистой логике URL-резолвинга
// (app/nav-url.ts) и её тестам импортировать VOLT_NAV_ITEMS/VoltSection без
// JSX-парсинга. VoltGlobalNavigation (app/volt-global-navigation.tsx)
// ре-экспортирует их для обратной совместимости импортов.
//
// `primary: false` — раздел остаётся валидным VoltSection (deep link,
// переход с Home) и открывается через тот же side-nav/mobile-drawer, но не
// входит в утверждённую семёрку глобальных destinations, поэтому рендерится
// отдельной группой ниже, а не в основном списке.
export const VOLT_NAV_ITEMS = [
  { id: "Сегодня", label: "Сегодня", icon: Home, primary: true },
  { id: "План", label: "План", icon: CalendarDays, primary: true },
  { id: "Дорожная карта", label: "Дорожная карта", icon: Route, primary: true },
  { id: "Питание", label: "Nutrition Hub", icon: Apple, primary: true },
  { id: "Аналитика", label: "Аналитика", icon: ChartNoAxesCombined, primary: true },
  { id: "Вечерний прогресс", label: "Вечерний прогресс", icon: Moon, primary: false },
  { id: "Моя история", label: "Мой путь", icon: ChartColumn, primary: true },
  { id: "Профиль и настройки", label: "Профиль и настройки", icon: UserRound, primary: true },
] as const;

export type VoltSection = (typeof VOLT_NAV_ITEMS)[number]["id"];
