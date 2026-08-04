"use client";
import Link from "next/link";
import { Apple, CalendarDays, ChartColumn, Home as HomeIcon, Moon, Route, Waves } from "lucide-react";

// Отражает ту же боковую/мобильную навигацию, что и app/page.tsx (общие CSS-классы
// .sidebar/.side-nav/.mobile-nav), но пункты — обычные ссылки на "/", а не
// переключатели локального state: /swim ещё не умеет управлять табами на "/".
// Один и тот же логический sidebar на экран — здесь не второй постоянный rail,
// а тот же самый, показанный для маршрута /swim.
const HOME_NAV_ITEMS = [
  ["Сегодня", "⌂", HomeIcon],
  ["План", "▦", CalendarDays],
  ["Дорожная карта", "⌁", Route],
  ["Питание", "◒", Apple],
  ["Вечерний прогресс", "☾", Moon],
  ["Моя история", "◎", ChartColumn],
] as const;

export function SwimGlobalNav() {
  return (
    <>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="VOLT — на главную">
          <span className="brand-mark">V</span>
          <b>VOLT</b>
        </Link>
        <nav className="side-nav" aria-label="Основная навигация">
          {HOME_NAV_ITEMS.map(([label, icon]) => (
            <Link key={label} href="/">
              <span>{icon}</span>
              {label}
            </Link>
          ))}
          <Link href="/swim" className="active">
            <span aria-hidden="true">
              <Waves size={18} strokeWidth={2} style={{ verticalAlign: "middle" }} />
            </span>
            VOLT Swim
          </Link>
        </nav>
      </aside>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {HOME_NAV_ITEMS.map(([label, , Icon]) => (
          <Link key={label} href="/">
            <span aria-hidden="true">
              <Icon size={20} strokeWidth={2} />
            </span>
            {label === "Дорожная карта" ? "Карта" : label === "Вечерний прогресс" ? "Вечер" : label === "Моя история" ? "История" : label}
          </Link>
        ))}
        <Link href="/swim" className="active">
          <span aria-hidden="true">
            <Waves size={20} strokeWidth={2} />
          </span>
          Swim
        </Link>
      </nav>
    </>
  );
}
