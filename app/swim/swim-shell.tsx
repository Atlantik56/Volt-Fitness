import type { ReactNode } from "react";
import { SwimGlobalNav } from "./swim-global-nav";

export function SwimShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell swim-shell">
      <SwimGlobalNav />
      <section className="swim-content" id="top">
        {children}
      </section>
    </main>
  );
}
