"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Apple, BarChart3, Bot, ChevronDown, ChevronRight, Dumbbell, HeartPulse, History, Home, Settings, Waves } from "lucide-react";

export function SwimGlobalNav() {
  const pathname = usePathname();
  const [name, setName] = useState("Профиль");
  useEffect(() => { fetch("/api/fitness").then((response) => response.ok ? response.json() : null).then((data) => { if (data?.profile?.name) setName(data.profile.name); }).catch(() => {}); }, []);
  return <>
    <aside className="swim-global-sidebar">
      <Link className="swim-global-brand" href="/" aria-label="VOLT — на главную"><span>V</span><b>VOLT</b></Link>
      <nav aria-label="Основная навигация VOLT">
        <Link href="/"><Home />Главная</Link>
        <div className="swim-nav-group open"><span><Dumbbell />Тренировки <ChevronDown /></span><Link href="/">Силовые</Link><Link href="/swim" className="active"><Waves />Swim <i /></Link><Link href="/">Bike</Link><Link href="/">Run</Link></div>
        <Link href="/"><Apple />Питание</Link>
        <Link href="/"><History />История</Link>
        <Link href="/"><BarChart3 />Аналитика</Link>
        <Link href="/"><HeartPulse />Здоровье</Link>
        <Link href="/"><Bot />AI Coach</Link>
        <Link href="/"><Settings />Настройки</Link>
      </nav>
      <div className="swim-sidebar-bottom">
        <Link href="/" className="swim-profile-card"><span>{name.slice(0, 1).toUpperCase()}</span><b>{name}</b><ChevronRight /></Link>
        <div className="swim-readiness-mini"><div><small>Готовность</small><b>Нет данных</b></div><Activity /></div>
        <span className="swim-sidebar-signature">V VOLT</span>
      </div>
    </aside>
    <nav className="mobile-nav" aria-label="Мобильная навигация"><Link href="/"><Home />VOLT</Link><Link href="/swim" className={pathname === "/swim" ? "active" : undefined}><Waves />Swim</Link><Link href="/swim/workouts" className={pathname.startsWith("/swim/workouts") ? "active" : undefined}><Dumbbell />План</Link><Link href="/swim/history" className={pathname === "/swim/history" ? "active" : undefined}><History />История</Link><Link href="/"><Settings />Ещё</Link></nav>
  </>;
}
