"use client";

import type { MouseEvent, ReactNode } from "react";
import { APP_NAME, APP_MOTTO } from "@/lib/brand";
import { useState } from "react";
import Link from "next/link";
import { Bike, CalendarDays, Home, Menu, Waves } from "lucide-react";
import { VOLT_NAV_ITEMS, type VoltSection } from "./volt-nav-items";

export { VOLT_NAV_ITEMS, type VoltSection };
export type VoltEnvironment = "volt" | "swim" | "cycling";

type Props = {
  environment: VoltEnvironment;
  activeSection?: VoltSection;
  onNavigate?: (section: VoltSection) => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  footer?: ReactNode;
};

const sectionHref = (section: VoltSection) => section === "Сегодня"
  ? "/"
  : `/?section=${encodeURIComponent(section)}`;

export function VoltGlobalNavigation({
  environment,
  activeSection,
  onNavigate,
  mobileOpen,
  onMobileOpenChange,
  footer,
}: Props) {
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const isMobileOpen = mobileOpen ?? internalMobileOpen;
  const setMobileOpen = (open: boolean) => {
    setInternalMobileOpen(open);
    onMobileOpenChange?.(open);
  };

  const openSection = (event: MouseEvent<HTMLAnchorElement>, section: VoltSection) => {
    if (onNavigate) {
      event.preventDefault();
      onNavigate(section);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setMobileOpen(false);
  };

  const openHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      event.preventDefault();
      onNavigate("Сегодня");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setMobileOpen(false);
  };

  const moreIsActive = environment === "volt"
    && activeSection !== undefined
    && activeSection !== "Сегодня"
    && activeSection !== "План";

  return <>
    <button
      type="button"
      className={`mobile-sidebar-backdrop${isMobileOpen ? " visible" : ""}`}
      aria-label="Закрыть глобальную навигацию"
      onClick={() => setMobileOpen(false)}
    />
    <aside
      className={`sidebar volt-global-sidebar volt-global-sidebar--${environment}${isMobileOpen ? " mobile-open" : ""}`}
      data-environment={environment}
    >
      <Link className="brand" href="/" aria-label="RITMOVIS — на главную" onClick={openHome}>
        <span className="brand-mark ritmovis-mark" aria-hidden="true" /><b>{APP_NAME}</b>
      </Link>
      <p className="brand-sub">{APP_MOTTO}</p>
      <button
        type="button"
        className="mobile-sidebar-close"
        aria-label="Закрыть глобальную навигацию"
        onClick={() => setMobileOpen(false)}
      >×</button>

      <nav className="side-nav" aria-label="Глобальная навигация RITMOVIS">
        {VOLT_NAV_ITEMS.filter(item => item.primary).map(({ id, label, icon: Icon }) => {
          const active = environment === "volt" && activeSection === id;
          return <Link
            key={id}
            href={sectionHref(id)}
            data-tour-id={id === "Моя история" ? "nav-progress" : id === "Аналитика" ? "nav-analytics" : undefined}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={(event) => openSection(event, id)}
          ><span aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>{label}</Link>;
        })}

        <span className="side-nav-divider">Дополнительно</span>
        {VOLT_NAV_ITEMS.filter(item => !item.primary).map(({ id, label, icon: Icon }) => {
          const active = environment === "volt" && activeSection === id;
          return <Link
            key={id}
            href={sectionHref(id)}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={(event) => openSection(event, id)}
          ><span aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>{label}</Link>;
        })}

        <span className="side-nav-divider">Мои модули</span>
        <Link href="/swim" className={environment === "swim" ? "active module-active" : undefined} aria-current={environment === "swim" ? "page" : undefined} onClick={() => setMobileOpen(false)}>
          <span aria-hidden="true"><Waves size={18} strokeWidth={2} /></span>RITMOVIS Swim
        </Link>
        <Link href="/cycling" className={environment === "cycling" ? "active module-active" : undefined} aria-current={environment === "cycling" ? "page" : undefined} onClick={() => setMobileOpen(false)}>
          <span aria-hidden="true"><Bike size={18} strokeWidth={2} /></span>RITMOVIS Cycling
        </Link>
      </nav>

      {footer && <div className="side-bottom">{footer}</div>}
    </aside>

    <nav className={`mobile-nav volt-mobile-nav volt-mobile-nav--${environment}`} aria-label="Мобильная навигация RITMOVIS">
      <Link href="/" className={environment === "volt" && activeSection === "Сегодня" ? "active" : undefined} aria-current={environment === "volt" && activeSection === "Сегодня" ? "page" : undefined} onClick={(event) => openSection(event, "Сегодня")}>
        <span aria-hidden="true"><Home size={20} strokeWidth={2} /></span>Сегодня
      </Link>
      <Link href="/?section=План" className={environment === "volt" && activeSection === "План" ? "active" : undefined} aria-current={environment === "volt" && activeSection === "План" ? "page" : undefined} onClick={(event) => openSection(event, "План")}>
        <span aria-hidden="true"><CalendarDays size={20} strokeWidth={2} /></span>План
      </Link>
      <Link href="/swim" className={environment === "swim" ? "active module-active" : undefined} aria-current={environment === "swim" ? "page" : undefined}>
        <span aria-hidden="true"><Waves size={20} strokeWidth={2} /></span>Swim
      </Link>
      <Link href="/cycling" className={environment === "cycling" ? "active module-active" : undefined} aria-current={environment === "cycling" ? "page" : undefined}>
        <span aria-hidden="true"><Bike size={20} strokeWidth={2} /></span>Cycling
      </Link>
      <button
        type="button"
        data-tour-id="mobile-nav-more"
        className={moreIsActive ? "active" : undefined}
        aria-label="Открыть все разделы RITMOVIS"
        aria-expanded={isMobileOpen}
        onClick={() => setMobileOpen(true)}
      ><span aria-hidden="true"><Menu size={20} strokeWidth={2} /></span>Ещё</button>
    </nav>
  </>;
}
