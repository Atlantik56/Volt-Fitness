"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LIVE_ITEMS = [
  { href: "/swim", label: "Главная" },
  { href: "/swim/workouts", label: "Тренировки" },
] as const;
// Разделы за пределами Sprint 1 — честно помечены «Скоро», без выдуманных
// данных под ними (docs/volt-swim/SPRINTS.md: "не создавай фальшивую
// функциональность").
const FUTURE_ITEMS = ["История", "Аналитика", "Рекорды", "AI Coach"] as const;

export function SwimNavigation() {
  const pathname = usePathname();
  return (
    <nav className="swim-nav" aria-label="Навигация VOLT Swim">
      {LIVE_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
      {FUTURE_ITEMS.map((label) => (
        <span key={label} className="swim-nav-soon" aria-disabled="true">
          {label}
          <span className="swim-nav-soon-badge">Скоро</span>
        </span>
      ))}
    </nav>
  );
}
