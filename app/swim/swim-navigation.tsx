"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Локальная навигация внутри VOLT Swim — единственная (не дублирует
// глобальный VOLT-сайдбар). Показывает утверждённые контекстные разделы
// (docs/volt-swim/VOLT_SWIM_DESIGN_CONTRACT.md §Navigation); реализованы
// Главная, План тренировок, История, Аналитика, Рекорды и AI Coach.
const LIVE_ITEMS = [
  { href: "/swim", label: "Главная", match: (pathname: string) => pathname === "/swim" },
  { href: "/swim/workouts", label: "План тренировок", match: (pathname: string) => pathname === "/swim/workouts" || pathname.startsWith("/swim/workouts/") },
  { href: "/swim/history", label: "История", match: (pathname: string) => pathname === "/swim/history" },
  { href: "/swim/analytics", label: "Аналитика", match: (pathname: string) => pathname === "/swim/analytics" },
  { href: "/swim/records", label: "Рекорды", match: (pathname: string) => pathname === "/swim/records" },
  { href: "/swim/coach", label: "AI Coach", match: (pathname: string) => pathname === "/swim/coach" },
] as const;

export function SwimNavigation() {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const navigation = navigationRef.current;
      const activeItem = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!navigation || !activeItem) return;

      const navigationRect = navigation.getBoundingClientRect();
      const activeRect = activeItem.getBoundingClientRect();
      let nextScrollLeft = navigation.scrollLeft;

      if (activeRect.left < navigationRect.left) {
        nextScrollLeft -= navigationRect.left - activeRect.left;
      } else if (activeRect.right > navigationRect.right) {
        nextScrollLeft += activeRect.right - navigationRect.right;
      } else {
        return;
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      navigation.scrollTo({ left: Math.max(0, nextScrollLeft), behavior: reducedMotion ? "auto" : "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <nav ref={navigationRef} className="swim-local-nav" aria-label="Навигация RITMOVIS Swim">
      {LIVE_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
