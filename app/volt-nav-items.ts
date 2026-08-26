import { Apple, CalendarDays, ChartColumn, ChartNoAxesCombined, Home, Moon, Route, UserRound } from "lucide-react";

// `primary: false` сохраняет раздел как валидный deep link и destination,
// но не занимает место в основном списке глобальной навигации.
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
