"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Локальная навигация внутри VOLT Swim — единственная (не дублирует
// глобальный VOLT-сайдбар). Показывает утверждённые контекстные разделы
// (docs/volt-swim/VOLT_SWIM_DESIGN_CONTRACT.md §Navigation); реализованы
// Главная, План тренировок, История и Аналитика, остальные помечены «Скоро»
// без выдуманной функциональности за ними.
const LIVE_ITEMS = [
  { href: "/swim", label: "Главная", match: (pathname: string) => pathname === "/swim" },
  { href: "/swim/workouts", label: "План тренировок", match: (pathname: string) => pathname === "/swim/workouts" || pathname.startsWith("/swim/workouts/") },
  { href: "/swim/history", label: "История", match: (pathname: string) => pathname === "/swim/history" },
  { href: "/swim/analytics", label: "Аналитика", match: (pathname: string) => pathname === "/swim/analytics" },
] as const;
const FUTURE_ITEMS = ["Рекорды", "AI Coach"] as const;

export function SwimNavigation() {
  const pathname = usePathname();
  return (
    <nav className="swim-local-nav" aria-label="Навигация VOLT Swim">
      {LIVE_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
      {FUTURE_ITEMS.map((label) => (
        <span key={label} className="swim-local-nav-soon" aria-disabled="true">
          {label}
          <span className="swim-local-nav-soon-badge">Скоро</span>
        </span>
      ))}
    </nav>
  );
}
